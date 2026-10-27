import { CapSedesService } from '../services/cap-sedes.service';

/** Tiendas Realzza nuevas (Piura/Lima). Chiclayo ('REALZZA') es todo lo que no sea de estas. */
export const TIENDAS_NUEVAS_REALZZA = ['REALZZA PIURA', 'REALZZA LIMA'] as const;

/** Las 3 tiendas Realzza, TODAS con roster vigente en el Maestro CAP (ya no hay
 *  lista hardcodeada para Chiclayo). La clave interna de Chiclayo es 'REALZZA'
 *  (así se usa en combos/filtros en toda la app), pero en el CAP su sede se
 *  guarda como "REALZZA CHICLAYO" — de ahí el mapeo. */
export const TIENDAS_REALZZA_TODAS = ['REALZZA', 'REALZZA PIURA', 'REALZZA LIMA'] as const;
const SEDE_CAP_DE_TIENDA: Record<string, string> = {
  'REALZZA': 'REALZZA CHICLAYO', 'REALZZA PIURA': 'REALZZA PIURA', 'REALZZA LIMA': 'REALZZA LIMA',
};

/** Nombres cortos de los vendedores de Piura (nombre completo del CAP → nombre mostrado). */
export const NOMBRE_CORTO_PIURA: Record<string, string> = {
  'GARCIA ABAD JOSE DANIEL': 'DANIEL',
  'GARCIA HUAYUNGA LEYDI GIANINA': 'LEYDI',
  'SANDOVAL MARIN LUZ GABRIELA': 'LUZ',
  'ZAPATA MENDOZA CINTHIA ELIZABETH': 'CINTHIA',
  'SIALER CARILLO JESUS EDGARDO': 'JESUS',
  'CASAS AGUIRRE ANDY ENRIQUE': 'ANDY',
};

/**
 * Asesores activos por tienda Realzza (Chiclayo/Piura/Lima) según el CAP. Sirve a la
 * supervisión (Control, Registro y Gestión Supervisor, Actividad, Cierre Gestión) para
 * acotar a la tienda elegida — Chiclayo YA NO vive hardcodeada en el código: sale del
 * Maestro CAP igual que Piura/Lima, así una baja/alta ahí se refleja sola en toda la app.
 */
export class AsesoresPorTienda {
  private mapa: Record<string, string[]> = {};

  constructor(private cap: CapSedesService) {}

  async cargar(): Promise<void> {
    for (const t of TIENDAS_REALZZA_TODAS) this.mapa[t] = await this.cap.vendedoresActivos(SEDE_CAP_DE_TIENDA[t]);
  }

  /** Lista de asesores de una tienda Realzza (null si la tienda no es Realzza). */
  listaDe(tienda: string): string[] | null {
    return (TIENDAS_REALZZA_TODAS as readonly string[]).includes(tienda) ? this.mapa[tienda] : null;
  }

  /** ¿El asesor pertenece a la tienda (según el CAP)? */
  pertenece(asesor: string, tienda: string): boolean {
    const a = (asesor || '').toString().toUpperCase().trim();
    return !!this.mapa[tienda]?.includes(a);
  }

  /** Tienda "dueña" del asesor según el CAP (quién es, no dónde se etiquetó la venta).
   *  Si el vendedor no está en el CAP de ninguna tienda Realzza — un asesor de Call (sin
   *  tienda propia) o un vendedor real aún no sincronizado al CAP — NO hay forma
   *  confiable de saber su tienda "dueña"; se usa `fallback` (la tienda FÍSICA donde
   *  se etiquetó la venta) en vez de asumir Chiclayo a ciegas, que atribuía mal tanto
   *  ventas de Call hechas en Piura/Lima como ventas reales de vendedores nuevos que
   *  el CAP todavía no tiene cargados. */
  tiendaDeVendedor(asesor: string, fallback: string = 'REALZZA'): string {
    const a = (asesor || '').toString().toUpperCase().trim();
    for (const t of TIENDAS_REALZZA_TODAS) if (this.mapa[t]?.includes(a)) return t;
    return fallback;
  }
}
