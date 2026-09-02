# Usa una imagen base de Node.js
FROM node:24-slim

# Establece el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copia los archivos de tu proyecto necesarios para instalar dependencias
COPY package*.json ./
COPY tsconfig*.json ./
COPY prisma ./prisma/
COPY prisma_second ./prisma_second/
COPY prisma.config.second.ts ./

# Limpia la caché de npm para evitar problemas anteriores
RUN npm cache clean --force

# Instala las dependencias
RUN npm install

# Pre-descarga la extensión mysql de DuckDB (usada por DuckDbService) para no
# depender de acceso a red en el primer arranque del contenedor en producción.
RUN node -e "const { DuckDBInstance } = require('@duckdb/node-api'); DuckDBInstance.create(':memory:').then((i) => i.connect()).then((c) => c.run('INSTALL mysql')).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); })"

# Genera ambos clientes de Prisma
RUN npx prisma generate
RUN npm run prisma:generate:second

# Copia el resto de los archivos del proyecto
COPY . .

# Compila el cÃ³digo TypeScript
RUN npm run build

# Expone el puerto que usarÃ¡ la aplicaciÃ³n
EXPOSE 3003

# Comando para sincronizar el esquema con la base de datos y ejecutar la aplicaciÃ³n
CMD ["sh", "-c", "npm run start:prod"]