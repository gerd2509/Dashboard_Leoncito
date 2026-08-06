import { Component, OnInit, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CapSedesService, CapRow } from '../../services/cap-sedes.service';
import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';

interface SedeMeta { sede: string; gerente: string; zona: string; }
interface SupMeta { sede: string; nombre: string; }

/**
 * Maestro CAP (admin): CRUD del roster de asesores por sede (tabla cap_asesores).
 * Alta/edición vía popup: al elegir la SEDE se autocompletan GERENTE y ZONA, y el
 * SUPERVISOR se elige de los de esa sede. CANAL de la lista existente (como el sheet).
 * Los cambios se reflejan en Control Gestión/Call Sedes, Pizarra de Metas y el
 * registro de gestión de sedes (fuente = CapSedesService).
 */
@Component({
  selector: 'app-maestro-cap',
  standalone: true,
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES, LoadingOverlayComponent],
  templateUrl: './maestro-cap.component.html',
  styleUrl: './maestro-cap.component.css',
})
export class MaestroCapComponent implements OnInit {
  private cap = inject(CapSedesService);
  private snack = inject(MatSnackBar);

  filas: CapRow[] = [];
  cargando = false;
  guardando = false;
  readonly estados = ['ACTIVO', 'RENUNCIA'];

  // Catálogos (derivados del CAP) para el formulario.
  sedesMeta: SedeMeta[] = [];
  supervisoresMeta: SupMeta[] = [];
  canales: string[] = [];
  sedesNombres: string[] = [];

  // Selección de la grilla.
  selected: CapRow | null = null;
  selectedKeys: number[] = [];

  // Popup de alta/edición de asesor.
  popupVisible = false;
  modo: 'nuevo' | 'editar' = 'nuevo';
  modelo: any = this.vacio();

  // Maestros (gestión en popups propios).
  popupSedes = false;
  popupSup = false;
  popupGer = false;
  sedesMaestro: { id: number; nombre: string; gerente: string; zona: string }[] = [];
  supMaestro: { id: number; nombre: string; sede: string }[] = [];
  gerentesMaestro: { id: number; nombre: string }[] = [];
  gerentesNombres: string[] = [];

  ngOnInit(): void { this.cargar(); this.cargarMeta(); this.cargarGerentes(); }

  private cargarGerentes(): void {
    this.cap.listarGerentes().subscribe({ next: r => { this.gerentesMaestro = r; this.gerentesNombres = r.map(g => g.nombre); }, error: () => {} });
  }

  private vacio() {
    return { id: null, vendedor: '', dni: '', sede: '', gerente: '', zona: '', supervisor: '', canal: '', estado: 'ACTIVO' };
  }

  cargar(): void {
    this.cargando = true;
    this.cap.listarFresco()
      .then(rows => { this.filas = rows; this.cargando = false; })
      .catch(() => { this.filas = []; this.cargando = false; this.toast('❌ No se pudo cargar el CAP.', true); });
  }

  cargarMeta(): void {
    this.cap.meta().subscribe({
      next: m => {
        this.sedesMeta = m.sedes || [];
        this.supervisoresMeta = m.supervisores || [];
        this.canales = m.canales || [];
        this.sedesNombres = this.sedesMeta.map(s => s.sede);
      },
      error: () => { /* si falla, los selects quedan con acceptCustomValue */ },
    });
  }

  /** Supervisores de la sede elegida (si no hay, muestra todos). Únicos y ordenados. */
  get supervisoresDeSede(): string[] {
    const s = (this.modelo.sede || '').trim();
    const dela = this.supervisoresMeta.filter(x => x.sede === s).map(x => x.nombre);
    const base = dela.length ? dela : this.supervisoresMeta.map(x => x.nombre);
    return Array.from(new Set(base)).sort();
  }

  /** Al cambiar la sede: autocompleta gerente y zona (editable si es sede nueva). */
  onSedeChange(sede: string): void {
    const meta = this.sedesMeta.find(s => s.sede === sede);
    if (meta) { this.modelo.gerente = meta.gerente || ''; this.modelo.zona = meta.zona || ''; }
  }

  onSelectionChanged(e: any): void { this.selected = e.selectedRowsData?.[0] || null; }

  nuevo(): void { this.modo = 'nuevo'; this.modelo = this.vacio(); this.popupVisible = true; }
  editar(): void {
    if (!this.selected) { this.toast('Selecciona un asesor para editar.', true); return; }
    this.modo = 'editar'; this.modelo = { ...this.selected }; this.popupVisible = true;
  }

  guardar(): void {
    const v = (this.modelo.vendedor || '').trim();
    if (!v) { this.toast('El nombre del asesor es obligatorio.', true); return; }
    this.guardando = true;
    const payload = this.payload(this.modelo);
    const obs = this.modo === 'nuevo' ? this.cap.crear(payload) : this.cap.actualizar(this.modelo.id, payload);
    obs.subscribe({
      next: () => {
        this.guardando = false; this.popupVisible = false; this.cap.invalidar();
        this.toast(this.modo === 'nuevo' ? '✔ Asesor agregado al CAP.' : '✔ Asesor actualizado.');
        this.cargar(); this.cargarMeta();
      },
      error: err => { this.guardando = false; this.toast('❌ ' + this.msg(err), true); },
    });
  }

  eliminar(): void {
    if (!this.selected?.id) { this.toast('Selecciona un asesor para eliminar.', true); return; }
    if (!confirm(`¿Eliminar a ${this.selected.vendedor} del CAP? Esta acción no se puede deshacer.`)) return;
    this.guardando = true;
    this.cap.eliminar(this.selected.id).subscribe({
      next: () => {
        this.guardando = false; this.cap.invalidar(); this.toast('✔ Asesor eliminado del CAP.');
        this.selected = null; this.selectedKeys = []; this.cargar();
      },
      error: err => { this.guardando = false; this.toast('❌ ' + this.msg(err), true); },
    });
  }

  // ── Maestro de SEDES ───────────────────────────────────────────────────────
  abrirSedes(): void {
    this.cap.listarSedes().subscribe({ next: r => { this.sedesMaestro = r; this.popupSedes = true; }, error: () => this.toast('❌ No se pudieron cargar las sedes.', true) });
  }
  onSedeIns(e: any): void {
    this.cap.crearSede(this.limpiaSede(e.data)).subscribe({ next: () => this.trasMaestro('Sede agregada.', 'sedes'), error: err => this.errMaestro(err, 'sedes') });
  }
  onSedeUpd(e: any): void {
    if (!e.data?.id) return;
    this.cap.actualizarSede(e.data.id, this.limpiaSede(e.data)).subscribe({ next: () => this.trasMaestro('Sede actualizada.', 'sedes'), error: err => this.errMaestro(err, 'sedes') });
  }
  onSedeDel(e: any): void {
    if (!e.data?.id) return;
    this.cap.eliminarSede(e.data.id).subscribe({ next: () => this.trasMaestro('Sede eliminada.', 'sedes'), error: err => this.errMaestro(err, 'sedes') });
  }
  private limpiaSede(d: any) { return { nombre: (d.nombre || '').trim(), gerente: (d.gerente || '').trim(), zona: (d.zona || '').trim() }; }

  // ── Maestro de SUPERVISORES ────────────────────────────────────────────────
  abrirSup(): void {
    this.cap.listarSupervisores().subscribe({ next: r => { this.supMaestro = r; this.popupSup = true; }, error: () => this.toast('❌ No se pudieron cargar los supervisores.', true) });
  }
  onSupIns(e: any): void {
    this.cap.crearSupervisor(this.limpiaSup(e.data)).subscribe({ next: () => this.trasMaestro('Supervisor agregado.', 'sup'), error: err => this.errMaestro(err, 'sup') });
  }
  onSupUpd(e: any): void {
    if (!e.data?.id) return;
    this.cap.actualizarSupervisor(e.data.id, this.limpiaSup(e.data)).subscribe({ next: () => this.trasMaestro('Supervisor actualizado.', 'sup'), error: err => this.errMaestro(err, 'sup') });
  }
  onSupDel(e: any): void {
    if (!e.data?.id) return;
    this.cap.eliminarSupervisor(e.data.id).subscribe({ next: () => this.trasMaestro('Supervisor eliminado.', 'sup'), error: err => this.errMaestro(err, 'sup') });
  }
  private limpiaSup(d: any) { return { nombre: (d.nombre || '').trim(), sede: (d.sede || '').trim() }; }

  // ── Maestro de GERENTES ─────────────────────────────────────────────────────
  abrirGerentes(): void {
    this.cap.listarGerentes().subscribe({ next: r => { this.gerentesMaestro = r; this.gerentesNombres = r.map(g => g.nombre); this.popupGer = true; }, error: () => this.toast('❌ No se pudieron cargar los gerentes.', true) });
  }
  onGerIns(e: any): void {
    this.cap.crearGerente((e.data?.nombre || '').trim()).subscribe({ next: () => this.trasMaestro('Gerente agregado.', 'ger'), error: err => this.errMaestro(err, 'ger') });
  }
  onGerUpd(e: any): void {
    if (!e.data?.id) return;
    this.cap.actualizarGerente(e.data.id, (e.data.nombre || '').trim()).subscribe({ next: () => this.trasMaestro('Gerente actualizado.', 'ger'), error: err => this.errMaestro(err, 'ger') });
  }
  onGerDel(e: any): void {
    if (!e.data?.id) return;
    this.cap.eliminarGerente(e.data.id).subscribe({ next: () => this.trasMaestro('Gerente eliminado.', 'ger'), error: err => this.errMaestro(err, 'ger') });
  }

  private recargaMaestro(cual: 'sedes' | 'sup' | 'ger'): void {
    if (cual === 'sedes') this.cap.listarSedes().subscribe(r => this.sedesMaestro = r);
    else if (cual === 'sup') this.cap.listarSupervisores().subscribe(r => this.supMaestro = r);
    else this.cargarGerentes();
    // Renombrar un gerente reescribe las sedes → refresca también las sedes.
    if (cual === 'ger') this.cap.listarSedes().subscribe(r => this.sedesMaestro = r);
  }
  private trasMaestro(msg: string, cual: 'sedes' | 'sup' | 'ger'): void {
    this.cap.invalidar(); this.cargarMeta();
    this.recargaMaestro(cual);
    this.cargar();   // refresca gerente/zona de los asesores (autoritativo)
    this.toast('✔ ' + msg);
  }
  private errMaestro(err: any, cual: 'sedes' | 'sup' | 'ger'): void {
    this.toast('❌ ' + this.msg(err), true);
    this.recargaMaestro(cual);
  }

  private payload(d: any): Partial<CapRow> {
    return {
      vendedor: (d.vendedor || '').trim(), sede: (d.sede || '').trim(),
      supervisor: (d.supervisor || '').trim(), gerente: (d.gerente || '').trim(),
      zona: (d.zona || '').trim(), canal: (d.canal || '').trim(),
      estado: (d.estado || 'ACTIVO').trim(), dni: (d.dni || '').trim(),
    };
  }
  private msg(err: any): string { return err?.error?.message || 'No se pudo guardar el cambio.'; }
  private toast(m: string, error = false): void {
    this.snack.open(m, 'OK', {
      duration: error ? 5000 : 3000, horizontalPosition: 'end', verticalPosition: 'top',
      panelClass: error ? 'toast-error' : 'toast-ok',
    });
  }
}
