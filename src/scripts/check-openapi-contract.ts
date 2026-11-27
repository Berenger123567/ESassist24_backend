import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

type Schema = {
  $ref?: string;
  allOf?: unknown[];
  anyOf?: unknown[];
  default?: unknown;
  discriminator?: { propertyName?: string };
  enum?: unknown[];
  oneOf?: unknown[];
  properties?: Record<string, Schema>;
  required?: string[];
  type?: string;
  nullable?: boolean;
  additionalProperties?: unknown;
};

type Parameter = {
  in?: string;
  name?: string;
  required?: boolean;
};

type Response = {
  content?: Record<string, { schema?: Schema }>;
};

type Operation = {
  deprecated?: boolean;
  parameters?: Parameter[];
  responses?: Record<string, Response>;
};

type OpenApiContract = {
  info: { version?: string };
  paths: Record<string, Record<string, Operation>>;
  components?: { schemas?: Record<string, Schema> };
  'x-contract-version'?: string;
};

const requiredErrorCodes = [
  'INVALID_STATUS_TRANSITION',
  'IP_NOT_ALLOWED',
  'IDEMPOTENCY_CONFLICT',
  'DOCUMENT_NOT_AVAILABLE',
  'SERVICE_REQUEST_NOT_FOUND',
  'DOCUMENT_NOT_BREAKDOWN_PHOTO',
  'PROFESSIONAL_NOT_ELIGIBLE',
  'FAVORITE_ALREADY_EXISTS',
  'PROPOSAL_ALREADY_EXISTS',
  'MISSION_NOT_PARTICIPANT',
  'ARRIVAL_CODE_INVALID',
  'ARRIVAL_CODE_EXPIRED',
  'ARRIVAL_CODE_ALREADY_USED',
  'CONVERSATION_NOT_PARTICIPANT',
  'MESSAGE_NOT_OWNED',
  'QUOTE_NOT_SUBMITTED',
  'QUOTE_EXPIRED',
  'WORK_NOT_AUTHORIZED',
  'POSITION_TOO_SOON',
  'CHECKLIST_CRITICAL_FAILED',
  'PAYMENT_INTENT_NOT_FOUND',
  'PAYMENT_INTENT_NOT_OWNED',
  'PAYMENT_ALREADY_CONFIRMED',
  'PAYMENT_PROVIDER_ERROR',
  'PAYMENT_WEBHOOK_SIGNATURE_INVALID',
  'PAYMENT_WEBHOOK_REPLAYED',
  'PAYMENT_AMOUNT_MISMATCH',
  'LEDGER_INCONSISTENT',
  'LEDGER_ENTRY_IMMUTABLE',
  'COMMISSION_RATE_NOT_FOUND',
  'FEE_NOT_FOUND',
  'SUBSCRIPTION_REQUIRED',
  'SUBSCRIPTION_EXPIRED',
  'SUBSCRIPTION_ALREADY_ACTIVE',
  'RECONCILIATION_NOT_FOUND',
  'RECONCILIATION_DISCREPANCY',
  'REVIEW_NOT_ALLOWED',
  'REVIEW_ALREADY_EXISTS',
  'REVIEW_SUSPICIOUS',
  'REVIEW_RESPONSE_NOT_ALLOWED',
  'REVIEW_CONTEST_NOT_ALLOWED',
  'CLAIM_NOT_FOUND',
  'CLAIM_SLA_BREACHED',
  'GUARANTEE_NOT_FOUND',
  'GUARANTEE_EXPIRED',
  'SUSPENSION_NOT_FOUND',
  'APPEAL_NOT_ALLOWED',
  'LEGAL_DOCUMENT_NOT_FOUND',
  'LEGAL_CONSENT_REQUIRED',
  'BACKUP_VERIFICATION_FAILED',
];

const errors: string[] = [];

function expect(condition: unknown, message: string): void {
  if (!condition) {
    errors.push(message);
  }
}

function walkNullableObjects(node: unknown, path: string): void {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((value, index) => walkNullableObjects(value, `${path}/${index}`));
    return;
  }
  const object = node as Record<string, unknown>;
  if (object.nullable === true && object.type === 'object') {
    const allowed =
      object.additionalProperties === true ||
      Boolean(object.properties) ||
      Array.isArray(object.allOf) ||
      Array.isArray(object.oneOf) ||
      Array.isArray(object.anyOf) ||
      Boolean(object.$ref);
    expect(allowed, `${path}: nullable object sans type explicite`);
  }
  for (const [key, value] of Object.entries(object)) {
    walkNullableObjects(value, `${path}/${key}`);
  }
}

async function main(): Promise<void> {
  const raw = await readFile(join(process.cwd(), 'docs', 'openapi.json'), 'utf8');
  const contract = JSON.parse(raw) as OpenApiContract;
  const schemas = contract.components?.schemas ?? {};
  const expectedVersion = process.env.CONTRAT_VERSION ?? '1.2.0';
  const operation = (path: string, method: string): Operation =>
    contract.paths[path]?.[method] ?? {};

  expect(contract.info.version === expectedVersion, 'info.version doit être CONTRAT_VERSION');
  expect(
    contract['x-contract-version'] === expectedVersion,
    'x-contract-version doit être CONTRAT_VERSION',
  );
  walkNullableObjects(contract, 'contract');

  for (const [path, methods] of Object.entries(contract.paths)) {
    for (const [method, endpoint] of Object.entries(methods)) {
      const headers = (endpoint.parameters ?? []).filter((parameter) => parameter.in === 'header');
      const names = headers.map((parameter) => parameter.name ?? '');
      for (const name of names) {
        expect(name === name.toLowerCase(), `${method} ${path}: header non canonique ${name}`);
        expect(name !== 'user-agent', `${method} ${path}: user-agent ne doit pas être documenté`);
      }
      expect(
        new Set(names).size === names.length,
        `${method} ${path}: headers dupliqués ${names.join(', ')}`,
      );
      for (const header of headers) {
        expect(
          !header.required || header.name === 'idempotency-key',
          `${method} ${path}: header requis inutile ${header.name ?? ''}`,
        );
      }
    }
  }

  const otpSchema = schemas.RequestOtpDto ?? {};
  expect(
    !(otpSchema.required ?? []).includes('channel'),
    'RequestOtpDto.channel doit rester optionnel',
  );
  expect(otpSchema.properties?.channel?.default === 'SMS', 'OTP channel doit défaut SMS');

  expect(
    (schemas.AcceptAdminInvitationDto?.required ?? []).includes('token'),
    'AcceptAdminInvitationDto.token doit rester dans le corps',
  );
  expect(
    !contract.paths['/api/v1/admin/invitations/accept/{token}'],
    'La route d’acceptation par token de path ne doit pas être exposée',
  );

  expect(
    schemas.ErrorCode?.enum?.some((code) => code === 'VALIDATION_ERROR'),
    'ErrorCode doit exposer VALIDATION_ERROR',
  );
  for (const code of requiredErrorCodes) {
    expect(schemas.ErrorCode?.enum?.includes(code), `ErrorCode doit exposer ${code}`);
  }

  const loginResponse = operation('/api/v1/admin/auth/login', 'post').responses?.['200']?.content?.[
    'application/json'
  ]?.schema;
  expect(Array.isArray(loginResponse?.oneOf), 'Login admin doit retourner oneOf');
  expect(
    loginResponse?.discriminator?.propertyName === 'mfaRequired',
    'Login admin doit être discriminé par mfaRequired',
  );

  const viewUrl = schemas.DocumentViewUrlResponseDto ?? {};
  expect(Boolean(viewUrl.properties?.viewUrl), 'DocumentViewUrlResponseDto.viewUrl est requis');
  expect(
    (viewUrl.required ?? []).includes('viewUrl') &&
      (viewUrl.required ?? []).includes('expiresInSeconds'),
    'DocumentViewUrlResponseDto doit requérir viewUrl et expiresInSeconds',
  );
  expect(
    operation('/api/v1/admin/documents/{id}/view-url', 'get').responses?.['200']?.content?.[
      'application/json'
    ]?.schema?.$ref === '#/components/schemas/DocumentViewUrlResponseDto',
    'view-url doit référencer DocumentViewUrlResponseDto',
  );

  expect(
    operation('/api/v1/pro/profile', 'get').deprecated !== true &&
      operation('/api/v1/pro/profile', 'put').deprecated !== true,
    '/pro/profile doit rester canonique',
  );
  expect(
    operation('/api/v1/me/professional-profile', 'get').deprecated === true &&
      operation('/api/v1/professionals/me', 'get').deprecated === true,
    'Les alias profil pro doivent être dépréciés',
  );

  const aliases: Array<[string, string]> = [
    ['/api/v1/devices', 'get'],
    ['/api/v1/notifications/{id}/read', 'post'],
    ['/api/v1/pro/certification', 'post'],
    ['/api/v1/admin/evaluation-grids/{id}', 'delete'],
    ['/api/v1/admin/evaluators', 'post'],
    ['/api/v1/evaluator/assignments/{id}', 'patch'],
  ];
  for (const [path, method] of aliases) {
    expect(operation(path, method).deprecated === true, `${method} ${path} doit être déprécié`);
  }
  expect(Boolean(schemas.EvaluationResponseDto), 'EvaluationResponseDto doit être exposé');

  const requiredRoutes: Array<[string, string]> = [
    ['/api/v1/service-requests', 'post'],
    ['/api/v1/service-requests/mine', 'get'],
    ['/api/v1/service-requests/{id}', 'get'],
    ['/api/v1/service-requests/{id}/cancel', 'post'],
    ['/api/v1/professionals/search', 'get'],
    ['/api/v1/professionals/{id}/public', 'get'],
    ['/api/v1/professionals/{id}/favorite', 'post'],
    ['/api/v1/professionals/{id}/favorite', 'delete'],
    ['/api/v1/professionals/favorites', 'get'],
    ['/api/v1/pro/availability', 'patch'],
    ['/api/v1/service-requests/{id}/proposals', 'post'],
    ['/api/v1/service-requests/{id}/proposals', 'get'],
    ['/api/v1/proposals/{id}/accept', 'post'],
    ['/api/v1/missions', 'get'],
    ['/api/v1/missions/{id}', 'get'],
    ['/api/v1/missions/{id}/arrival-code', 'post'],
    ['/api/v1/missions/{id}/arrival-code/verify', 'post'],
    ['/api/v1/missions/{id}/reassign', 'post'],
    ['/api/v1/conversations', 'get'],
    ['/api/v1/conversations/{id}/messages', 'get'],
    ['/api/v1/conversations/{id}/messages', 'post'],
    ['/api/v1/conversations/{id}/messages/{messageId}', 'delete'],
    ['/api/v1/conversations/{id}/read', 'post'],
    ['/api/v1/missions/{id}/quotes', 'post'],
    ['/api/v1/missions/{id}/quotes', 'get'],
    ['/api/v1/quotes/{id}/accept', 'post'],
    ['/api/v1/quotes/{id}/reject', 'post'],
    ['/api/v1/missions/{id}/authorize-emergency', 'post'],
    ['/api/v1/missions/{id}/events', 'post'],
    ['/api/v1/missions/{id}/positions', 'post'],
    ['/api/v1/missions/{id}/report', 'post'],
    ['/api/v1/missions/{id}/report', 'get'],
    ['/api/v1/missions/{id}/close', 'post'],
    ['/api/v1/payments/missions/{id}/intent', 'post'],
    ['/api/v1/payments/{id}', 'get'],
    ['/api/v1/payments/{id}/confirm', 'post'],
    ['/api/v1/webhooks/payments/cinetpay', 'post'],
    ['/api/v1/payments/reconciliation', 'get'],
    ['/api/v1/subscriptions', 'post'],
    ['/api/v1/subscriptions/mine', 'get'],
    ['/api/v1/subscriptions/{id}/cancel', 'post'],
    ['/api/v1/admin/subscriptions', 'get'],
    ['/api/v1/ledger/me', 'get'],
    ['/api/v1/ledger/me/entries', 'get'],
    ['/api/v1/missions/{id}/reviews', 'post'],
    ['/api/v1/professionals/{id}/reviews', 'get'],
    ['/api/v1/reviews/{id}/response', 'post'],
    ['/api/v1/reviews/{id}/contest', 'post'],
    ['/api/v1/professionals/{id}/reputation', 'get'],
    ['/api/v1/claims', 'post'],
    ['/api/v1/claims', 'get'],
    ['/api/v1/claims/mine', 'get'],
    ['/api/v1/claims/{id}', 'get'],
    ['/api/v1/missions/{id}/guarantee', 'get'],
    ['/api/v1/suspensions/{id}/appeal', 'post'],
    ['/api/v1/admin/reputation/indicators', 'get'],
    ['/api/v1/admin/claims', 'get'],
    ['/api/v1/admin/claims/{id}/acknowledge', 'post'],
    ['/api/v1/admin/claims/{id}/resolve', 'post'],
    ['/api/v1/admin/claims/{id}/escalate', 'post'],
    ['/api/v1/admin/guarantees', 'get'],
    ['/api/v1/admin/professionals/{id}/suspend', 'post'],
    ['/api/v1/admin/suspensions', 'get'],
    ['/api/v1/admin/suspensions/{id}/lift', 'post'],
    ['/api/v1/admin/suspensions/{id}/appeal/decide', 'post'],
    ['/api/v1/legal/documents/{type}/latest', 'get'],
    ['/api/v1/legal/documents/{type}/{version}', 'get'],
    ['/api/v1/legal/documents', 'post'],
    ['/api/v1/legal/consents', 'post'],
    ['/api/v1/legal/consents/mine', 'get'],
    ['/api/v1/admin/backups', 'get'],
    ['/api/v1/admin/backups', 'post'],
    ['/api/v1/admin/backups/{id}/verify', 'post'],
    ['/api/v1/admin/security-posture', 'get'],
    ['/health/ready', 'get'],
  ];
  for (const [path, method] of requiredRoutes) {
    expect(Boolean(operation(path, method).responses), `${method} ${path} doit être documenté`);
  }

  if (errors.length > 0) {
    console.error(errors.map((error) => `- ${error}`).join('\n'));
    process.exit(1);
  }
  console.log('Contrat OpenAPI conforme');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
