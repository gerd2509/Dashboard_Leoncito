import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import {
  PermissionsService, ModuleConfig, RolPerfilCombinacion,
  COMBINACIONES, ALL_MODULES, PERFILES, Perfil,
} from '../../services/permissions.service';
import { SedeConfigService } from '../../services/sede-config.service';

interface PermisoFila {
  modulo: ModuleConfig;
  combos: Record<string, boolean>;   // key = combinacion.key (rol-perfil)
}

@Component({
  selector: 'app-seguridad',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './seguridad.component.html',
  styleUrl: './seguridad.component.css'
})
export class SeguridadComponent implements OnInit {

  private permisos = inject(PermissionsService);
  private sedeCfg  = inject(SedeConfigService);

  combinaciones: RolPerfilCombinacion[] = COMBINACIONES;
  perfiles: Perfil[] = PERFILES;
  grupos: string[] = [];
  filas: PermisoFila[] = [];
  guardado = false;

  filtro = '';
  sedesPorPerfil: { perfil: Perfil; sedes: string[] }[] = [];

  ngOnInit(): void {
    this.construirFilas();
    this.grupos = [...new Set(ALL_MODULES.map(m => m.grupo ?? '').filter(Boolean))];
    this.construirSedesPorPerfil();
  }

  private construirFilas(): void {
    const current = this.permisos.getPermisos();
    this.filas = ALL_MODULES.map(mod => ({
      modulo: mod,
      combos: Object.fromEntries(
        COMBINACIONES.map(c => [c.key, (current[c.key] ?? []).includes(mod.key)])
      )
    }));
  }

  // Mapa informativo (solo lectura): qué sedes caen en cada perfil
  private construirSedesPorPerfil(): void {
    const nombres = [...this.sedeCfg.getSedesParaCombo().map(s => s.nombre), 'Realzza', 'Todas'];
    this.sedesPorPerfil = this.perfiles.map(p => ({
      perfil: p,
      sedes: nombres.filter(nom => this.permisos.perfilDe(nom) === p.key),
    }));
  }

  private coincide(fila: PermisoFila): boolean {
    const t = this.filtro.trim().toLowerCase();
    return !t || fila.modulo.label.toLowerCase().includes(t);
  }

  getModulosPorGrupo(grupo: string): PermisoFila[] {
    return this.filas.filter(f => (f.modulo.grupo ?? '') === grupo && this.coincide(f));
  }

  getModulosSinGrupo(): PermisoFila[] {
    return this.filas.filter(f => !f.modulo.grupo && this.coincide(f));
  }

  gruposVisibles(): string[] {
    return this.grupos.filter(g => this.getModulosPorGrupo(g).length > 0);
  }

  togglePermiso(fila: PermisoFila, comboKey: string): void {
    fila.combos[comboKey] = !fila.combos[comboKey];
    this.guardado = false;
  }

  // Activa/desactiva TODOS los módulos visibles (según filtro) para una columna
  toggleColumna(comboKey: string): void {
    const visibles = this.filas.filter(f => this.coincide(f));
    const todosActivos = visibles.length > 0 && visibles.every(f => f.combos[comboKey]);
    visibles.forEach(f => f.combos[comboKey] = !todosActivos);
    this.guardado = false;
  }

  guardar(): void {
    const nuevos: Record<string, string[]> = {};
    for (const combo of COMBINACIONES) {
      nuevos[combo.key] = this.filas
        .filter(f => f.combos[combo.key])
        .map(f => f.modulo.key);
    }
    this.permisos.setPermisos(nuevos);
    this.guardado = true;
    setTimeout(() => this.guardado = false, 3000);
  }

  restablecer(): void {
    this.permisos.restablecerDefaults();
    this.construirFilas();
    this.guardado = false;
  }

  countActivos(comboKey: string): number {
    return this.filas.filter(f => f.combos[comboKey]).length;
  }
}
