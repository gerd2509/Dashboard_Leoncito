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
