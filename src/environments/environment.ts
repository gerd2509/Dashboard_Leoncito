// Producción (se usa con `ng build`). NO comentar nada: el build de desarrollo
// reemplaza este archivo por environment.development.ts automáticamente.
export const environment = {
  production: true,
  // Servicio UNIFICADO (api-unificada): sheets + ventas + gestion en un solo despliegue,
  // montados por prefijo /sheets · /ventas · /gestion. Reemplaza los 3 micros antiguos.
  apiBase: 'https://api-unificada.onrender.com/sheets',
  // Microservicio de cruces/limpieza (limpiezaBD_sedes-service en Render) — NO unificado.
  // Vacío = procesa en el navegador. Con URL = usa el micro (con fallback local).
  cruceBase: 'https://limpiezabd-sedes-service.onrender.com',
  ventasBase: 'https://api-unificada.onrender.com/ventas',
  gestionBase: 'https://api-unificada.onrender.com/gestion',
};
