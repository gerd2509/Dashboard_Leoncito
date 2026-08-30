export type Canal = 'LEONCITO' | 'REALZZA';

/**
 * Canal de KOMMO que le corresponde a un usuario según su rol/canal/sede:
 *  - admin  → '' (ve TODO: Leoncito + Realzza).
 *  - Realzza (rol/canal/sede que incluye "realzza") → 'REALZZA'.
 *  - resto (Call/Leoncito) → 'LEONCITO'.
 * Se usa para acotar el Registro KOMMO (qué puede registrar) y Gestión Kommo
 * (qué puede ver/editar): Call solo Leoncito, Realzza solo Realzza.
 */
// Módulos que revelan que el usuario maneja un canal (para decidir su vista de KOMMO).
const MODS_REALZZA = ['gestion-campo', 'ventas-campo', 'actividad-realzza', 'control-supervisor', 'gestion-supervisor', 'registro-supervisor', 'cierre'];
const MODS_CALL = ['gestion-sede', 'control-gestion-sede', 'gestion-call-sedes', 'control-call-sedes', 'atribucion-call', 'ventas-sedes'];

export function canalDeUsuario(u: any): '' | Canal {
  const rol = (u?.rol || '').toString().toLowerCase();
  if (rol === 'admin') return '';
  // Supervisor/gerente GENERAL (sede "Todas") → ve AMBOS canales (Leoncito + Realzza),
  // igual que admin. (La sede "Call" sí queda solo en Leoncito.)
  if ((u?.sede || '').toString().trim().toLowerCase() === 'todas') return '';
  // Caso especial BRENDA: sus VENTAS son Realzza, pero en KOMMO/gestión trabaja
  // como Leoncito (Call) — igual que su override de gestiones en Mi Panel. Solo ella.
  const ident = [(u?.usuario || ''), (u?.nombre || ''), (u?.vendedor || '')].join(' ').toUpperCase();
  if (ident.includes('BERNAL BAZAN BRENDA') || ident.includes('CC_BRENDA')) return 'LEONCITO';
  // Por PERMISOS propios: si tiene módulos de AMBOS canales → ve los dos (como Henry).
  // Solo de Realzza → REALZZA; solo de Call → LEONCITO.
  const mods = Array.isArray(u?.modulos) ? u.modulos : null;
  if (mods && mods.length) {
    const tR = mods.some((m: string) => MODS_REALZZA.includes(m));
    const tC = mods.some((m: string) => MODS_CALL.includes(m));
    if (tR && tC) return '';
    if (tR && !tC) return 'REALZZA';
    if (tC && !tR) return 'LEONCITO';
  }
  const campos = [rol, (u?.canal || ''), (u?.sede || '')].join(' ').toLowerCase();
  if (campos.includes('realzza')) return 'REALZZA';
  return 'LEONCITO';
}

/**
 * Nombre CANÓNICO del asesor para las GESTIONES: es el que guardan los registros
 * (Call/Realzza/KOMMO) y por el que Mi Panel filtra. Usa `vendedor` (identidad
 * estable) y NO `nombre` (que puede tener typos/variantes, p.ej. "Aurora Guilllen").
 * BRENDA se normaliza a la ortografía del Call ("...NICOL") para que empate con su
 * override en Mi Panel y con la data histórica. Solo ella.
 */
export function asesorGestion(u: any): string {
  const v = (u?.vendedor || u?.nombre || '').toString().trim();
  if (v.toUpperCase().includes('BERNAL BAZAN BRENDA')) return 'BERNAL BAZAN BRENDA NICOL';
  return v;
}
