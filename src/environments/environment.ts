// Producción (se usa con `ng build`). NO comentar nada: el build de desarrollo
// reemplaza este archivo por environment.development.ts automáticamente.
export const environment = {
  production: true,
  apiBase: 'https://api-leoncito.onrender.com',
  // Microservicio de cruces/limpieza. Vacío = procesa en el navegador (default).
  // Cuando lo despliegues, pon aquí su URL (ej: https://cruce-service.onrender.com).
  cruceBase: '',
};
