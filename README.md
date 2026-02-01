# Centinela del Río - Frontend Web

Panel de administración web para el sistema Centinela del Río.

## Configuración

Edita `static/config.js` para configurar la URL del backend:

```javascript
const CONFIG = {
    API_URL: 'https://tu-servidor.com',  // Cambiar por tu dominio
    // ...
};
```

## Desarrollo local

Puedes servir los archivos estáticos con cualquier servidor HTTP:

```bash
# Con Python
python -m http.server 3000

# Con Node.js (npx)
npx serve -p 3000

# Con PHP
php -S localhost:3000
```

Luego abre http://localhost:3000

## Despliegue

Este frontend es estático (HTML/CSS/JS), puedes desplegarlo en:
- **Netlify** / **Vercel** (gratis)
- **GitHub Pages**
- **Nginx** / **Apache**
- **Cloudflare Pages**

Solo necesitas subir los archivos y configurar `API_URL` en `config.js`.

## Estructura

```
centinela-web/
├── index.html          # Página principal
├── static/
│   ├── config.js       # Configuración (URL del backend)
│   ├── app.js          # Lógica de la aplicación
│   └── style.css       # Estilos
└── README.md
```
