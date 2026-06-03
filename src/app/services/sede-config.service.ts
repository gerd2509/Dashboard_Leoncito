import { Injectable } from '@angular/core';

export interface AsesorSede {
  value: string;
  viewValue: string;
}

export interface SedeConfig {
  nombre: string;       // Nombre para mostrar en UI
  endpointKey: string;  // Clave del endpoint backend (/data/[endpointKey])
  asesores: AsesorSede[];
}

// ──────────────────────────────────────────────────────────────
// REGISTRO DE SEDES
// Para agregar una sede nueva (ej: OLMOS):
//   1. Agrega una entrada aquí con su config
//   2. Agrega el endpoint /data/olmos en sheets-api/index.js
//   3. Listo — los componentes la usan automáticamente
// ──────────────────────────────────────────────────────────────
const SEDES: Record<string, SedeConfig> = {

  // Claves en ASCII simple para evitar conflictos de codificación Unicode (ñ, tildes)
  ferrenafe: {
    nombre: 'Ferreñafe',
    endpointKey: 'ferre',
    asesores: [
      { value: 'FE1',  viewValue: 'ESMERALDA CHICOMA' },
      { value: 'FE2',  viewValue: 'LUCIA RUIZ' },
      { value: 'FE3',  viewValue: 'IRENE CARRASCO' },
      { value: 'FE4',  viewValue: 'LISET NUÑEZ' },
      { value: 'FE5',  viewValue: 'PAOLA QUEZADA' },
      { value: 'FE6',  viewValue: 'NATALI MORANTE' },
      { value: 'FE7',  viewValue: 'DANITZA CESPEDES' },
      { value: 'FE8',  viewValue: 'ADRIANA GINES' },
      { value: 'FE9',  viewValue: 'JULISSA VILCHEZ' },
      { value: 'FE10', viewValue: 'DAYANA CIEZA' },
      { value: 'FE11', viewValue: 'ERICK CAJO' },
    ],
  },

  // ── Nuevas sedes: descomentar y completar cuando estén listas ──

  // olmos: {
  //   nombre: 'Olmos',
  //   endpointKey: 'olmos',
  //   asesores: [{ value: 'OL1', viewValue: 'NOMBRE ASESOR' }],
  // },

  // motupe: {
  //   nombre: 'Motupe',
  //   endpointKey: 'motupe',
  //   asesores: [{ value: 'MT1', viewValue: 'NOMBRE ASESOR' }],
  // },

  // lambayeque: {
  //   nombre: 'Lambayeque',
  //   endpointKey: 'lambayeque',
  //   asesores: [{ value: 'LB1', viewValue: 'NOMBRE ASESOR' }],
  // },
};

@Injectable({ providedIn: 'root' })
export class SedeConfigService {

  getConfig(sede: string): SedeConfig | null {
    return SEDES[this.normalizar(sede)] ?? null;
  }

  getSedes(): string[] {
    return Object.keys(SEDES);
  }

  existeSede(sede: string): boolean {
    return !!this.getConfig(sede);
  }

  // Convierte cualquier variante de sede a clave ASCII normalizada
  private normalizar(sede: string): string {
    return sede
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')   // elimina diacríticos (U+0300–U+036F)
      .replace(/ñ/g, 'n')           // ñ NFC precompuesto (por si NFD no lo descompuso)
      .replace(/ñ/g, 'n')     // n + tilde combinado NFD
      .replace(/[^a-z0-9]/g, '');        // elimina cualquier otro carácter no ASCII
  }
}
