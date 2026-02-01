/**
 * Configuración del Frontend
 *
 * Cambiar API_URL según el entorno:
 * - Desarrollo local: http://localhost:8080
 * - Producción: https://tu-dominio.com
 */

const CONFIG = {
    // URL base del backend API
    API_URL: 'https://riversentinel-production.up.railway.app',

    // Versión de la API
    API_VERSION: 'v1',

    // Intervalo de actualización (ms)
    HEALTH_CHECK_INTERVAL: 30000,
    ALERTS_CHECK_INTERVAL: 60000,

    // Mapa
    MAP_DEFAULT_CENTER: [40.4168, -3.7038], // Madrid
    MAP_DEFAULT_ZOOM: 6
};

// Construir API_BASE desde la configuración
const API_BASE = `${CONFIG.API_URL}/api/${CONFIG.API_VERSION}`;
