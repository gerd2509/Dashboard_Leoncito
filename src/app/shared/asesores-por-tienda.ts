import { CapSedesService } from '../services/cap-sedes.service';

/** Tiendas Realzza nuevas (Piura/Lima). Chiclayo ('REALZZA') es todo lo que no sea de estas. */
export const TIENDAS_NUEVAS_REALZZA = ['REALZZA PIURA', 'REALZZA LIMA'] as const;

/**
 * Asesores activos por tienda Realzza según el CAP. Sirve a la supervisión (Control,
 * Registro y Gestión Supervisor, Actividad) para acotar a la tienda elegida.
 */
export class AsesoresPorTienda {
  private mapa: Record<string, string[]> = {};

  constructor(private cap: CapSedesService) {}

  async cargar(): Promise<void> {
    for (const t of TIENDAS_NUEVAS_REALZZA) this.mapa[t] = await this.cap.vendedoresActivos(t);
  }

  /** Lista de asesores de una tienda nueva; null para Chiclayo (usar su lista propia). */
  listaDe(tienda: string): string[] | null {
    return (TIENDAS_NUEVAS_REALZZA as readonly string[]).includes(tienda) ? this.mapa[tienda] : null;
  }

  /** ¿El asesor pertenece a la tienda? Chiclayo = todo lo que no esté en Piura/Lima. */
  pertenece(asesor: string, tienda: string): boolean {
    const a = (asesor || '').toString().toUpperCase().trim();
    if (!(TIENDAS_NUEVAS_REALZZA as readonly string[]).includes(tienda)) {
      return !TIENDAS_NUEVAS_REALZZA.some(t => this.mapa[t]?.includes(a));
    }
    return !!this.mapa[tienda]?.includes(a);
  }
}
