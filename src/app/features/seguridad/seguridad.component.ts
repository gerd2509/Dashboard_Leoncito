import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  PermissionsService, ModuleConfig, RolPerfilCombinacion,
  COMBINACIONES, ALL_MODULES, PERFILES, Perfil,
} from '../../services/permissions.service';
import { SedeConfigService } from '../../services/sede-config.service';
import { UsuariosService, UsuarioDB } from '../../services/usuarios.service';

interface PermisoFila {
  modulo: ModuleConfig;
  combos: Record<string, boolean>;   // key = combinacion.key (rol-perfil)
}

@Component({
  selector: 'app-seguridad',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatSnackBarModule],
  templateUrl: './seguridad.component.html',
  styleUrl: './seguridad.component.css'
})
export class SeguridadComponent implements OnInit {

  private permisos = inject(PermissionsService);
  private sedeCfg  = inject(SedeConfigService);
  private usuariosSvc = inject(UsuariosService);
  private snack = inject(MatSnackBar);

  /** Toast de confirmación / error (arriba a la derecha). */
  private toast(msg: string, tipo: 'ok' | 'error' = 'ok'): void {
    this.snack.open(msg, 'OK', {
      duration: 3500,
      horizontalPosition: 'end',
      verticalPosition: 'top',
      panelClass: tipo === 'ok' ? 'toast-ok' : 'toast-error',
    });
  }

  combinaciones: RolPerfilCombinacion[] = COMBINACIONES;
  perfiles: Perfil[] = PERFILES;
  grupos: string[] = [];
  filas: PermisoFila[] = [];
  guardado = false;

  filtro = '';
  sedesPorPerfil: { perfil: Perfil; sedes: string[] }[] = [];

  // ── Pestañas ──
  vista: 'usuarios' | 'permisos' = 'usuarios';

  // ── Usuarios ──
  usuarios: UsuarioDB[] = [];
  cargandoU = false;
  errorU = '';
  mostrarForm = false;
  editId: number | null = null;
  guardandoU = false;
  errorForm = '';
  form = { usuario: '', nombre: '', rol: 'gerente', sede: 'todas', password: '', activo: true };

  readonly rolOptions = [
    { value: 'admin', label: 'Admin' },
    { value: 'gerente', label: 'Gerente' },
    { value: 'supervisor', label: 'Supervisor' },
    { value: 'vendedor', label: 'Vendedor' },
  ];
  sedeOptions: { value: string; label: string }[] = [];

  ngOnInit(): void {
    this.construirFilas();
    this.grupos = [...new Set(ALL_MODULES.map(m => m.grupo ?? '').filter(Boolean))];
    this.construirSedesPorPerfil();

    this.sedeOptions = [
      { value: 'todas', label: 'Todas' },
      { value: 'realzza', label: 'Realzza' },
      ...this.sedeCfg.getSedesParaCombo().map(s => ({ value: s.key, label: s.nombre })),
    ];
    this.cargarUsuarios();
  }

  // ── Usuarios: carga y CRUD ──
  cargarUsuarios(): void {
    this.cargandoU = true;
    this.errorU = '';
    this.usuariosSvc.listar().subscribe({
      next: (us) => { this.usuarios = us; this.cargandoU = false; },
      error: (err) => { this.cargandoU = false; this.errorU = err?.error?.message ?? 'No se pudieron cargar los usuarios.'; },
    });
  }

  nuevoUsuario(): void {
    this.editId = null;
    this.form = { usuario: '', nombre: '', rol: 'gerente', sede: 'todas', password: '', activo: true };
    this.errorForm = '';
    this.mostrarForm = true;
  }

  editarUsuario(u: UsuarioDB): void {
    this.editId = u.id;
    this.form = {
      usuario: u.usuario,
      nombre: u.nombre ?? '',
      rol: (u.rol || '').toLowerCase(),
      sede: this.sedeCfg.normalizar(u.sede),
      password: '',
      activo: u.activo,
    };
    this.errorForm = '';
    this.mostrarForm = true;
  }

  cancelarForm(): void {
    this.mostrarForm = false;
    this.errorForm = '';
  }

  guardarUsuario(): void {
    const f = this.form;
    if (!f.usuario.trim()) { this.errorForm = 'El usuario es obligatorio.'; return; }
    if (this.editId === null && !f.password.trim()) {
      this.errorForm = 'La contraseña es obligatoria para un usuario nuevo.'; return;
    }
    this.guardandoU = true;
    this.errorForm = '';
    const esNuevo = this.editId === null;
    const payload = {
      usuario: f.usuario.trim(), nombre: f.nombre.trim(), rol: f.rol, sede: f.sede,
      activo: f.activo, password: f.password.trim() || undefined,
    };
    const obs = esNuevo
      ? this.usuariosSvc.crear(payload)
      : this.usuariosSvc.actualizar(this.editId!, payload);
    obs.subscribe({
      next: () => {
        this.guardandoU = false;
        this.mostrarForm = false;
        this.cargarUsuarios();
        this.toast(esNuevo ? 'Usuario creado correctamente.' : 'Usuario actualizado correctamente.');
      },
      error: (err) => { this.guardandoU = false; this.errorForm = err?.error?.message ?? 'No se pudo guardar el usuario.'; },
    });
  }

  toggleEstadoUsuario(u: UsuarioDB): void {
    const nuevo = !u.activo;
    this.usuariosSvc.cambiarEstado(u.id, nuevo).subscribe({
      next: () => { this.cargarUsuarios(); this.toast(`Usuario ${nuevo ? 'activado' : 'desactivado'}.`); },
      error: (err) => { this.toast(err?.error?.message ?? 'No se pudo cambiar el estado.', 'error'); },
    });
  }

  rolLabel(rol: string): string {
    return this.rolOptions.find(r => r.value === (rol || '').toLowerCase())?.label ?? rol;
  }
  sedeLabel(sede: string): string {
    const key = this.sedeCfg.normalizar(sede);
    return this.sedeOptions.find(s => s.value === key)?.label ?? sede;
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
    this.permisos.setPermisos(nuevos).subscribe({
      next: () => {
        this.guardado = true;
        this.toast('Permisos guardados correctamente.');
        setTimeout(() => this.guardado = false, 3000);
      },
      error: () => this.toast('No se pudieron guardar los permisos.', 'error'),
    });
  }

  restablecer(): void {
    this.permisos.restablecerDefaults().subscribe({
      next: () => { this.construirFilas(); this.guardado = false; this.toast('Permisos restablecidos a los valores por defecto.'); },
      error: () => this.toast('No se pudieron restablecer los permisos.', 'error'),
    });
  }

  countActivos(comboKey: string): number {
    return this.filas.filter(f => f.combos[comboKey]).length;
  }
}
