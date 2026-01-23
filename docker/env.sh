#!/bin/sh
# Script para inyectar variables de entorno en runtime

cat <<EOF > /usr/share/nginx/html/config.js
window.RUNTIME_CONFIG = {
  GLPI_URL: "${VITE_GLPI_URL:-https://glpi.entersys.mx}",
  GLPI_APP_TOKEN: "${VITE_GLPI_APP_TOKEN:-***GLPI_APP_TOKEN_REMOVED***}",
  GLPI_USER_TOKEN: "${VITE_GLPI_USER_TOKEN:-}"
};
EOF

echo "Runtime config generado con GLPI_URL: ${VITE_GLPI_URL:-https://glpi.entersys.mx}"
