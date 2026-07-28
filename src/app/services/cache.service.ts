import { Injectable } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { catchError, shareReplay } from 'rxjs/operators';

/**
 * Caché en memoria con TTL para lecturas repetidas (evita re-consultar el backend
 * al navegar entre módulos). No cachea errores: si la petición falla, se descarta
 * la entrada para permitir reintento. TTL corto por defecto → poca posibilidad de
 * mostrar datos desactualizados.
 */
@Injectable({ providedIn: 'root' })
export class CacheService {
  private store = new Map<string, { at: number; obs: Observable<any> }>();

  /**
   * Devuelve la respuesta cacheada de `key` si sigue vigente (dentro del TTL);
   * si no, ejecuta `factory()` y la cachea.
   */
  getOrFetch<T>(key: string, factory: () => Observable<T>, ttlMs = 30000): Observable<T> {
    const hit = this.store.get(key);
    const now = Date.now();
    if (hit && now - hit.at < ttlMs) {
      return hit.obs as Observable<T>;
    }
    const obs = factory().pipe(
      catchError(err => { this.store.delete(key); return throwError(() => err); }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.store.set(key, { at: now, obs });
    return obs;
  }

  /** Invalida todo, o solo las claves que empiezan por `prefix`. */
  invalidate(prefix?: string): void {
    if (!prefix) { this.store.clear(); return; }
    for (const k of [...this.store.keys()]) {
      if (k.startsWith(prefix)) this.store.delete(k);
    }
  }
}
