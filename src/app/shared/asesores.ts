// Listas de asesores de Call Center y Realzza (fuente única).
// Se usan en Cierre de Gestión y en Seguridad (selector de vendedor por canal),
// y luego en "Mi Panel" del vendedor.

export interface AsesorRef { value: string; nombre: string; }

export const ASESORES_CALL: AsesorRef[] = [
  { value: 'CC1',  nombre: 'MORETO DELGADO PATRICIA ESTEFANY' },
  { value: 'CC5',  nombre: 'QUISPE FONSECA KAREN AIMEE' },
  { value: 'CC6',  nombre: 'MORALES ÑIQUE MARIA CANDELARIA' },
  { value: 'CC12', nombre: 'BERNAL BAZAN BRENDA NICOL' },
  { value: 'CC15', nombre: 'TORRES ALVARADO JUDY ESMERALDA' },
  { value: 'CC19', nombre: 'SANDOVAL OTINIANO JUANA DEL PILAR' },
  { value: 'CC22', nombre: 'BERNAL BAZAN FABRICIO ROLANDO' },
  { value: 'CC26', nombre: 'RUIZ SAMPEN LUCRECIA NOEMI' },
];

export const ASESORES_REALZZA: AsesorRef[] = [
  { value: 'RZ1', nombre: 'MONTALVO LUYO ERNESTO ADOLFO' },
  { value: 'RZ2', nombre: 'ACOSTA JIMENEZ MARIELA NATALY' },
  { value: 'RZ3', nombre: 'PEREZ TINEO MARICIELO TATIANA' },
  { value: 'RZ4', nombre: 'RIVAS PURISACA KAREN YUDITH' },
  { value: 'RZ5', nombre: 'MIÑOPE GONZALES ANYELA ESTHEFANY' },
  { value: 'RZ6', nombre: 'UCHOFEN VIGO FELICITA' },
  { value: 'RZ7', nombre: 'SANTAMARIA GUZMAN MERLY BRIGHITE' },
  { value: 'RZ8', nombre: 'BUSTAMANTE CHALAN ANA RUT' },
  { value: 'RZ9', nombre: 'LLONTOP DAVILA DENNIS CHRISTIAN' },
  { value: 'RZ11', nombre: 'PEREZ TINEO WILLIAM HUMBERTO' },
  { value: 'RZ12', nombre: 'ORUE LIZARRAGA JESUS AUGUSTO LIZANDRO' },
  // Pasaron de Call a Realzza (mantienen su código CC).
  { value: 'CC8',  nombre: 'CHANTA CAMPOS KELLY KARINTIA' },
  { value: 'CC21', nombre: 'CHANAME SOTO ANITA NOEMI' },
];

/** Nombres (solo) de un canal Call/Realzza. */
export const nombresCall = () => ASESORES_CALL.map(a => a.nombre);
export const nombresRealzza = () => ASESORES_REALZZA.map(a => a.nombre);

/** Nombre completo (mayúsculas) → nombre corto para mostrar. Fuente única. */
export const NOMBRES_CORTOS: Record<string, string> = {
  // Realzza
  'MONTALVO LUYO ERNESTO ADOLFO': 'ERNESTO', 'PEREZ TINEO MARICIELO TATIANA': 'TATIANA',
  'RIVAS PURISACA KAREN YUDITH': 'YUDITH', 'ACOSTA JIMENEZ MARIELA NATALY': 'NATALY',
  'BERNAL BAZAN BRENDA NICOLL': 'BRENDA', 'BERNAL BAZAN BRENDA NICOL': 'BRENDA',
  'SERNAQUE DAVILA JUAN ALBERTO': 'JUAN', 'CARRANZA ALARCON TREYCI JOHANA': 'TREYCI',
  'SANTAMARIA GUZMAN MERLY BRIGHITE': 'MERLY',
  'MIÑOPE GONZALES ANYELA ESTHEFANY': 'ANYELA', 'SAMAME HUAMAN ARIADNE': 'ARIADNE',
  'UCHOFEN VIGO FELICITA': 'FELICITA', 'BUSTAMANTE CHALAN ANA RUT': 'ANA RUT',
  'LLONTOP DAVILA DENNIS CHRISTIAN': 'DENNIS', 'GUILLEN MACKUADO AURORA FERNANDA': 'AURORA',
  'PEREZ TINEO WILLIAM HUMBERTO': 'WILLIAM', 'ORUE LIZARRAGA JESUS AUGUSTO LIZANDRO': 'JESUS',
  // Call
  'MORETO DELGADO PATRICIA ESTEFANY': 'PATRICIA', 'QUISPE FONSECA KAREN AIMEE': 'KAREN',
  'MORALES ÑIQUE MARIA CANDELARIA': 'MARIA', 'CHANTA CAMPOS KELLY KARINTIA': 'KELLY',
  'TORRES ALVARADO JUDY ESMERALDA': 'ESMERALDA', 'CHANAME SOTO ANITA NOEMI': 'ANITA',
  'BERNAL BAZAN FABRICIO ROLANDO': 'FABRICIO', 'RUIZ SAMPEN LUCRECIA NOEMI': 'NOEMI',
  'SANDOVAL OTINIANO JUANA DEL PILAR': 'JUANA'
};

/**
 * Nombre corto para mostrar en la UI. Usa el mapa; si no está, aplica una
 * heurística para nombres peruanos (APELLIDO APELLIDO NOMBRE…): toma el 3er
 * token (primer nombre) si hay 3+, o el primero si no.
 */
export function nombreCorto(nombreCompleto: string): string {
  const n = (nombreCompleto || '').trim().toUpperCase();
  if (!n) return '';
  if (NOMBRES_CORTOS[n]) return NOMBRES_CORTOS[n];
  const parts = n.split(/\s+/).filter(Boolean);
  return parts.length >= 3 ? parts[2] : (parts[0] || n);
}
