import { Injectable } from '@angular/core';

export interface ModuleConfig {
  key: string;
  label: string;
  grupo?: string;
  sedeScoped?: boolean;
}

// ─── Combinaciones Rol+Sede configurables ────────────────────────────────────
// Para agregar nueva sede: descomentar/agregar la entrada correspondiente
export interface RolSedeCombinacion {
  key: string;    // clave de permisos: 'gerente-ferrenafe'
  label: string;  // etiqueta en UI:   'Gerente — Ferreñafe'
  rol: string;    // 'gerente'
  sede: string;   // sede normalizada: 'ferrenafe'
}

export const COMBINACIONES: RolSedeCombinacion[] = [
  { key: 'gerente-ferrenafe',    label: 'Gerente — Ferreñafe',    rol: 'gerente',    sede: 'ferrenafe' },
  { key: 'supervisor-ferrenafe', label: 'Supervisor — Ferreñafe', rol: 'supervisor', sede: 'ferrenafe' },
  { key: 'gerente-realzza',      label: 'Gerente — Realzza',      rol: 'gerente',    sede: 'realzza' },

  // Descomentar cuando se implemente la sede:
  // { key: 'supervisor-realzza',   label: 'Supervisor — Realzza',   rol: 'supervisor', sede: 'realzza' },
  // { key: 'gerente-olmos',        label: 'Gerente — Olmos',        rol: 'gerente',    sede: 'olmos' },
  // { key: 'gerente-motupe',       label: 'Gerente — Motupe',       rol: 'gerente',    sede: 'motupe' },
  // { key: 'gerente-lambayeque',   label: 'Gerente — Lambayeque',   rol: 'gerente',    sede: 'lambayeque' },
];

// ─── Todos los módulos del sistema ───────────────────────────────────────────
export const ALL_MODULES: ModuleConfig[] = [
  { key: 'agendamientos',                label: 'Agendamientos — Call Center',  grupo: 'Agendamientos' },
  { key: 'agendamientos-campo',          label: 'Agendamientos — Realzza',      grupo: 'Agendamientos' },
  { key: 'agendamientos-kommo',          label: 'Agendamientos — Kommo',        grupo: 'Agendamientos' },
  { key: 'terceros',                     label: 'Terceros' },
  { key: 'gestion',                      label: 'Gestión — Call Center',        grupo: 'Gestión' },
  { key: 'gestion-campo',                label: 'Gestión — Realzza',            grupo: 'Gestión' },
  { key: 'gestion-post-venta',           label: 'Gestión — Post Venta',         grupo: 'Gestión' },
  { key: 'gestion-kommo',                label: 'Gestión — Kommo',              grupo: 'Gestión' },
  { key: 'cierre',                       label: 'Cierre Gestión' },
  { key: 'analisis',                     label: 'Análisis Mensual' },
  { key: 'ventas',                       label: 'Ventas — Call Center',         grupo: 'Ventas' },
  { key: 'ventas-campo',                 label: 'Ventas — Realzza',             grupo: 'Ventas' },
  { key: 'ventas-comparativo',           label: 'Ventas — Comparativo',         grupo: 'Ventas' },
  { key: 'evolucion-tipo-cliente',       label: 'Ventas — Evolutivo',           grupo: 'Ventas' },
  { key: 'ventas-brilla-realzza',        label: 'Ventas Brilla Realzza' },
  { key: 'ventas-cuotas-tipoVenta',      label: 'Ventas Cuotas Tipo Venta' },
  { key: 'ventas-plazo-av',              label: 'Ventas Plazo AV' },
  { key: 'proyeccion-comparativo',       label: 'Proyección Call' },
  { key: 'proyeccion-comparativo-campo', label: 'Proyección Campo' },
  { key: 'cobranzas',                    label: 'Cobranzas' },
  { key: 'conversor-csv',                label: 'Conversor CSV' },
  { key: 'post-venta',                   label: 'Post Venta' },
  { key: 'gestion-sede',                 label: 'Gestión Sede',          grupo: 'Gestión', sedeScoped: true },
  { key: 'control-gestion-sede',         label: 'Control Gestión Sede',                    sedeScoped: true },
];

// ─── Permisos por defecto: clave = rol-sede ───────────────────────────────────
const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  // Ferreñafe
  'gerente-ferrenafe':    ['gestion-sede', 'control-gestion-sede'],
  'supervisor-ferrenafe': ['gestion-sede', 'control-gestion-sede'],

  // Realzza — módulos disponibles en el sistema
  'gerente-realzza': [
    'agendamientos-campo',
    'gestion-campo',
    'ventas-campo',
    'ventas-brilla-realzza',
    'proyeccion-comparativo-campo',
  ],

  // Descomentar y ajustar cuando se implementen:
  // 'supervisor-realzza': ['agendamientos-campo', 'gestion-campo'],
  // 'gerente-olmos':      ['gestion-sede', 'control-gestion-sede'],
};

const STORAGE_KEY = 'gd_permissions_v2';

@Injectable({ providedIn: 'root' })
export class PermissionsService {

  readonly modules      = ALL_MODULES;
  readonly combinaciones = COMBINACIONES;

  private permisos: Record<string, string[]>;

  constructor() {
    this.permisos = this.cargarDesdeStorage();
  }

  private cargarDesdeStorage(): Record<string, string[]> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return this.copiarDefaults();
  }

  private copiarDefaults(): Record<string, string[]> {
    return Object.fromEntries(
      Object.entries(DEFAULT_PERMISSIONS).map(([k, v]) => [k, [...v]])
    );
  }

  // Clave de permisos: rol-sede normalizada
  private buildKey(rol: string, sede: string): string {
    const sedeNorm = sede
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '');
    return `${rol}-${sedeNorm}`;
  }

  canAccess(moduleKey: string, rol: string, sede: string): boolean {
    if (rol === 'admin') return true;
    if (moduleKey === 'seguridad') return false;

    const key     = this.buildKey(rol, sede);
    const allowed = this.permisos[key] ?? [];
    if (!allowed.includes(moduleKey)) return false;

    const mod = ALL_MODULES.find(m => m.key === moduleKey);
    if (mod?.sedeScoped) {
      return !!sede && sede.toLowerCase() !== 'todas';
    }
    return true;
  }

  getPermisos(): Record<string, string[]> {
    return Object.fromEntries(
      Object.entries(this.permisos).map(([k, v]) => [k, [...v]])
    );
  }

  setPermisos(nuevos: Record<string, string[]>): void {
    this.permisos = Object.fromEntries(
      Object.entries(nuevos).map(([k, v]) => [k, [...v]])
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.permisos));
  }

  tieneAcceso(moduleKey: string, rol: string, sede: string): boolean {
    if (rol === 'admin') return true;
    return (this.permisos[this.buildKey(rol, sede)] ?? []).includes(moduleKey);
  }

  restablecerDefaults(): void {
    this.permisos = this.copiarDefaults();
    localStorage.removeItem(STORAGE_KEY);
  }
}
