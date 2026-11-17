import { INestApplication, ValidationPipe } from '@nestjs/common';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

/**
 * Applies shared HTTP security headers, compression, CORS, cookies, and validation pipes.
 */
export function configureApp(app: INestApplication) {
  const httpInstance = app.getHttpAdapter?.()?.getInstance?.() as
    | { set?: (key: string, value: unknown) => void }
    | undefined;
  if (typeof httpInstance?.set === 'function') {
    httpInstance.set('trust proxy', 1);
  }

  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  const rawOrigins = process.env.APP_WEB_URL || 'http://localhost:3000';
  const allowedOrigins = rawOrigins
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
