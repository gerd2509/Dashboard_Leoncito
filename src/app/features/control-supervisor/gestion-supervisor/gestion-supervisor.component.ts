import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../../common_imports';
import { DX_COMMON_MODULES } from '../../dx_common_modules';
import { DxDataGridComponent } from 'devextreme-angular';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { custom } from 'devextreme/ui/dialog';
import { lastValueFrom } from 'rxjs';
import { ControlSupervisorService, ControlSupervisor } from '../../../services/control-supervisor.service';
import { ExcelExportService } from '../../../services/excel/excel.service';

// Fila del grid = el registro de la BD + campos calculados para mostrar.
interface FilaSup extends ControlSupervisor {
  tipoLabel: string;
  nFotos: number;
}

@Component({
  selector: 'app-gestion-supervisor',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './gestion-supervisor.component.html',
  styleUrl: './gestion-supervisor.component.css'
})
export class GestionSupervisorComponent implements OnInit {
  private srv = inject(ControlSupervisorService);
  private excelSrv = inject(ExcelExportService);
  private snack = inject(MatSnackBar);

  @ViewChild('grid', { static: false }) grid!: DxDataGridComponent;

  form: UntypedFormGroup;
  isLoading = false;
  error = '';

  registros: FilaSup[] = [];
  vista: FilaSup[] = [];
  asesoresDisponibles: string[] = [];
  fotoAmpliada: string | null = null;

  readonly tipos = [
    { value: '', label: 'Todos' },
    { value: 'GESTION', label: 'Gestión' },
    { value: 'MARKET PLACE', label: 'Market Place' },
    { value: 'KOMMO PLATAFORMA', label: 'Kommo Plataforma' },
  ];
  readonly estados = ['CONTACTO', 'NO CONTACTO'];
  readonly estadosMp = ['AL DÍA', 'DESACTUALIZADO', 'ACTUALIZADO'];
  readonly estadosLead = ['LEAD RESPONDIDO', 'CLIENTE SOLO DIO DNI', 'CLIENTE AÚN NO RESPONDE', 'OTRO'];
  readonly tiposBase = ['BBDD', 'KOMMO', 'BBDD KOMMO', 'MARKET PLACE'];

  constructor(private fb: UntypedFormBuilder) {
    const hoy = new Date();
    const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    this.form = this.fb.group({ fechaInicio: [primero], fechaFin: [hoy], asesor: [''], tipo: [''] });
  }

  async ngOnInit(): Promise<void> { await this.cargar(); }

  async cargar(): Promise<void> {
    this.isLoading = true;
    this.error = '';
    try {
      const desde = new Date(this.form.value.fechaInicio); desde.setHours(0, 0, 0, 0);
      const hasta = new Date(this.form.value.fechaFin); hasta.setHours(23, 59, 59, 999);
      const data = await lastValueFrom(this.srv.listar({ desde, hasta }));
      this.registros = (data || []).map(r => this.aFila(r));
      this.asesoresDisponibles = Array.from(new Set(this.registros.map(r => r.asesor).filter(Boolean))).sort();
      this.aplicarFiltros();
    } catch (e) {
      console.error('❌ gestion-supervisor:', e);
      this.error = 'No se pudieron cargar los registros (revisa la conexión al servidor).';
      this.registros = []; this.vista = [];
    } finally {
      this.isLoading = false;
    }
  }

  private aFila(r: ControlSupervisor): FilaSup {
    const sub = (r.mp_subtipo || '').toString().trim().toUpperCase();
    const tipoLabel = r.tipo_control === 'MARKET_PLACE'
      ? (sub === 'KOMMO PLATAFORMA' ? 'KOMMO PLATAFORMA' : 'MARKET PLACE')
      : 'GESTION';
    return { ...r, tipoLabel, nFotos: Array.isArray(r.fotos) ? r.fotos.length : 0 };
  }

  aplicarFiltros(): void {
    const { asesor, tipo } = this.form.value;
    this.vista = this.registros.filter(r =>
      (!asesor || r.asesor === asesor) &&
      (!tipo || r.tipoLabel === tipo));
  }

  // ── Editar / eliminar (persisten en la BD) ──
  onRowUpdated(e: any): void {
    const id = e?.key ?? e?.data?.id;
    if (!id) return;
    // Solo los campos editables (nunca `fotos`, que es un array).
    const d = e.data;
    const body = {
      asesor: d.asesor, tipo_base: d.tipo_base, dni_cliente: d.dni_cliente, celular: d.celular,
      estado_gestion: d.estado_gestion, mp_subtipo: d.mp_subtipo, fecha_publicacion: d.fecha_publicacion,
      estado_mp: d.estado_mp, cliente: d.cliente, estado_lead: d.estado_lead, comentario: d.comentario,
    };
    this.srv.actualizar(id, body).subscribe({
      next: () => this.toast('✔ Registro actualizado.'),
      error: () => { this.toast('❌ No se pudo guardar; se recargará la información.', true); this.cargar(); },
    });
  }

  onRowRemoving(e: any): void {
    const dialog = custom({
      title: 'Eliminar registro del supervisor',
      messageHtml: '<div style="padding:10px 6px;font-size:15px;color:#1E3A5F;">¿Eliminar este registro de forma permanente?</div>',
      buttons: [
        { text: 'Cancelar', type: 'danger', stylingMode: 'contained', onClick: () => false },
        { text: 'Eliminar', type: 'success', stylingMode: 'contained', onClick: () => true },
      ],
    });
    e.cancel = dialog.show().then((ok: boolean) => !ok);
  }

  onRowRemoved(e: any): void {
    const id = e?.key ?? e?.data?.id;
    if (!id) return;
    this.srv.eliminar(id).subscribe({
      next: () => this.toast('✔ Registro eliminado.'),
      error: () => { this.toast('❌ No se pudo eliminar; se recargará la información.', true); this.cargar(); },
    });
  }

  // Muestra en el popup de edición solo los campos del tipo del registro.
  onEditingStart(e: any): void {
    const grid = this.grid?.instance;
    if (!grid) return;
    const t = e?.data?.tipoLabel;
    const soloGestion = ['tipo_base', 'dni_cliente', 'celular', 'estado_gestion'];
    const soloMp = ['fecha_publicacion', 'estado_mp'];
    const soloKp = ['cliente', 'estado_lead'];
    grid.beginUpdate();
    soloGestion.forEach(c => grid.columnOption(c, 'formItem.visible', t === 'GESTION'));
    soloMp.forEach(c => grid.columnOption(c, 'formItem.visible', t === 'MARKET PLACE'));
    soloKp.forEach(c => grid.columnOption(c, 'formItem.visible', t === 'KOMMO PLATAFORMA'));
    grid.endUpdate();
  }

  exportar(): void {
    if (this.grid && this.vista.length) this.excelSrv.exportarDesdeGrid('GestionSupervisor', this.grid);
  }

  verFotos(f: FilaSup): void {
    if (f.fotos && f.fotos.length) this.fotoAmpliada = f.fotos[0];
  }

  onCellPrepared(e: any): void {
    if (e.rowType === 'header') {
      e.cellElement.style.backgroundColor = '#293964';
      e.cellElement.style.color = '#fff';
      e.cellElement.style.fontWeight = '700';
      e.cellElement.style.textAlign = 'center';
    }
    if (e.rowType === 'data' && e.column?.dataField === 'tipoLabel') {
      const t = e.value;
      e.cellElement.style.fontWeight = '700';
      e.cellElement.style.color = t === 'GESTION' ? '#1A5FAD' : t === 'KOMMO PLATAFORMA' ? '#6A1B9A' : '#E65100';
    }
  }

  /** Toast de confirmación / error (arriba a la derecha), como en el resto de la app. */
  private toast(msg: string, error = false): void {
    this.snack.open(msg, 'OK', {
      duration: 3500,
      horizontalPosition: 'end',
      verticalPosition: 'top',
      panelClass: error ? 'toast-error' : 'toast-ok',
    });
  }
}
