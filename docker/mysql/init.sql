-- Configuración inicial de MySQL para GLPI
-- Este script se ejecuta automáticamente al crear el contenedor

-- Configurar charset por defecto
ALTER DATABASE glpi CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Otorgar permisos completos al usuario de GLPI
GRANT ALL PRIVILEGES ON glpi.* TO 'glpi_user'@'%';
FLUSH PRIVILEGES;

-- Mensaje de confirmación
SELECT 'Base de datos GLPI inicializada correctamente' AS mensaje;
