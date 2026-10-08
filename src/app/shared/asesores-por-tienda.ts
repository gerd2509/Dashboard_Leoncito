import { CapSedesService } from '../services/cap-sedes.service';

/** Tiendas Realzza nuevas (Piura/Lima). Chiclayo ('REALZZA') es todo lo que no sea de estas. */
export const TIENDAS_NUEVAS_REALZZA = ['REALZZA PIURA', 'REALZZA LIMA'] as const;

/** Nombres cortos de los vendedores de Piura (nombre completo del CAP → nombre mostrado). */
export const NOMBRE_CORTO_PIURA: Record<string, string> = {
  'GARCIA ABAD JOSE DANIEL': 'DANIEL',
  'REYES TUANAMA MAYKY JORDAN': 'JORDAN',
  'GARCIA HUAYUNGA LEYDI GIANINA': 'LEYDI',
  'SANDOVAL MARIN LUZ GABRIELA': 'LUZ',
  'ZAPATA MENDOZA CINTHIA ELIZABETH': 'CINTHIA',
};

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

  /** Tienda "dueña" del asesor según el CAP (quién es, no dónde se etiquetó la venta).
   *  Chiclayo es el valor por defecto: cualquier nombre que no esté en el CAP de Piura
   *  ni de Lima (incluye vendedores aún no migrados o nombres no encontrados). */
  tiendaDeVendedor(asesor: string): string {
    const a = (asesor || '').toString().toUpperCase().trim();
    for (const t of TIENDAS_NUEVAS_REALZZA) if (this.mapa[t]?.includes(a)) return t;
    return 'REALZZA';
  }
}
