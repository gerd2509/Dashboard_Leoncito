// Producción (se usa con `ng build`). NO comentar nada: el build de desarrollo
// reemplaza este archivo por environment.development.ts automáticamente.
export const environment = {
  production: true,
  apiBase: 'https://api-leoncito.onrender.com',
  // Microservicio de cruces/limpieza (limpiezaBD_sedes-service en Render).
  // Vacío = procesa en el navegador. Con URL = usa el micro (con fallback local).
  cruceBase: 'https://limpiezabd-sedes-service.onrender.com',
  // Microservicio de ventas/margen (ventas-service). Vacío = usa sheets-api (apiBase).
  // Cuando lo despliegues en Render, pon aquí su URL.
  ventasBase: 'https://ventas-margen-service.onrender.com',
  // Microservicio de gestión (registro + control supervisor). Vacío = usa sheets-api.
  // Cuando lo despliegues en Render, pon aquí su URL.
  gestionBase: 'https://gestion-service-rvuw.onrender.com',
};
