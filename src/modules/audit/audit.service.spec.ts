import { AuditService } from './audit.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AuditService', () => {
  it('masque les champs sensibles avant persistance', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = { auditLog: { create } } as unknown as PrismaService;
    const service = new AuditService(prisma);

    await service.write({
      action: 'TEST',
      after: {
        password: 'secret',
        viewUrl: 'signed',
        nested: { token: 'abc' },
        safe: 'ok',
      },
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data.after).toEqual({
      password: '[REDACTED]',
      viewUrl: '[REDACTED]',
      nested: { token: '[REDACTED]' },
      safe: 'ok',
    });
  });
});
