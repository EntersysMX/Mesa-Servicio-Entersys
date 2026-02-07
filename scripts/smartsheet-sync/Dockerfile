FROM node:20-alpine

WORKDIR /app

# Instalar dependencias
RUN npm init -y && npm install axios

# Copiar scripts
COPY config.mjs sync-bidireccional.mjs ./

# Comando: sincronización continua
CMD ["node", "sync-bidireccional.mjs", "watch"]
