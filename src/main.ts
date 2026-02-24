import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Configurar cookie-parser
  app.use(cookieParser());

  // Habilitar CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.getHttpServer().requestTimeout = 0;

  await app.listen(process.env.PORT ?? 3001);

  console.log(`🚀 Servidor ejecutándose en http://localhost:${process.env.PORT ?? 3001}`);
}
bootstrap();
