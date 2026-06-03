import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { PermissionsService, ModuleConfig, RolSedeCombinacion, COMBINACIONES, ALL_MODULES } from '../../services/permissions.service';

interface PermisoFila {
  modulo: ModuleConfig;
  combos: Record<string, boolean>;   // key = combinacion.key
}

@Component({
  selector: 'app-seguridad',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './seguridad.component.html',
  styleUrl: './seguridad.component.css'
})
export class SeguridadComponent implements OnInit {

  combinaciones: RolSedeCombinacion[] = COMBINACIONES;
  grupos: string[] = [];
  filas: PermisoFila[] = [];
  guardado = false;

  constructor(private permisos: PermissionsService) {}

  ngOnInit(): void {
    this.construirFilas();
    this.grupos = [...new Set(ALL_MODULES.map(m => m.grupo ?? '').filter(Boolean))];
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

  getModulosPorGrupo(grupo: string): PermisoFila[] {
    return this.filas.filter(f => (f.modulo.grupo ?? '') === grupo);
  }

  getModulosSinGrupo(): PermisoFila[] {
    return this.filas.filter(f => !f.modulo.grupo);
  }

  togglePermiso(fila: PermisoFila, comboKey: string): void {
    fila.combos[comboKey] = !fila.combos[comboKey];
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
