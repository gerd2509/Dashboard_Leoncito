import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Observable } from 'rxjs';
import { environment } from '../../environments/environment';
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
  { key: 'zona',    label: 'Gerencia por Zona', detalle: 'Solo Control Gestión Sede, de su zona (Centro/Norte/Sur)' },
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
  { key: 'registro-supervisor',          label: 'Registro Supervisor — Realzza' },
  { key: 'control-supervisor',           label: 'Control Supervisor — Realzza' },
  { key: 'gestion-supervisor',           label: 'Gestión Supervisor — Realzza', grupo: 'Gestión' },
  { key: 'comparativo-cartera-ventas',   label: 'Comparativo Cartera Ventas Piso' },
];

// ─── Permisos por defecto: clave = rol-perfil ─────────────────────────────────
const CALL_MODULES = [
  'agendamientos-sedes', 'gestion-sede', 'control-gestion-sede', 'gestion-call-sedes', 'control-call-sedes',
  'ventas-sedes', 'pizarra-metas', 'avance-cartera', 'embudos-gestion', 'registro-gestion',
  'comparativo-cartera-ventas',
];
const REALZZA_MODULES = [
  'agendamientos-campo', 'gestion-campo', 'ventas-campo', 'cierre', 'avance-cartera', 'embudos-gestion',
  'registro-supervisor', 'control-supervisor', 'gestion-supervisor',
];

// Perfil "zona": gerencia que SOLO ve Control Gestión Sede (limitado a su zona).
const ZONA_MODULES = ['control-gestion-sede'];

const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  'gerente-call':       [...CALL_MODULES],
  'supervisor-call':    [...CALL_MODULES],
  'gerente-realzza':    [...REALZZA_MODULES],
  'supervisor-realzza': [...REALZZA_MODULES],
  'gerente-zona':       [...ZONA_MODULES],
  'supervisor-zona':    [...ZONA_MODULES],
};

const STORAGE_KEY = 'gd_permissions_v19';

@Injectable({ providedIn: 'root' })
export class PermissionsService {

  private sedeCfg = inject(SedeConfigService);
  private http = inject(HttpClient);
  private root = environment.apiBase;

  readonly modules       = ALL_MODULES;
  readonly perfiles      = PERFILES;
  readonly combinaciones = COMBINACIONES;

  private permisos: Record<string, string[]>;

  constructor() {
    // Arranca con lo que haya en localStorage/defaults (disponible de inmediato);
    // luego `cargarDesdeBackend()` refresca desde Neon (fuente de verdad).
    this.permisos = this.cargarDesdeStorage();
  }

  /** Carga la matriz de permisos desde la BD (Neon). Se llama al iniciar el dashboard.
   *  Las claves que existan en la BD ganan; las que no, usan los defaults del código. */
  async cargarDesdeBackend(): Promise<void> {
    try {
      const dbMap = await firstValueFrom(this.http.get<Record<string, string[]>>(`${this.root}/permisos`));
      const merged = this.copiarDefaults();
      if (dbMap) for (const k of Object.keys(dbMap)) merged[k] = [...(dbMap[k] || [])];
      this.permisos = merged;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.permisos));
    } catch {
      // Sin backend: se queda con lo ya cargado (localStorage/defaults).
    }
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
    if (s === 'centro' || s === 'norte' || s === 'sur') return 'zona';  // gerencia por zona
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

  /** Guarda la matriz en la BD (y en localStorage como caché). Devuelve el PUT. */
  setPermisos(nuevos: Record<string, string[]>): Observable<any> {
    this.permisos = Object.fromEntries(
      Object.entries(nuevos).map(([k, v]) => [k, [...v]])
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.permisos));
    return this.http.put(`${this.root}/permisos`, this.permisos);
  }

  tieneAcceso(moduleKey: string, rol: string, sede: string): boolean {
    if (rol === 'admin') return true;
    return (this.permisos[this.buildKey(rol, sede)] ?? []).includes(moduleKey);
  }

  /** Restablece a los defaults del código y los persiste en la BD. */
  restablecerDefaults(): Observable<any> {
    this.permisos = this.copiarDefaults();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.permisos));
    return this.http.put(`${this.root}/permisos`, this.permisos);
  }
}
