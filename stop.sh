#!/bin/bash
# ===========================================
# Script de parada - GLPI Helpdesk Docker
# ===========================================

echo "🛑 Deteniendo GLPI Helpdesk..."

# Determinar comando de docker compose
if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    COMPOSE_CMD="docker-compose"
fi

$COMPOSE_CMD --profile dev --profile production down

echo "✅ Servicios detenidos correctamente"
