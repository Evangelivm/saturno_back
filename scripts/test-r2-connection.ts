/**
 * Prueba mínima de conectividad a R2: sube un objeto pequeño, lo lee, lo borra.
 * Uso: npm run r2:test
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const { R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET_NAME } = process.env;

  const faltantes = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT', 'R2_BUCKET_NAME']
    .filter((k) => !process.env[k]);
  if (faltantes.length > 0) {
    console.error(`❌ Faltan variables en .env: ${faltantes.join(', ')}`);
    process.exit(1);
  }

  const client = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_ACCESS_KEY_ID!, secretAccessKey: R2_SECRET_ACCESS_KEY! },
  });

  const key = `_test/conexion-${Date.now()}.txt`;
  const contenido = `Prueba de conexión R2 — ${new Date().toISOString()}`;

  console.log(`\n🔎 Bucket: ${R2_BUCKET_NAME}`);
  console.log(`🔎 Endpoint: ${R2_ENDPOINT}\n`);

  console.log(`⬆️  Subiendo ${key}...`);
  await client.send(
    new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, Body: contenido, ContentType: 'text/plain' }),
  );
  console.log('✅ Subida OK');

  console.log(`⬇️  Descargando ${key}...`);
  const res = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
  const leido = await res.Body!.transformToString();
  console.log(leido === contenido ? '✅ Contenido verificado (coincide)' : '❌ Contenido NO coincide');

  console.log(`🗑️  Borrando ${key}...`);
  await client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
  console.log('✅ Borrado OK\n');

  console.log('🎉 Conexión a R2 funcionando correctamente.\n');
}

main().catch((err) => {
  console.error('\n❌ Error de conexión a R2:', err.message ?? err);
  process.exit(1);
});
