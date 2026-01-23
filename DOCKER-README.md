# GLPI Helpdesk - Guía de Despliegue con Docker

## Requisitos

- Docker 20.10+
- Docker Compose 2.0+
- 2GB RAM mínimo
- 10GB espacio en disco

## Inicio Rápido

```bash
# 1. Clonar o copiar el proyecto
cd glpi-helpdesk

# 2. Iniciar servicios (modo desarrollo)
./start.sh dev

# 3. Esperar ~2 minutos para que GLPI se configure
```

## URLs de Acceso

| Servicio | URL | Descripción |
|----------|-----|-------------|
| GLPI | http://localhost:8080 | Backend de gestión |
| Mesa de Ayuda | http://localhost:3000 | Frontend React |
| Mailhog | http://localhost:8025 | Pruebas de correo (dev) |

## Configuración Inicial de GLPI

### 1. Primer acceso
1. Ve a http://localhost:8080
2. Sigue el asistente de instalación
3. Credenciales de base de datos:
   - Host: `mysql`
   - Usuario: `glpi_user`
   - Contraseña: `glpi_pass_2024`
   - Base de datos: `glpi`

### 2. Usuarios por defecto
| Usuario | Contraseña | Perfil |
|---------|------------|--------|
| glpi | glpi | Super-Admin |
| tech | tech | Technician |
| normal | normal | Self-Service |
| post-only | postonly | Post-Only |

**⚠️ IMPORTANTE:** Cambia estas contraseñas después de la instalación.

### 3. Habilitar API
1. Ve a `Configuración` → `General` → `API`
2. Activa "Habilitar API REST"
3. Activa "Habilitar inicio de sesión con token externo"
4. Activa "Habilitar inicio de sesión con credenciales"
5. Crea un cliente API:
   - Nombre: "Helpdesk Frontend"
   - Rango IP: Vacío (permite todas)
   - Activo: Sí
6. Copia el **App Token** generado

### 4. Generar User Token
1. Ve a tu perfil (esquina superior derecha)
2. `Configuración` → `Token API`
3. Genera un nuevo token
4. Copia el **User Token**

### 5. Actualizar configuración
Edita el archivo `.env`:
```env
GLPI_APP_TOKEN=tu-app-token-aqui
GLPI_USER_TOKEN=tu-user-token-aqui
```

Reinicia los servicios:
```bash
./stop.sh
./start.sh
```

## Configuración de Notificaciones por Correo

### Configurar SMTP en GLPI

1. Ve a `Configuración` → `Notificaciones` → `Configuración de seguimientos por correo`
2. Activa "Habilitar seguimientos por correo"
3. Ve a `Configuración` → `Notificaciones` → `Configuración de correo electrónico`
4. Configura tu servidor SMTP:

#### Gmail
```
Modo: SMTP+TLS
Servidor: smtp.gmail.com
Puerto: 587
Usuario: tu-correo@gmail.com
Contraseña: [App Password de Google]
```

#### Outlook/Office 365
```
Modo: SMTP+TLS
Servidor: smtp.office365.com
Puerto: 587
Usuario: tu-correo@outlook.com
Contraseña: tu-contraseña
```

#### Mailhog (desarrollo)
```
Modo: SMTP
Servidor: mailhog
Puerto: 1025
(Sin usuario/contraseña)
```

### Activar Notificaciones

1. Ve a `Configuración` → `Notificaciones` → `Notificaciones`
2. Activa las siguientes notificaciones:

| Notificación | Activa | Destinatarios |
|--------------|--------|---------------|
| Nuevo ticket | ✅ | Técnico, Solicitante |
| Actualización de ticket | ✅ | Técnico, Solicitante |
| Nuevo seguimiento | ✅ | Técnico, Solicitante |
| Ticket resuelto | ✅ | Solicitante |
| Ticket cerrado | ✅ | Solicitante |
| Ticket asignado | ✅ | Técnico |

### Verificar correos del usuario

Los correos se toman automáticamente de:
- **Usuario que crea ticket:** Su correo registrado en GLPI
- **Técnico asignado:** Su correo registrado en GLPI

Asegúrate de que cada usuario tenga su correo configurado en:
`Administración` → `Usuarios` → [Usuario] → `Correo electrónico`

## Configuración de Catálogos

### Categorías de Tickets
`Asistencia` → `Configuración` → `Categorías de ITIL`

### Ubicaciones
`Configuración` → `Desplegables` → `Ubicaciones`

### Grupos
`Administración` → `Grupos`

### Usuarios/Técnicos
`Administración` → `Usuarios`

## Comandos Útiles

```bash
# Ver logs de todos los servicios
docker compose logs -f

# Ver logs de un servicio específico
docker compose logs -f glpi

# Reiniciar un servicio
docker compose restart glpi

# Entrar al contenedor de GLPI
docker exec -it glpi-server bash

# Backup de la base de datos
docker exec glpi-mysql mysqldump -u glpi_user -pglpi_pass_2024 glpi > backup.sql

# Restaurar base de datos
docker exec -i glpi-mysql mysql -u glpi_user -pglpi_pass_2024 glpi < backup.sql
```

## Producción

Para desplegar en producción:

1. Edita `.env` con configuraciones reales
2. Configura SSL/TLS en `docker/nginx/nginx.conf`
3. Inicia en modo producción:
```bash
./start.sh prod
```

## Estructura de Archivos

```
glpi-helpdesk/
├── docker-compose.yml      # Orquestación de servicios
├── Dockerfile              # Build del frontend
├── .env.docker             # Plantilla de variables
├── start.sh                # Script de inicio
├── stop.sh                 # Script de parada
├── docker/
│   ├── nginx/
│   │   ├── nginx.conf      # Reverse proxy (producción)
│   │   └── frontend.conf   # Config del frontend
│   ├── mysql/
│   │   └── init.sql        # Inicialización DB
│   └── env.sh              # Variables en runtime
└── src/                    # Código fuente React
```

## Solución de Problemas

### GLPI no inicia
```bash
docker compose logs glpi
# Verificar que MySQL esté listo primero
docker compose logs mysql
```

### Error de conexión a la API
1. Verifica que la API esté habilitada en GLPI
2. Verifica los tokens en `.env`
3. Revisa la consola del navegador para errores

### Correos no se envían
1. Verifica configuración SMTP en GLPI
2. Para desarrollo, usa Mailhog y revisa http://localhost:8025
3. Verifica que las notificaciones estén activas
