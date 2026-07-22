// Listas de asesores de Call Center y Realzza (fuente única).
// Se usan en Cierre de Gestión y en Seguridad (selector de vendedor por canal),
// y luego en "Mi Panel" del vendedor.

export interface AsesorRef { value: string; nombre: string; }

export const ASESORES_CALL: AsesorRef[] = [
  { value: 'CC1',  nombre: 'MORETO DELGADO PATRICIA ESTEFANY' },
  { value: 'CC5',  nombre: 'QUISPE FONSECA KAREN AIMEE' },
  { value: 'CC6',  nombre: 'MORALES ÑIQUE MARIA CANDELARIA' },
  { value: 'CC8',  nombre: 'CHANTA CAMPOS KELLY KARINTIA' },
  { value: 'CC12', nombre: 'BERNAL BAZAN BRENDA NICOL' },
  { value: 'CC15', nombre: 'TORRES ALVARADO JUDY ESMERALDA' },
  { value: 'CC21', nombre: 'CHANAME SOTO ANITA NOEMI' },
  { value: 'CC22', nombre: 'BERNAL BAZAN FABRICIO ROLANDO' },
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
];

/** Nombres (solo) de un canal Call/Realzza. */
export const nombresCall = () => ASESORES_CALL.map(a => a.nombre);
export const nombresRealzza = () => ASESORES_REALZZA.map(a => a.nombre);
