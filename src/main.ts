// Debe ir antes de cualquier import: libuv arma su threadpool en el primer uso
// (fs, dns, zlib, crypto) y luego no se puede resizear. Por defecto son 4 hilos
// sin importar los cores de la máquina — la compresión zip de las descargas
// masivas (historial-legacy) corre ahí, así que con solo 4 hilos, subir la
// concurrencia de descargas paralelas (pLimit) no acelera la parte de compresión
// más allá de 4 en simultáneo. Se sube a 6 para aprovechar los cores del VPS.
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '6';

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
