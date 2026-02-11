import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule);

  // Global validation pipe — enforces DTO validation on all endpoints
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global prefix for all API routes
  app.setGlobalPrefix('api', {
    exclude: ['health'],
  });

  app.enableCors();

  const port = process.env.API_PORT || 3000;
  await app.listen(port);

  logger.log(`[Orkestr API] Running on http://localhost:${port}`);
  logger.log(`[Orkestr API] Healthcheck: http://localhost:${port}/health`);
  logger.log(`[Orkestr API] Events:      POST http://localhost:${port}/api/events`);
  logger.log(`[Orkestr API] Runs:        POST http://localhost:${port}/api/runs`);
}

bootstrap();
