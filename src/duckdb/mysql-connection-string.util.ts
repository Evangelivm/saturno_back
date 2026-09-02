/**
 * Convierte una URL estilo Prisma ("mysql://user:pass@host:port/db") a la cadena
 * "key=value" que espera `ATTACH '...' AS x (TYPE mysql)` de la extensión mysql de
 * DuckDB (sintaxis estilo libpq, no una URL).
 */
export function buildMysqlAttachString(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const host = url.hostname;
  const port = url.port || '3306';
  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const database = url.pathname.replace(/^\//, '');

  const parts = [`host=${host}`, `port=${port}`, `user=${user}`, `database=${database}`];
  if (password) parts.push(`password=${password}`);
  return parts.join(' ');
}

/** Escapa comillas simples para uso dentro de un literal SQL de una sola comilla. */
export function escapeSqlLiteral(value: string): string {
  return value.replace(/'/g, "''");
}
