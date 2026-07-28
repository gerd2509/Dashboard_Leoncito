import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';

/**
 * Guarda/restaura los filtros elegidos por el usuario en cada dashboard
 * (rango de fechas, sede, vendedor…) usando localStorage, namespaced por usuario.
 * Invisible: no agrega UI. Las fechas se guardan como ISO y se leen tal cual
 * (cada dashboard reconstruye los Date que necesite).
 */
@Injectable({ providedIn: 'root' })
export class FiltrosStoreService {
  private readonly PREFIX = 'flt';

  constructor(private auth: AuthService) {}

  private clave(modulo: string): string {
    const u = this.auth.getUsuario();
    const quien = (u?.nombre || u?.vendedor || 'anon').toString().toLowerCase();
    return `${this.PREFIX}:${modulo}:${quien}`;
  }

  /** Guarda un objeto plano de filtros para un módulo. */
  guardar(modulo: string, data: Record<string, any>): void {
    try {
      localStorage.setItem(this.clave(modulo), JSON.stringify(data));
    } catch { /* localStorage lleno o no disponible: se ignora */ }
  }

  /** Devuelve los filtros guardados del módulo, o null si no hay. */
  leer<T = Record<string, any>>(modulo: string): T | null {
    try {
      const raw = localStorage.getItem(this.clave(modulo));
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  /** Convierte a Date un valor guardado (ISO o timestamp); null si no aplica. */
  fecha(v: any): Date | null {
    if (!v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
}
