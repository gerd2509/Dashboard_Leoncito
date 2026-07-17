// Desarrollo (se usa con `ng serve`). Apunta al backend local.
export const environment = {
  production: false,
  apiBase: 'http://localhost:3000',
  // Microservicio de cruces/limpieza. Vacío = procesa en el navegador (default).
  // Para probar el microservicio en local, arráncalo y pon: 'http://localhost:4002'.
  cruceBase: 'http://localhost:4002',
};
