import { Injectable } from '@angular/core';

export interface SedeConfig {
  nombre: string;          // Nombre para mostrar en UI: 'Ferreñafe'
  valorSede: string;       // Valor exacto en la columna 'TIENDA SEDE' del sheet
  columnaAsesor: string;   // Columna del asesor en el sheet: 'ASESOR DE VENTA FERREÑAFE'
  zona: 'NORTE' | 'SUR';   // Zona a la que pertenece la sede (para el resumen agrupado)
  metaCartasMensual: number;    // Meta mensual de cartas (la diaria = mensual / días del mes)
  metaLlamadasMensual: number;  // Meta mensual de llamadas (la diaria = mensual / días del mes)
  asesores: string[];      // Nombres completos de los asesores (tal cual el sheet)
}

// ──────────────────────────────────────────────────────────────────────────
// REGISTRO DE SEDES — Sheet unificado (columna TIENDA SEDE + ASESOR DE VENTA <SEDE>)
// La clave del diccionario es la sede normalizada en ASCII (sin ñ/tildes/espacios).
// ──────────────────────────────────────────────────────────────────────────
const SEDES: Record<string, SedeConfig> = {

  motupe: {
    nombre: 'Motupe',
    valorSede: 'Motupe',
    columnaAsesor: 'ASESOR DE VENTA MOTUPE',
    zona: 'NORTE',
    metaCartasMensual: 2080,
    metaLlamadasMensual: 8320,
    asesores: [
      'TANTARICO BANCES NARCISA GUADALUPE',
      'VALLEJOS CORTEZ LESLYE MILLEY',
      'SAUCEDO MONTALVO MIRELI ZULEIDY',
      'SALAZAR ATOCHE SANDRA ROXANA',
      'RAMOS DE LA CRUZ LUZ CLARITA',
      'MORI FALLA LUIS ANGEL',
      'MORON CORREA LEIDY ROSSMERI',
      'MORANTE SANCHEZ ITATY ANHELY',
      'HERRERA PISCOYA LUIS ANTONIO',
      'VASQUEZ VALIENTE LESLIE SARAI',
    ],
  },

  olmos: {
    nombre: 'Olmos',
    valorSede: 'Olmos',
    columnaAsesor: 'ASESOR DE VENTA OLMOS',
    zona: 'NORTE',
    metaCartasMensual: 2080,
    metaLlamadasMensual: 8320,
    asesores: [
      'CHUMAN TESEN MIRELLA BRIGHIT',
      'CRISANTO RAMON FIORELLA',
      'SANCHEZ ELORREAGA MARIA ELIZABETH',
      'TESEN TEJADA JOEL ALEXANDER',
      'ARROYO SOPLOPUCO ROSA ELENA',
      'MONTEZA MIRES TATIANA',
      'AGUILAR BENITES FELICIA NAYELI',
      'ARROYO COICO DELMA MARIA',
      'SANCHEZ SERRATO MARINA DEL CARMEN',
      'NUNURA QUINTANA LUZMIRA DE LOS MILAGROS',
      'ROQUE OLAZABAL JHORDY PAUL',
      'MAYANGA RAMIREZ CINTHIA GASDALY',
      'PEÑA NUÑEZ MERCEDES MAVEL',
      'ABAD LIZANA SILVIA HAYDEE',
    ],
  },

  ferrenafe: {
    nombre: 'Ferreñafe',
    valorSede: 'Ferreñafe',
    columnaAsesor: 'ASESOR DE VENTA FERREÑAFE',
    zona: 'SUR',
    metaCartasMensual: 1820,
    metaLlamadasMensual: 7280,
    asesores: [
      'CHICOMA ROJAS ESMERALDA DEL CARMEN',
      'RUIZ AGAPITO LUCIA DEL PILAR',
      'MORANTE AREVALO NATALIE DE LOS ANGELES',
      'CARRASCO SIESQUEN IRENE YAOSCA',
      'AMAYA ZEÑA DARIANA NEDALY',
      'QUEZADA MENDOZA CINTHIA PAOLA',
      'GINES SALINAS ADRIANA NAYELI',
      'NUÑEZ SAMAME LISET ANAIS',
      'FARRO PISCOYA ROSA ANGELA',
      'VALDERRAMA PURIZACA ERICK CARLOS DAVID',
      'VALDERRAMA PURIZACA RONALD ABRAHAM',
      'CESPEDES CESPEDES DANITZA JUBIDITH',
      'QUINTANA AGIP ANGELICA MARIA',
      'SIADEN MERINO ROXANA DEL PILAR',
      'SANCHEZ MANAYAY CARLOS DANIEL',
    ],
  },

  jayanca: {
    nombre: 'Jayanca',
    valorSede: 'Jayanca',
    columnaAsesor: 'ASESOR DE VENTA JAYANCA',
    zona: 'NORTE',
    metaCartasMensual: 1170,
    metaLlamadasMensual: 4680,
    asesores: [
      'ESPINOZA PERLECHE DEYSI YANET',
      'GARCIA SANTOYO YULISSA',
      'SANCHEZ VELIZ MARIA ANGELICA',
      'LOPEZ SANCHEZ PEDRO RONALD',
      'RODRIGUEZ NAVARRETE DANIKSA JUANA ISABEL',
      'GUERRERO LOPEZ EMILIM ALEXANDRA',
      'VILLOSLADA ABAD LIZ SILENI',
      'ACOSTA RETES FRANCISCO LORENZO',
    ],
  },

  mochumi: {
    nombre: 'Mochumi',
    valorSede: 'Mochumi',
    columnaAsesor: 'ASESOR DE VENTA MOCHUMI',
    zona: 'SUR',
    metaCartasMensual: 1170,
    metaLlamadasMensual: 4680,
    asesores: [
      'LOPEZ MARTINEZ NANCY ERITA',
      'RAMIREZ AGUIRRE DANNA MILEN',
      'SANDOVAL BANCES ROSA YULIANA',
      'YNOÑAN TIMANA GIAN PIEER ALEXANDER',
      'SIALER MORENO CINTHIA SAMANTHA',
      'YESQUEN MACALOPU CAROLINA NATIVIDAD',
      'TUÑOQUE NIZAMA DANICSA JACKELINE',
      'REYES VASQUEZ JHOJANA DE LOS ANGELES',
      'DAMIAN QUEREBALU JORDAN',
      'SANTISTEBAN BANCES BERTHA MARIBEL',
      'CAJUSOL CHAPOÑAN ROSA JIMENA',
      'ROJAS ZEÑA ROSA MILAGROS',
      'BALDERA SANTAMARIA FIORELLA AZUCENA',
    ],
  },

  morrope: {
    nombre: 'Morrope',
    valorSede: 'Morrope',
    columnaAsesor: 'ASESOR DE VENTA MORROPE',
    zona: 'SUR',
    metaCartasMensual: 1170,
    metaLlamadasMensual: 4680,
    asesores: [
      'CABREJOS BALLADARES FLOR DE MARIA',
      'CUNEO BRAVO MARIANELA DEL CARMEN',
      'CHIROQUE PASAPERA NIXON JUNIOR',
      'JUAREZ INOÑAN MERLY JOHANA',
      'SANTAMARIA BALLENA LUZ MARISELA',
      'VARGAS MEZA BRIYIN ERLIN',
      'VALDERA VIDAURRE VIVIANA YUDIT',
      'SIESQUEN DAMIAN ARELIS MARIANA',
      'BANCES SANCHEZ MARIA IRMA',
      'SANCHEZ SANTISTEBAN YULY JOSEFA',
      'BRAVO BARBOZA GABY MALENA',
      'SIESQUEN SANDOVAL ELIZABETH',
      'CAJUSOL SANTISTEBAN JESUS DEL CARMEN',
      'SANTISTEBAN LLAUCE MARIA FLOR',
      'CHAPOÑAN HUIMAN DAVID JOSUE',
    ],
  },

  lambayeque: {
    nombre: 'Lambayeque',
    valorSede: 'Lambayeque',
    columnaAsesor: 'ASESOR DE VENTA LAMBAYEQUE',
    zona: 'SUR',
    metaCartasMensual: 2080,
    metaLlamadasMensual: 8320,
    asesores: [
      'PAIVA ROJAS ANTHONNY RAY AMERICO',
      'CASTILLO AGUILAR ANYELA VANESSA',
      'SANDOVAL CHAFLOQUE BRISA ALEXANDRA',
      'DAMIAN CASTRO JENNIFER MARIBEL',
      'SANTAMARIA SANTISTEBAN MARIA DE LOS ANGELES',
      'DIAZ SAAVEDRA HAYDE ROSMERY',
      'FUENTES ACOSTA VILMER ADRIAN',
      'SANDOVAL ZEÑA BRENDA DEL PILAR',
      'SANDOVAL YNOÑAN INGRID TATIANA',
      'VENTURA SANDOVAL KARINA LILIANA',
      'MACO SANTAMARIA KASSANDRA ROSMERY',
      'SANTISTEBAN SANTAMARIA MILAGROS ELISABET',
      'SOSA CHERO CARIMETH LISSETH',
      'RIVADENEIRA CARRASCO CIELO BELEN',
      'BARRIOS ROJAS CRISTINA',
      'MANAYAY CARRILLO NATALI DEL PILAR',
      'LLONTO CHAPOÑAN NAYELI NICOL',
      'RIVADENEIRA PURIHUAMAN KARLA STEFANIA',
      'CAMPOS NUÑEZ LUZ LEIDY',
      'ZAPATA CAMPOS VALERIA PAOLA',
      'CHAPOÑAN SANCHEZ EUGENIO VICENTE',
      'SANDOVAL SANTISTEBAN CARMEN DEL PILAR',
      'CUNEO LLAUCE LUZ MARIELITA',
      'ASTUDILLO ARRIAGA MARTHA CONSUELO',
      'SANTAMARIA AREVALO MILICOR DIGNA',
      'ODAR RODRIGUEZ TATTIAN ZULEME',
    ],
  },

  oyotun: {
    nombre: 'Oyotun',
    valorSede: 'Oyotun',
    columnaAsesor: 'ASESOR DE VENTA OYOTUN',
    zona: 'SUR',
    metaCartasMensual: 650,
    metaLlamadasMensual: 2600,
    asesores: [
      'CORTES SUYON LUZ MARIBEL',
      'BECERRA ASTOCHADO VIOLETA ISABEL',
      'GUERRERO CORTEZ ALEXIA JIMENA',
      'YGLESIAS CORREA ELENIN',
      'RODRIGUEZ VALLEJOS AZUL GUADALUPE',
      'CRUZADO VALVERDE MARISOL ROXANA',
      'ZELADA INFANTES LEYDI NICOLE',
      'CHAVEZ GUEVERA JULIA ESPERANZA',
    ],
  },

  cayalti: {
    nombre: 'Cayalti',
    valorSede: 'Cayalti',
    columnaAsesor: 'ASESOR DE VENTA CAYALTI',
    zona: 'SUR',
    metaCartasMensual: 1170,
    metaLlamadasMensual: 4680,
    asesores: [
      'URIARTE RAMOS LIZBETH DEL MILAGRO',
      'VASQUEZ BENAVIDES VANESSA LIZETH',
      'MUÑOZ LESCANO DANIELA HALENNA',
      'RODRIGUEZ CALLIRGOS MELIZA DEL CARMEN',
      'RODRIGUEZ ALVARADO NATALIE XIOMARA',
      'MAURICIO TIRADO ANGELO JOZAEL',
      'CARUAJULCA ACUÑA KATHERIN PAOLA',
      'CORTEZ MARIN ANGELA INDIRA DEL ROSARIO',
      'GONZALES URBINA GREGORY YANPIER',
      'ALVARADO SAUCEDO PEDRO ALCIDES',
      'MALUQUI SAUCEDO SUSETY VERENIS',
      'WALTER TELLO FABIOLA IRENE',
    ],
  },

  chongoyape: {
    nombre: 'Chongoyape',
    valorSede: 'Chongoyape',
    columnaAsesor: 'ASESOR DE VENTA CHONGOYAPE',
    zona: 'SUR',
    metaCartasMensual: 650,
    metaLlamadasMensual: 2600,
    asesores: [
      'BELEN CARRASCO MARYORI JAHAIRA',
      'GUEVARA BENAVIDES CARMEN ROSA',
      'SALAZAR GUEVARA BLIMA KARELIS',
      'VILCHEZ TANTALEAN YONELY',
      'TINEO ESPINO LILISETH DEL MILAGRO',
      'PEREZ CABREJOS GUADALUPE TATIANA',
    ],
  },
};

// Claves (normalizadas) de las sedes que se gestionan por Call Center.
// Activas: Ferreñafe, Olmos, Motupe, Cayaltí, Oyotún y Chongoyape.
const CALL_SEDES = ['ferrenafe', 'olmos', 'motupe', 'cayalti', 'oyotun', 'chongoyape'];

@Injectable({ providedIn: 'root' })
export class SedeConfigService {

  getConfig(sede: string): SedeConfig | null {
    return SEDES[this.normalizar(sede)] ?? null;
  }

  // Todas las claves de sede registradas (normalizadas)
  getSedeKeys(): string[] {
    return Object.keys(SEDES);
  }

  // Lista para combos: [{ key, nombre }]
  getSedesParaCombo(): { key: string; nombre: string }[] {
    return Object.entries(SEDES).map(([key, cfg]) => ({ key, nombre: cfg.nombre }));
  }

  // Sedes que operan vía Call Center (gestión por formulario).
  // Hoy: Ferreñafe. Agregar aquí la clave normalizada cuando se sumen Olmos / Motupe, etc.
  getSedesCall(): { key: string; nombre: string }[] {
    return CALL_SEDES
      .filter(key => SEDES[key])
      .map(key => ({ key, nombre: SEDES[key].nombre }));
  }

  esSedeCall(sede: string): boolean {
    return CALL_SEDES.includes(this.normalizar(sede));
  }

  existeSede(sede: string): boolean {
    return !!this.getConfig(sede);
  }

  // Compara dos nombres de sede ignorando ñ/tildes/mayúsculas
  mismaSede(a: string, b: string): boolean {
    return this.normalizar(a) === this.normalizar(b);
  }

  // Convierte cualquier variante de sede a clave ASCII normalizada
  normalizar(sede: string): string {
    return (sede || '')
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')   // elimina diacríticos (tildes)
      .replace(/ñ/g, 'n')
      .replace(/[^a-z0-9]/g, '');        // elimina cualquier otro carácter no ASCII
  }
}
