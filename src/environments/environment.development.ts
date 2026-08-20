// Desarrollo (se usa con `ng serve`). Apunta al backend local.
export const environment = {
  production: false,
  // Servicio UNIFICADO local (docker compose / node server.js) en :3000, con prefijos.
  apiBase: 'http://localhost:3000/sheets',
  // Microservicio de cruces/limpieza (limpieza-sedes) — NO unificado. Vacío = navegador.
  cruceBase: 'http://localhost:4002',
  ventasBase: 'http://localhost:3000/ventas',
  gestionBase: 'http://localhost:3000/gestion',
};
