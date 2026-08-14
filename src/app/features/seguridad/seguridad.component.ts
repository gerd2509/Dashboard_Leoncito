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
import { CapSedesService } from '../../services/cap-sedes.service';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { nombresCall, nombresRealzza } from '../../shared/asesores';

interface PermisoFila {
  modulo: ModuleConfig;
  combos: Record<string, boolean>;   // key = combinacion.key (rol-perfil)
}

import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';

@Component({
  selector: 'app-seguridad',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatSnackBarModule, ...DX_COMMON_MODULES, LoadingOverlayComponent],
  templateUrl: './seguridad.component.html',
  styleUrl: './seguridad.component.css'
})
export class SeguridadComponent implements OnInit {

  private permisos = inject(PermissionsService);
  private sedeCfg  = inject(SedeConfigService);
  private usuariosSvc = inject(UsuariosService);
  private cap = inject(CapSedesService);
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

  // ── Alta MASIVA por sede (desde el CAP) ──
  mostrarBulk = false;
  bulkSede = '';
  bulkSedeOptions: { value: string; label: string }[] = [];
  bulkPreview: { vendedor: string; dni: string; existe: boolean }[] = [];
  bulkNuevos = 0;
  bulkExistentes = 0;
  bulkCargando = false;
  bulkCreando = false;
  bulkResultado: { creados: number; omitidos: number } | null = null;
  form = { usuario: '', nombre: '', rol: 'gerente', sede: 'todas', sedes: ['todas'] as string[], canal: '', vendedor: '', password: '', activo: true, dni: '', debeCambiar: false };

  // Identidad del vendedor (solo cuando rol = vendedor).
  readonly canalOptions = [
    { value: 'sede',    label: 'Sede (piso)' },
    { value: 'call',    label: 'Call Center' },
    { value: 'realzza', label: 'Realzza' },
  ];
  vendedorOptions: string[] = [];   // nombres según el canal (+ sede si es 'sede')

  readonly rolOptions = [
    { value: 'admin', label: 'Admin' },
    { value: 'gerente', label: 'Gerente' },
    { value: 'supervisor', label: 'Supervisor' },
    { value: 'vendedor', label: 'Vendedor' },
  ];
  sedeOptions: { value: string; label: string }[] = [];

  // Para el dx-data-grid de usuarios: mostrar/buscar por etiqueta (no por el código).
  rolCell     = (row: UsuarioDB) => this.rolLabel(row?.rol);
  sedeCell    = (row: UsuarioDB) => {
    const arr = (row?.sedes && row.sedes.length) ? row.sedes : (row?.sede ? [row.sede] : []);
    const labels = arr.map(s => this.sedeLabel(s));
    return labels.length <= 2 ? labels.join(', ') : `${labels[0]} +${labels.length - 1}`;
  };
  vendedorCell = (row: UsuarioDB) => row?.vendedor ? `${row.vendedor} · ${row.canal || '-'}` : '';
  onUsuarioDblClick = (e: any) => { if (e?.data) this.editarUsuario(e.data); };

  // ── Permisos POR USUARIO (modal desde el grid) ──
  mostrarPerm = false;
  permUsuario: UsuarioDB | null = null;
  permSel = new Set<string>();
  permEsDefault = false;      // el usuario aún no tiene lista propia (usa el default rol-perfil)
  guardandoPerm = false;
  readonly modulos = ALL_MODULES;

  modulosDe(grupo: string): ModuleConfig[] {
    return ALL_MODULES.filter(m => (m.grupo || 'Generales') === grupo);
  }

  abrirPermisos(u: UsuarioDB): void {
    this.permUsuario = u;
    this.permEsDefault = !Array.isArray(u.modulos);
    const base = Array.isArray(u.modulos) ? u.modulos : this.permisos.defaultPara(u.rol, u.sede);
    this.permSel = new Set(base);
    this.mostrarPerm = true;
  }
  cerrarPermisos(): void { this.mostrarPerm = false; this.permUsuario = null; }

  estaPerm(key: string): boolean { return this.permSel.has(key); }
  togglePerm(key: string): void {
    if (this.permSel.has(key)) this.permSel.delete(key); else this.permSel.add(key);
    this.permEsDefault = false;
  }
  todosGrupoPerm(grupo: string, on: boolean): void {
    for (const m of this.modulosDe(grupo)) { if (on) this.permSel.add(m.key); else this.permSel.delete(m.key); }
    this.permEsDefault = false;
  }

  guardarPermisos(): void {
    if (!this.permUsuario) return;
    this.guardandoPerm = true;
    // Si se marca "usar default" no mandamos lista (null); si no, la lista elegida.
    const modulos = this.permEsDefault ? null : Array.from(this.permSel);
    this.usuariosSvc.guardarModulos(this.permUsuario.id, modulos).subscribe({
      next: () => {
        this.guardandoPerm = false;
        this.mostrarPerm = false;
        this.cargarUsuarios();
        this.toast('Permisos actualizados.');
      },
      error: (err) => { this.guardandoPerm = false; this.toast(err?.error?.message ?? 'No se pudieron guardar los permisos.', 'error'); },
    });
  }
  volverAlDefault(): void {
    if (!this.permUsuario) return;
    this.permEsDefault = true;
    this.permSel = new Set(this.permisos.defaultPara(this.permUsuario.rol, this.permUsuario.sede));
  }

  ngOnInit(): void {
    this.construirFilas();
    this.grupos = [...new Set(ALL_MODULES.map(m => m.grupo ?? '').filter(Boolean))];
    this.construirSedesPorPerfil();

    this.sedeOptions = [
      { value: 'todas', label: 'Todas' },
      { value: 'realzza', label: 'Realzza' },
      // Gerencia por zona (ve solo Control Gestión Sede de esa zona).
      { value: 'centro', label: 'Zona Centro' },
      { value: 'norte', label: 'Zona Norte' },
      { value: 'sur', label: 'Zona Sur' },
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
    this.form = { usuario: '', nombre: '', rol: 'gerente', sede: 'todas', sedes: ['todas'], canal: '', vendedor: '', password: '', activo: true, dni: '', debeCambiar: false };
    this.vendedorOptions = [];
    this.errorForm = '';
    this.sedeDropdownOpen = false;
    this.mostrarForm = true;
  }

  // ── Alta MASIVA por sede (desde el CAP) ──
  abrirBulk(): void {
    // Solo sedes físicas (los vendedores de piso). Realzza/zonas/todas no aplican.
    this.bulkSedeOptions = this.sedeCfg.getSedesParaCombo().map(s => ({ value: s.key, label: s.nombre }));
    this.bulkSede = '';
    this.bulkPreview = [];
    this.bulkNuevos = this.bulkExistentes = 0;
    this.bulkResultado = null;
    this.mostrarBulk = true;
  }
  cerrarBulk(): void { this.mostrarBulk = false; }

  /** Al elegir la sede: previsualiza cuántos se crearían (nuevos) y cuántos ya existen. */
  onBulkSedeChange(): void {
    this.bulkPreview = [];
    this.bulkNuevos = this.bulkExistentes = 0;
    this.bulkResultado = null;
    if (!this.bulkSede) return;
    this.bulkCargando = true;
    this.usuariosSvc.previewBulkCap(this.bulkSede).subscribe({
      next: (r) => {
        this.bulkPreview = r.detalle || [];
        this.bulkNuevos = r.nuevos; this.bulkExistentes = r.existentes;
        this.bulkCargando = false;
      },
      error: (err) => { this.bulkCargando = false; this.toast(err?.error?.message ?? 'No se pudo leer el CAP.', 'error'); },
    });
  }

  /** Crea de golpe todos los usuarios nuevos de la sede (usuario y clave = DNI). */
  crearBulk(): void {
    if (!this.bulkSede || this.bulkNuevos === 0 || this.bulkCreando) return;
    this.bulkCreando = true;
    this.usuariosSvc.crearBulkCap(this.bulkSede).subscribe({
      next: (r) => {
        this.bulkCreando = false;
        this.bulkResultado = { creados: r.creados, omitidos: r.omitidos };
        this.toast(`${r.creados} usuario(s) creado(s)${r.omitidos ? `, ${r.omitidos} omitido(s)` : ''}.`, 'ok');
        this.cargarUsuarios();
        this.onBulkSedeChange();   // refresca la previsualización (ya figuran como existentes)
      },
      error: (err) => { this.bulkCreando = false; this.toast(err?.error?.message ?? 'No se pudieron crear los usuarios.', 'error'); },
    });
  }

  editarUsuario(u: UsuarioDB): void {
    this.editId = u.id;
    const sedes = (u.sedes && u.sedes.length ? u.sedes : (u.sede ? [u.sede] : []))
      .map(s => this.sedeCfg.normalizar(s));
    this.form = {
      usuario: u.usuario,
      nombre: u.nombre ?? '',
      rol: (u.rol || '').toLowerCase(),
      sede: sedes[0] ?? this.sedeCfg.normalizar(u.sede),
      sedes: sedes.length ? sedes : ['todas'],
      canal: u.canal ?? '',
      vendedor: u.vendedor ?? '',
      password: '',
      activo: u.activo,
      dni: u.dni ?? '',
      debeCambiar: !!u.debe_cambiar_password,
    };
    this.recomputarVendedores();
    this.errorForm = '';
    this.sedeDropdownOpen = false;
    this.mostrarForm = true;
  }

  /** Recalcula la lista de vendedores según el canal (+ sede si es 'sede'). */
  async recomputarVendedores(): Promise<void> {
    const canal = this.form.canal;
    if (canal === 'call')          this.vendedorOptions = nombresCall();
    else if (canal === 'realzza')  this.vendedorOptions = nombresRealzza();
    else if (canal === 'sede') {
      const key = this.sedeCfg.normalizar(this.form.sede);
      this.vendedorOptions = key ? await this.cap.vendedoresActivos(key) : [];
    } else this.vendedorOptions = [];

    // Conserva el vendedor ya guardado aunque no esté en la lista actual.
    if (this.form.vendedor && !this.vendedorOptions.includes(this.form.vendedor)) {
      this.vendedorOptions = [this.form.vendedor, ...this.vendedorOptions];
    }
  }

  /** Al elegir un vendedor de SEDE: trae su DNI del CAP y, si es usuario nuevo, propone
   *  usuario = DNI, contraseña = DNI y marca "forzar cambio en el primer login". */
  async onVendedorChange(): Promise<void> {
    if (this.form.canal !== 'sede' || !this.form.vendedor) { return; }
    const key = this.sedeCfg.normalizar(this.form.sede);
    const dni = key ? await this.cap.dniDe(key, this.form.vendedor) : '';
    this.form.dni = dni;
    if (this.editId === null && dni) {
      if (!this.form.usuario.trim())  this.form.usuario = dni;
      if (!this.form.password.trim()) this.form.password = dni;
      this.form.debeCambiar = true;
    }
    if (!this.form.nombre.trim()) this.form.nombre = this.form.vendedor;
  }

  /** Al cambiar el rol: si deja de ser gerente/supervisor y la sede era una zona, la resetea;
   *  si deja de ser vendedor, limpia canal/vendedor. */
  onRolChange(): void {
    const esGerSup = this.form.rol === 'gerente' || this.form.rol === 'supervisor';
    if (!esGerSup) {
      // Quita las zonas de la selección si el rol ya no es gerente/supervisor.
      this.form.sedes = this.form.sedes.filter(s => !['centro', 'norte', 'sur'].includes(s));
      if (!this.form.sedes.length) this.form.sedes = ['todas'];
      this.form.sede = this.form.sedes[0];
    }
    if (this.form.rol !== 'vendedor') { this.form.canal = ''; this.form.vendedor = ''; this.vendedorOptions = []; }
  }

  sedeDropdownOpen = false;

  /** Texto que muestra el campo cerrado del combo de sedes. */
  resumenSedes(): string {
    const sel = this.form.sedes ?? [];
    if (!sel.length) return 'Selecciona sede(s)…';
    const label = (v: string) => this.sedeOptions.find(o => o.value === v)?.label ?? v;
    if (sel.length === 1) return label(sel[0]);
    return `${label(sel[0])}, ${label(sel[1])}${sel.length > 2 ? ` +${sel.length - 2}` : ''}`;
  }

  /** Marca/desmarca una sede en la lista. "Todas" es exclusiva: al marcarla se
   *  limpia el resto; al marcar una específica se quita "Todas". */
  toggleSede(value: string): void {
    let sel = [...this.form.sedes];
    const marcada = sel.includes(value);

    if (value === 'todas') {
      sel = marcada ? [] : ['todas'];
    } else if (marcada) {
      sel = sel.filter(s => s !== value);
    } else {
      sel = [...sel.filter(s => s !== 'todas'), value];
    }

    if (!sel.length) sel = ['todas'];
    this.form.sedes = sel;
    this.form.sede = sel[0];
    this.recomputarVendedores();
  }

  /** Opciones de sede visibles: las ZONAS (centro/norte/sur) solo para gerente/supervisor. */
  get sedeOptionsVisibles(): { value: string; label: string }[] {
    const esGerSup = this.form.rol === 'gerente' || this.form.rol === 'supervisor';
    const zonas = ['centro', 'norte', 'sur'];
    return this.sedeOptions.filter(o => esGerSup || !zonas.includes(o.value));
  }

  /** Todos los campos obligatorios completos → habilita el botón Salvar. */
  get formValido(): boolean {
    const f = this.form;
    if (!f.usuario.trim() || !f.nombre.trim() || !f.rol || !f.sedes.length) return false;
    if (this.editId === null && !f.password.trim()) return false;   // contraseña obligatoria al crear
    if (f.rol === 'vendedor' && (!f.canal || !f.vendedor)) return false;
    return true;
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
    const esVendedor = f.rol === 'vendedor';
    if (esVendedor && (!f.canal || !f.vendedor)) {
      this.errorForm = 'Para un vendedor, elige el canal y el vendedor.'; return;
    }
    this.guardandoU = true;
    this.errorForm = '';
    const esNuevo = this.editId === null;
    const payload = {
      usuario: f.usuario.trim(), nombre: f.nombre.trim(), rol: f.rol,
      sede: f.sedes[0] || f.sede, sedes: f.sedes,
      canal: esVendedor ? f.canal : '', vendedor: esVendedor ? f.vendedor.trim() : '',
      activo: f.activo, password: f.password.trim() || undefined,
      dni: f.dni.trim() || undefined, debe_cambiar_password: f.debeCambiar,
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
