import { Injectable, inject } from '@angular/core';
import { SedeConfigService } from './sede-config.service';

export interface ModuleConfig {
  key: string;
  label: string;
  grupo?: string;
  sedeScoped?: boolean;
}

// ─── Perfiles de acceso ───────────────────────────────────────────────────────
// Un PERFIL agrupa sedes del mismo tipo/canal. La sede concreta sale del LOGIN
// (usuario.sede) y se mapea a un perfil; los permisos se definen por rol+perfil,
// NO por rol+sede. Así, agregar una sede Call nueva NO toca Seguridad.
export interface Perfil {
  key: string;     // 'call' | 'realzza'
  label: string;   // 'Sedes Call'
  detalle: string; // ayuda para la UI
}

export const PERFILES: Perfil[] = [
  { key: 'call',    label: 'Sedes Call', detalle: 'Ferreñafe, Olmos, Motupe… (+ supervisión "Todas")' },
  { key: 'realzza', label: 'Realzza',    detalle: 'Campo / Tienda Realzza' },
];

// Roles configurables en la matriz (admin es acceso total, no configurable).
export const ROLES_CONFIGURABLES = ['gerente', 'supervisor'];

// ─── Combinaciones Rol + Perfil (columnas de la matriz de Seguridad) ──────────
// Set FIJO y chico: NO crece al agregar sedes.
export interface RolPerfilCombinacion {
  key: string;    // 'gerente-call'
  label: string;  // 'Gerente — Sedes Call'
  rol: string;    // 'gerente'
  perfil: string; // 'call'
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const COMBINACIONES: RolPerfilCombinacion[] = PERFILES.flatMap(p =>
  ROLES_CONFIGURABLES.map(rol => ({
    key: `${rol}-${p.key}`,
    label: `${cap(rol)} — ${p.label}`,
    rol,
    perfil: p.key,
  }))
);

// ─── Todos los módulos del sistema ───────────────────────────────────────────
export const ALL_MODULES: ModuleConfig[] = [
  { key: 'agendamientos',                label: 'Agendamientos — Call Center',  grupo: 'Agendamientos' },
  { key: 'agendamientos-campo',          label: 'Agendamientos — Realzza',      grupo: 'Agendamientos' },
  { key: 'agendamientos-kommo',          label: 'Agendamientos — Kommo',        grupo: 'Agendamientos' },
  { key: 'agendamientos-sedes',          label: 'Agendamientos — Sedes',        grupo: 'Agendamientos', sedeScoped: true },
  { key: 'gestion',                      label: 'Gestión — Call Center',        grupo: 'Gestión' },
  { key: 'gestion-campo',                label: 'Gestión — Realzza',            grupo: 'Gestión' },
  { key: 'gestion-post-venta',           label: 'Gestión — Post Venta',         grupo: 'Gestión' },
  { key: 'gestion-kommo',                label: 'Gestión — Kommo',              grupo: 'Gestión' },
  { key: 'cierre',                       label: 'Cierre Gestión' },
  { key: 'ventas',                       label: 'Ventas — Call Center',         grupo: 'Ventas' },
  { key: 'ventas-campo',                 label: 'Ventas — Realzza',             grupo: 'Ventas' },
  { key: 'ventas-comparativo',           label: 'Ventas — Comparativo',         grupo: 'Ventas' },
  { key: 'evolucion-tipo-cliente',       label: 'Ventas — Evolutivo',           grupo: 'Ventas' },
  { key: 'ventas-sedes',                 label: 'Ventas — Sedes',               grupo: 'Ventas', sedeScoped: true },
  { key: 'ventas-plazo-av',              label: 'Ventas Plazo AV' },
  { key: 'conversor-csv',                label: 'Conversor CSV' },
  { key: 'limpieza-bbdd',                label: 'Limpieza BBDD' },
  { key: 'gps-ruta',                     label: 'Optimizar Rutas GPS' },
  { key: 'post-venta',                   label: 'Post Venta' },
  { key: 'gestion-sede',                 label: 'Gestión Sede',          grupo: 'Gestión', sedeScoped: true },
  { key: 'control-gestion-sede',         label: 'Control Gestión Sede',                    sedeScoped: true },
  { key: 'gestion-call-sedes',           label: 'Gestión Call Sedes',    grupo: 'Gestión', sedeScoped: true },
  { key: 'control-call-sedes',           label: 'Control Call Sedes',                      sedeScoped: true },
  { key: 'pizarra-metas',                label: 'Pizarra de Metas',                        sedeScoped: true },
  { key: 'avance-cartera',               label: 'Avance de Cartera' },
  { key: 'embudos-gestion',              label: 'Embudos de Gestión' },
  { key: 'registro-gestion',             label: 'Registro de Gestión',                     sedeScoped: true },
];

// ─── Permisos por defecto: clave = rol-perfil ─────────────────────────────────
const CALL_MODULES = [
  'agendamientos-sedes', 'gestion-sede', 'control-gestion-sede', 'gestion-call-sedes', 'control-call-sedes',
  'ventas-sedes', 'pizarra-metas', 'avance-cartera', 'embudos-gestion', 'registro-gestion',
];
const REALZZA_MODULES = [
  'agendamientos-campo', 'gestion-campo', 'ventas-campo', 'cierre', 'avance-cartera', 'embudos-gestion',
];

const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  'gerente-call':       [...CALL_MODULES],
  'supervisor-call':    [...CALL_MODULES],
  'gerente-realzza':    [...REALZZA_MODULES],
  'supervisor-realzza': [...REALZZA_MODULES],
};

const STORAGE_KEY = 'gd_permissions_v15';

@Injectable({ providedIn: 'root' })
export class PermissionsService {

  private sedeCfg = inject(SedeConfigService);

  readonly modules       = ALL_MODULES;
  readonly perfiles      = PERFILES;
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

  // Mapea la sede del usuario (del login) a un PERFIL de acceso.
  // Realzza → 'realzza'. Todo lo demás (sedes Call y 'todas') → 'call'.
  perfilDe(sede: string): string {
    const s = this.sedeCfg.normalizar(sede);
    if (s === 'realzza') return 'realzza';
    return 'call';
  }

  // Clave de permisos: rol-perfil
  private buildKey(rol: string, sede: string): string {
    return `${rol}-${this.perfilDe(sede)}`;
  }

  canAccess(moduleKey: string, rol: string, sede: string): boolean {
    if (rol === 'admin') return true;
    if (moduleKey === 'seguridad') return false;

    const allowed = this.permisos[this.buildKey(rol, sede)] ?? [];
    if (!allowed.includes(moduleKey)) return false;

    const mod = ALL_MODULES.find(m => m.key === moduleKey);
    if (mod?.sedeScoped) {
      // Requiere tener una sede asignada — vale una sede específica (ve solo esa)
      // o 'todas' (ve todas las sedes vía selector en el componente).
      return !!sede;
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
