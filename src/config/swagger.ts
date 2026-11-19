import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const documentBuilder = new DocumentBuilder()
    .setTitle('ÉLECTRO ASSIST 24H — API')
    .setDescription(
      'API de confiance, vérification et sécurité pour la mise en relation entre clients et électriciens au Bénin.',
    )
    .setVersion(app.get(ConfigService).get<string>('APP_VERSION', '0.1.0'))
    .addBearerAuth()
    .addCookieAuth('ea_refresh')
    .build();

  return SwaggerModule.createDocument(app, documentBuilder);
}

export function setupSwagger(app: INestApplication): OpenAPIObject {
  const document = buildOpenApiDocument(app);
  SwaggerModule.setup('docs', app, document);
  return document;
}
