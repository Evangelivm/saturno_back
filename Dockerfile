# Usa una imagen base de Node.js
FROM node:22-slim

# Establece el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copia los archivos de tu proyecto necesarios para instalar dependencias
COPY package*.json ./
COPY tsconfig*.json ./
COPY prisma ./prisma/

# Limpia la cachÃ© de npm para evitar problemas anteriores
RUN npm cache clean --force

# Instala las dependencias
RUN npm install

# Genera el cliente de Prisma
RUN npx prisma generate

# Copia el resto de los archivos del proyecto
COPY . .

# Compila el cÃ³digo TypeScript
RUN npm run build

# Expone el puerto que usarÃ¡ la aplicaciÃ³n
EXPOSE 3003

# Comando para sincronizar el esquema con la base de datos y ejecutar la aplicaciÃ³n
CMD ["sh", "-c", "npm run start:prod"]