// ─────────────────────────────────────────────────────────────────────────────
// Modelo de datos para la optimización y exportación de rutas GPS.
// Tipado estricto compartido entre el componente, el servicio y el backend.
// ─────────────────────────────────────────────────────────────────────────────

/** Punto geográfico de la ruta. */
export interface Coordenada {
  lat: number;
  lng: number;
  /** Identificador del registro de origen (fila de grilla, cliente, etc.). */
  id?: string;
  /** Etiqueta legible para mostrar en la UI. */
  nombre?: string;
  /**
   * Fila original completa del Excel importado (todas sus columnas), para poder
   * re-exportar la data "tal cual" conservando el orden optimizado.
   */
  meta?: Record<string, any>;
}

/** Cuerpo del POST que el frontend envía al backend para optimizar. */
export interface OptimizarRutaRequest {
  /**
   * Lista completa de puntos en su orden original.
   * El backend toma el PRIMERO como `origin`, el ÚLTIMO como `destination`
   * y los intermedios como `waypoints` con `optimizeWaypoints: true`.
   */
  coordenadas: Coordenada[];
  /** Modo de viaje (por defecto 'driving'). */
  travelmode?: TravelMode;
}

export type TravelMode = 'driving' | 'walking' | 'bicycling' | 'transit';

/**
 * Respuesta del backend tras consultar la Directions/Routes API de Google.
 * `waypointOrder` es el orden óptimo de los waypoints INTERMEDIOS
 * (índices 0-based relativos al tramo intermedio, sin origen ni destino),
 * tal cual lo devuelve Google en `routes[0].waypoint_order`.
 */
export interface OptimizarRutaResponse {
  success: boolean;
  /** Orden óptimo de los waypoints intermedios (índices del tramo intermedio). */
  waypointOrder: number[];
  /**
   * Conveniencia: lista COMPLETA ya reordenada por el backend
   * (origen + intermedios optimizados + destino). El front puede usarla
   * directamente sin recalcular el orden.
   */
  puntosOptimizados: Coordenada[];
  /** Distancia total estimada de la ruta optimizada, en metros. */
  distanciaMetros?: number;
  /** Duración total estimada de la ruta optimizada, en segundos. */
  duracionSegundos?: number;
  /** Mensaje de error legible cuando `success` es false. */
  message?: string;
}
