import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = app.get(ConfigService);
  const contractVersion = config.get<string>('CONTRAT_VERSION', '1.0.0');
  const documentBuilder = new DocumentBuilder()
    .setTitle('ÉLECTRO ASSIST 24H — API')
    .setDescription(
      'API de confiance, vérification et sécurité pour la mise en relation entre clients et électriciens au Bénin.',
    )
    .setVersion(contractVersion)
    .addBearerAuth()
    .addCookieAuth('ea_refresh')
    .build();

  const document = SwaggerModule.createDocument(app, documentBuilder) as OpenAPIObject & {
    'x-contract-version': string;
  };
  document['x-contract-version'] = contractVersion;
  return document;
}

export function setupSwagger(app: INestApplication): OpenAPIObject {
  const document = buildOpenApiDocument(app);
  SwaggerModule.setup('docs', app, document);
  return document;
}
