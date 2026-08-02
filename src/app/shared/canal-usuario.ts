export type Canal = 'LEONCITO' | 'REALZZA';

/**
 * Canal de KOMMO que le corresponde a un usuario según su rol/canal/sede:
 *  - admin  → '' (ve TODO: Leoncito + Realzza).
 *  - Realzza (rol/canal/sede que incluye "realzza") → 'REALZZA'.
 *  - resto (Call/Leoncito) → 'LEONCITO'.
 * Se usa para acotar el Registro KOMMO (qué puede registrar) y Gestión Kommo
 * (qué puede ver/editar): Call solo Leoncito, Realzza solo Realzza.
 */
export function canalDeUsuario(u: any): '' | Canal {
  const rol = (u?.rol || '').toString().toLowerCase();
  if (rol === 'admin') return '';
  // Caso especial BRENDA: sus VENTAS son Realzza, pero en KOMMO/gestión trabaja
  // como Leoncito (Call) — igual que su override de gestiones en Mi Panel. Solo ella.
  const ident = [(u?.usuario || ''), (u?.nombre || ''), (u?.vendedor || '')].join(' ').toUpperCase();
  if (ident.includes('BERNAL BAZAN BRENDA') || ident.includes('CC_BRENDA')) return 'LEONCITO';
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
