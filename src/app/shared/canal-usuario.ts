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
  const campos = [rol, (u?.canal || ''), (u?.sede || '')].join(' ').toLowerCase();
  if (campos.includes('realzza')) return 'REALZZA';
  return 'LEONCITO';
}
