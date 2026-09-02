/**
 * Prueba mínima de conectividad DuckDB → MariaDB (extensión mysql): ATTACH sobre
 * DATABASE_URL_SECOND y cuenta filas de clientes2024. Usa una instancia en memoria
 * (no toca data/legacy.duckdb) para poder correr aunque el backend ya esté arriba.
 * Uso: npm run duckdb:test
 */

import { DuckDBInstance } from '@duckdb/node-api';
import * as dotenv from 'dotenv';
import { buildMysqlAttachString, escapeSqlLiteral } from '../src/duckdb/mysql-connection-string.util';

dotenv.config();

async function main() {
  const { DATABASE_URL_SECOND } = process.env;
  if (!DATABASE_URL_SECOND) {
    console.error('❌ Falta DATABASE_URL_SECOND en .env');
    process.exit(1);
  }

  const attachString = buildMysqlAttachString(DATABASE_URL_SECOND);
  console.log(`\n🔎 Host: ${attachString.match(/host=(\S+)/)?.[1]}`);

  const instance = await DuckDBInstance.create(':memory:');
  const connection = await instance.connect();

  console.log('📦 Instalando/cargando extensión mysql...');
  await connection.run('INSTALL mysql');
  await connection.run('LOAD mysql');

  console.log('🔌 Conectando (ATTACH) a MariaDB...');
  await connection.run(`ATTACH '${escapeSqlLiteral(attachString)}' AS legacy_mysql (TYPE mysql)`);
  console.log('✅ ATTACH OK');

  console.log('🔎 Contando filas de clientes2024...');
  const reader = await connection.runAndReadAll('SELECT COUNT(*) AS total FROM legacy_mysql.clientes2024');
  const total = reader.getRowObjectsJson()[0]?.total ?? 0;
  console.log(`✅ clientes2024: ${total} filas\n`);

  console.log('🎉 Conexión DuckDB → MariaDB (mysql extension) funcionando correctamente.\n');
}

main().catch((err) => {
  console.error('\n❌ Error de conexión DuckDB → MariaDB:', err.message ?? err);
  process.exit(1);
});
