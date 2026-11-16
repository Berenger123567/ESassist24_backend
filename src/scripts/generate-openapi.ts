import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

async function main() {
  process.env.NODE_ENV ??= 'test';

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module');
  const { configureApp } = await import('../app.setup');
  const { buildOpenApiDocument } = await import('../config/swagger');

  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  const document = buildOpenApiDocument(app);

  const outputDirectory = join(process.cwd(), 'docs');
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    join(outputDirectory, 'openapi.json'),
    `${JSON.stringify(document, null, 2)}\n`,
    'utf8',
  );

  await app.close();
  console.log('OpenAPI écrit dans docs/openapi.json');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
