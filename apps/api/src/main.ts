import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
} else if (existsSync('apps/api/.env')) {
  process.loadEnvFile('apps/api/.env');
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(process.env.PORT ?? 4000);
}
await bootstrap();
