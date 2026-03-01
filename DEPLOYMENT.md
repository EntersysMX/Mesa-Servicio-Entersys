# Guia de Despliegue - Mesa de Servicio EnterSys

**Aplicacion:** Mesa de Servicio (Helpdesk Frontend)
**URL Produccion:** https://soporte.entersys.mx
**Servidor:** prod-server (GCP us-central1-c)
**Ruta en servidor:** `/srv/apps_entersys/mesa-servicio`

---

## Flujo de Despliegue

```
[Local] Cambios -> Commit -> Push -> [Servidor] Pull -> Rebuild
```

**IMPORTANTE:** Siempre hacer commit y push ANTES de desplegar en el servidor.

---

## 1. Despliegue de Cambios (Actualizacion)

### Paso 1: Commit y Push en Local

```bash
# En la carpeta local del proyecto
cd /ruta/local/mesa-servicio-entersys

# Ver cambios
git status
git diff

# Agregar cambios y hacer commit
git add .
git commit -m "Descripcion del cambio

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"

# Push al repositorio
git push origin main
```

### Paso 2: Pull y Rebuild en Servidor

```bash
# Conectar al servidor
gcloud compute ssh prod-server --zone=us-central1-c

# Ir a la carpeta de la aplicacion
cd /srv/apps_entersys/mesa-servicio

# Descargar cambios
git pull origin main

# Reconstruir y reiniciar contenedor
docker compose up -d --build

# Verificar estado
docker compose ps
docker compose logs --tail=50
```

### Comando Rapido (Todo en uno desde local)

```bash
# Desde la maquina local, ejecutar todo el proceso en el servidor
gcloud compute ssh prod-server --zone=us-central1-c --command="cd /srv/apps_entersys/mesa-servicio && git pull origin main && docker compose up -d --build && docker compose ps"
```

---

## 2. Despliegue Inicial (Primera vez)

### Requisitos Previos

- Acceso SSH al servidor via gcloud CLI
- Red `traefik-public` existente en el servidor
- Dominio configurado en DNS apuntando al servidor

### Pasos

```bash
# 1. Conectar al servidor
gcloud compute ssh prod-server --zone=us-central1-c

# 2. Crear directorio
sudo mkdir -p /srv/apps_entersys/mesa-servicio
sudo chown -R $(whoami):$(whoami) /srv/apps_entersys/mesa-servicio
cd /srv/apps_entersys/mesa-servicio

# 3. Clonar repositorio
git clone https://github.com/EntersysMX/Mesa-Servicio-Entersys .

# 4. Crear archivo .env
cat > .env << 'EOF'
VITE_GLPI_URL=https://glpi.entersys.mx
VITE_GLPI_APP_TOKEN=<TU_APP_TOKEN_AQUI>
VITE_GLPI_USER_TOKEN=
TZ=America/Mexico_City
EOF

# 5. Verificar red Traefik
docker network ls | grep traefik-public

# 6. Construir y levantar
docker compose up -d --build

# 7. Verificar
docker compose ps
docker compose logs -f
```

---

## 3. Configuracion de Produccion

### docker-compose.yml

El archivo ya esta configurado con:

| Configuracion | Valor |
|---------------|-------|
| Dominio | `soporte.entersys.mx` |
| SSL | Automatico (Let's Encrypt via Traefik) |
| Red | `traefik-public` (externa) |
| RAM maxima | 512 MB |
| CPU maxima | 0.5 cores |
| Health check | Cada 30s en puerto 80 |
| Restart policy | `unless-stopped` |

### Variables de Entorno (.env)

```env
VITE_GLPI_URL=https://glpi.entersys.mx
VITE_GLPI_APP_TOKEN=<token-de-glpi>
VITE_GLPI_USER_TOKEN=<token-usuario-opcional>
TZ=America/Mexico_City
```

**NOTA:** El archivo `.env` NO se commitea al repositorio (esta en .gitignore).

---

## 4. Comandos Utiles

### Monitoreo

```bash
# Ver estado del contenedor
docker compose ps

# Ver logs en tiempo real
docker compose logs -f

# Ver uso de recursos
docker stats helpdesk-frontend

# Ver health check
docker inspect helpdesk-frontend | grep -A 10 Health
```

### Mantenimiento

```bash
# Reiniciar contenedor
docker compose restart

# Detener contenedor
docker compose down

# Reconstruir sin cache
docker compose build --no-cache
docker compose up -d

# Limpiar imagenes antiguas
docker image prune -f
```

### Troubleshooting

```bash
# Ver logs de Traefik para este servicio
docker logs traefik 2>&1 | grep helpdesk

# Verificar que el contenedor esta en la red correcta
docker network inspect traefik-public | grep helpdesk

# Verificar configuracion de Traefik
docker exec traefik cat /etc/traefik/traefik.yml

# Probar conectividad interna
docker exec helpdesk-frontend curl -s http://localhost:80
```

---

## 5. Estructura del Proyecto

```
/srv/apps_entersys/mesa-servicio/
├── docker-compose.yml    # Configuracion de contenedor
├── Dockerfile            # Build de la imagen
├── .env                  # Variables de entorno (NO en git)
├── .env.example          # Plantilla de variables
├── docker/
│   ├── nginx/
│   │   └── frontend.conf # Configuracion nginx
│   └── env.sh            # Script de variables runtime
├── src/                  # Codigo fuente React
├── public/               # Archivos estaticos
└── package.json          # Dependencias Node.js
```

---

## 6. Rollback

Si algo sale mal despues de un despliegue:

```bash
# Ver historial de commits
git log --oneline -10

# Volver a un commit anterior
git checkout <commit-hash>

# Reconstruir
docker compose up -d --build

# Para volver a main
git checkout main
```

---

## 7. Informacion del Servidor

| Recurso | Valor |
|---------|-------|
| Servidor | prod-server |
| Zona GCP | us-central1-c |
| IP | (usar gcloud para obtener) |
| SO | Debian 12 |
| Docker | 28.3.2 |
| Reverse Proxy | Traefik v2.10 |

### Conexion SSH

```bash
# Metodo recomendado
gcloud compute ssh prod-server --zone=us-central1-c

# Con comando directo
gcloud compute ssh prod-server --zone=us-central1-c --command="<comando>"
```

---

## 8. Contacto

- **Administrador:** armando.cortes@entersys.mx
- **Monitoreo:** https://monitoring.entersys.mx
- **Repositorio:** https://github.com/EntersysMX/Mesa-Servicio-Entersys

---

**Documento generado:** 27 de Enero, 2026
**Autor:** Claude Code
