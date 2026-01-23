#!/bin/bash
# ===========================================
# Script de inicio - GLPI Helpdesk Docker
# ===========================================

set -e

echo "🚀 Iniciando GLPI Helpdesk..."

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar que Docker esté instalado
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker no está instalado. Por favor instálalo primero.${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ Docker Compose no está instalado. Por favor instálalo primero.${NC}"
    exit 1
fi

# Copiar archivo de entorno si no existe
if [ ! -f .env ]; then
    echo -e "${YELLOW}📋 Creando archivo .env desde plantilla...${NC}"
    cp .env.docker .env
    echo -e "${GREEN}✅ Archivo .env creado. Edítalo con tus configuraciones.${NC}"
fi

# Determinar comando de docker compose
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

# Modo de ejecución
MODE=${1:-dev}

echo -e "${YELLOW}📦 Modo: $MODE${NC}"

if [ "$MODE" = "dev" ]; then
    echo -e "${YELLOW}🔧 Iniciando en modo desarrollo (con Mailhog)...${NC}"
    $COMPOSE_CMD --profile dev up -d
elif [ "$MODE" = "prod" ]; then
    echo -e "${YELLOW}🏭 Iniciando en modo producción (con Nginx)...${NC}"
    $COMPOSE_CMD --profile production up -d
else
    echo -e "${YELLOW}🔧 Iniciando servicios básicos...${NC}"
    $COMPOSE_CMD up -d mysql glpi helpdesk-frontend
fi

echo ""
echo -e "${GREEN}✅ Servicios iniciados correctamente!${NC}"
echo ""
echo "=========================================="
echo "📍 URLs de acceso:"
echo "=========================================="
echo -e "  ${GREEN}GLPI:${NC}           http://localhost:8080"
echo -e "  ${GREEN}Mesa de Ayuda:${NC}  http://localhost:3000"

if [ "$MODE" = "dev" ]; then
    echo -e "  ${GREEN}Mailhog:${NC}        http://localhost:8025"
fi

echo ""
echo "=========================================="
echo "📋 Próximos pasos:"
echo "=========================================="
echo "1. Accede a http://localhost:8080 para configurar GLPI"
echo "2. Usuario inicial: glpi / glpi"
echo "3. Configura la API en Configuración → General → API"
echo "4. Genera tokens y agrégalos al archivo .env"
echo "5. Reinicia con: ./start.sh"
echo ""
echo -e "${YELLOW}💡 Tip: Usa './stop.sh' para detener los servicios${NC}"
