import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  Coordenada,
  OptimizarRutaRequest,
  OptimizarRutaResponse,
  TravelMode,
} from '../features/gps-ruta/models/ruta.model';
import { environment } from '../../environments/environment';

/**
 * Servicio de rutas geográficas.
 *
 * SEGURIDAD: el frontend NUNCA llama directamente a la Directions/Routes API de
 * Google. La API Key vive solo en el backend (sheets-api). Aquí únicamente
 * delegamos la optimización al endpoint `POST /maps/optimizar` y construimos el
 * deep link público de Google Maps (que no requiere API Key).
 */
@Injectable({ providedIn: 'root' })
export class RutaMapsService {
  // Misma base que AuthService (sheets-api), tomada del environment.
  private readonly baseUrl = environment.apiBase;

  constructor(private http: HttpClient) {}

  /**
   * Envía los puntos al backend para que Google calcule el orden óptimo.
   * El backend toma el primer punto como origen y el último como destino.
   */
  optimizarRuta(
    coordenadas: Coordenada[],
    travelmode: TravelMode = 'driving',
  ): Observable<OptimizarRutaResponse> {
    const body: OptimizarRutaRequest = { coordenadas, travelmode };
    return this.http.post<OptimizarRutaResponse>(
      `${this.baseUrl}/maps/optimizar`,
      body,
    );
  }

  /**
   * Construye el deep link UNIVERSAL de Google Maps (Maps URLs `api=1`).
   * No usa API Key. En móvil redirige a la app nativa; en escritorio abre la web.
   *
   * Usa el formato de ruta POR TRAMOS (todos los puntos en la ruta):
   *   https://www.google.com/maps/dir/LAT,LNG/LAT,LNG/.../LAT,LNG/?travelmode=driving
   *
   * Este formato es el más fiable para mostrar la RUTA COMPLETA multi-parada
   * (origen → todos los intermedios → destino) tanto en web como en la app móvil.
   * Google traza el recorrido completo y, al navegar, avanza automáticamente de
   * un punto al siguiente hasta el último.
   *
   * @param coordenadas puntos YA optimizados, en el orden de recorrido.
   */
  construirUrlGoogleMaps(
    coordenadas: Coordenada[],
    travelmode: TravelMode = 'driving',
  ): string {
    if (!coordenadas || coordenadas.length < 2) {
      throw new Error('Se requieren al menos 2 puntos (origen y destino) para abrir la navegación.');
    }

    // Todos los puntos, en orden, separados por '/'. Cada uno como "lat,lng".
    const ruta = coordenadas.map((c) => `${c.lat},${c.lng}`).join('/');
    const params = new URLSearchParams({ travelmode });

    return `https://www.google.com/maps/dir/${ruta}/?${params.toString()}`;
  }

  /**
   * Reordena la lista ORIGINAL aplicando el `waypointOrder` devuelto por Google.
   * Mantiene origen (primero) y destino (último) fijos y solo reordena el tramo
   * intermedio según los índices óptimos.
   */
  aplicarOrdenOptimo(
    original: Coordenada[],
    waypointOrder: number[],
  ): Coordenada[] {
    if (original.length < 3 || !waypointOrder?.length) {
      // Sin intermedios (o sin orden) no hay nada que reordenar.
      return [...original];
    }

    const origin = original[0];
    const destination = original[original.length - 1];
    const intermedios = original.slice(1, -1);

    const intermediosOrdenados = waypointOrder
      .filter((i) => i >= 0 && i < intermedios.length)
      .map((i) => intermedios[i]);

    return [origin, ...intermediosOrdenados, destination];
  }
}
