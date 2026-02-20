# Etapa 1: Build de la aplicación React
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm ci

# Copiar código fuente
COPY . .

# Variables de entorno para el build (valores vienen de .env via docker-compose)
ARG VITE_GLPI_URL
ARG VITE_GLPI_APP_TOKEN
ARG VITE_GLPI_USER_TOKEN
ARG VITE_GEMINI_API_KEY
ARG VITE_GEMINI_MODEL

ENV VITE_GLPI_URL=$VITE_GLPI_URL
ENV VITE_GLPI_APP_TOKEN=$VITE_GLPI_APP_TOKEN
ENV VITE_GLPI_USER_TOKEN=$VITE_GLPI_USER_TOKEN
ENV VITE_GEMINI_API_KEY=$VITE_GEMINI_API_KEY
ENV VITE_GEMINI_MODEL=$VITE_GEMINI_MODEL

# Build de producción
RUN npm run build

# Etapa 2: Servidor nginx para servir la app
FROM nginx:alpine

# Copiar configuración de nginx
COPY docker/nginx/frontend.conf /etc/nginx/conf.d/default.conf

# Copiar archivos build
COPY --from=builder /app/dist /usr/share/nginx/html

# Script para inyectar variables de entorno en runtime
COPY docker/env.sh /docker-entrypoint.d/40-env.sh
RUN chmod +x /docker-entrypoint.d/40-env.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
