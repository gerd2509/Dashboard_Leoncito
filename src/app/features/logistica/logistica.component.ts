import { Component, Input, OnInit, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../services/auth.service';
import { SedeConfigService } from '../../services/sede-config.service';
import { EntregasService, Entrega } from '../../services/entregas.service';
import { Workbook } from 'exceljs';
import * as FileSaver from 'file-saver';

// Categorías de producto (igual que los registros de gestión). Simple por ahora;
// luego se puede cambiar por el catálogo real (endpoint /productos ya existe).
const PRODUCTOS = [
  'REFRIGERADORA', 'VISICOOLER', 'COCINA', 'LAVADORA', 'CONGELADORA', 'TELEVISOR', 'EQUIPO SONIDO',
  'LAPTOP', 'IMPRESORA', 'TELEFONO CELULAR', 'MOTOCICLETA', 'MOTOTAXI', 'MOTO CARGUERA', 'MOTO ELECTRICA',
  'JUEGO MUEBLES', 'JUEGO COMEDOR', 'MELAMINA', 'CAMA', 'COLCHON', 'CAMA + COLCHON', 'PEQUEÑOS ARTEFACTOS',
];

/**
 * Módulo LOGÍSTICA — Control de Entregas. Un solo componente con dos vistas (submenús):
 *  · vista='registrar' → formulario para planificar una entrega (DNI + producto + fecha).
 *  · vista='entregas'  → control: lista filtrable, marcar entregado (check + guardar),
 *                        export a Excel, KPIs y resaltado de vencidas.
 * La sede se toma automáticamente del usuario logueado (editable solo para admin).
 * El nombre del cliente es OPCIONAL (las ventas no siempre están facturadas).
 */
@Component({
  selector: 'app-logistica',
  standalone: true,
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './logistica.component.html',
  styleUrl: './logistica.component.css',
})
export class LogisticaComponent implements OnInit {
  @Input() vista: 'registrar' | 'entregas' | 'calendario' = 'registrar';

  private auth = inject(AuthService);
  private snack = inject(MatSnackBar);
  private sedeCfg = inject(SedeConfigService);
  private api = inject(EntregasService);

  esAdmin = false;
  sedeUsuario = '';                 // clave de sede del usuario (si tiene una)
  nombreUsuario = '';
  sedeOptions: { key: string; nombre: string }[] = [];
  readonly estados = ['PENDIENTE', 'ENTREGADO', 'ANULADO'];

  ngOnInit(): void {
    const u = this.auth.getUsuario();
    this.esAdmin = this.auth.esAdmin();
    this.nombreUsuario = u?.nombre || u?.vendedor || u?.sede || '';
    const sedes = this.auth.sedesUsuario();
    const fisicas = this.sedeCfg.expandirSedes(sedes);
    this.sedeUsuario = fisicas.length === 1 ? fisicas[0] : (fisicas[0] || '');
    // Admin / multi-sede: puede elegir; usuario de una sola sede: fija.
    this.sedeOptions = this.esAdmin || fisicas.length !== 1
      ? this.sedeCfg.getSedesParaCombo()
      : this.sedeCfg.getSedesParaCombo().filter(s => s.key === this.sedeUsuario);
    this.f.sede = this.sedeUsuario || (this.sedeOptions[0]?.key ?? '');
    this.filtro.sede = this.esAdmin ? '' : this.sedeUsuario;
    if (this.vista === 'entregas' || this.vista === 'calendario') this.cargar();
  }

  readonly productos = PRODUCTOS;

  // ══════════ VISTA: REGISTRAR ══════════
  guardando = false;
  intento = false;
  f = this.vacio();
  private vacio() {
    return {
      dni_cliente: '', cliente_nombre: '', producto: '',
      fecha_entrega: null as Date | null, sede: '',
      celular: '', direccion: '', observacion: '',
    };
  }
  get sedeFija(): boolean { return !this.esAdmin && !!this.sedeUsuario; }
  get invDni(): boolean { return (this.f.dni_cliente || '').replace(/\D/g, '').length < 6; }
  get invProducto(): boolean { return !(this.f.producto || '').trim(); }
  get invFecha(): boolean { return !this.f.fecha_entrega; }
  get invSede(): boolean { return !(this.f.sede || '').trim(); }
  get formValido(): boolean { return !this.invDni && !this.invProducto && !this.invFecha && !this.invSede; }
  get primerError(): string {
    if (this.invDni) return 'Ingresa el DNI del cliente.';
    if (this.invProducto) return 'Indica el producto a entregar.';
    if (this.invFecha) return 'Elige la fecha de entrega.';
    if (this.invSede) return 'Selecciona la sede.';
    return '';
  }

  private ymd(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  registrar(): void {
    this.intento = true;
    if (!this.formValido || this.guardando) return;
    this.guardando = true;
    this.api.crear({
      dni_cliente: this.f.dni_cliente.replace(/\D/g, ''),
      cliente_nombre: this.f.cliente_nombre.trim() || undefined,
      producto: this.f.producto.trim(),
      fecha_entrega: this.ymd(this.f.fecha_entrega as Date),
      sede: this.f.sede,
      celular: this.f.celular.trim() || undefined,
      direccion: this.f.direccion.trim() || undefined,
      observacion: this.f.observacion.trim() || undefined,
      registrado_por: this.nombreUsuario || undefined,
    }).subscribe({
      next: () => {
        this.guardando = false;
        this.toast('✔ Entrega registrada.');
        const sede = this.f.sede;
        this.f = this.vacio();
        this.f.sede = sede;          // conserva la sede para registrar otra
        this.intento = false;
      },
      error: (err) => { this.guardando = false; this.toast(err?.error?.message ?? 'No se pudo registrar.', 'error'); },
    });
  }

  // ══════════ VISTA: ENTREGAS (control) ══════════
  private hoy = new Date();
  filtro = {
    desde: new Date(this.hoy.getFullYear(), this.hoy.getMonth(), 1),
    hasta: new Date(this.hoy.getFullYear(), this.hoy.getMonth() + 1, 0),
    estado: '',
    sede: '',
  };
  datos: Entrega[] = [];
  cargando = false;
  seleccion: number[] = [];         // selectedRowKeys (ids)

  get kpiPendientes(): number { return this.datos.filter(e => e.estado === 'PENDIENTE').length; }
  get kpiEntregadas(): number { return this.datos.filter(e => e.estado === 'ENTREGADO').length; }
  get kpiVencidas(): number { return this.datos.filter(e => e.vencida).length; }

  cargar(): void {
    this.cargando = true;
    this.seleccion = [];
    this.mesCargado = `${this.filtro.desde.getFullYear()}-${this.filtro.desde.getMonth()}`;
    this.api.listar({
      desde: this.ymd(this.filtro.desde),
      hasta: this.ymd(this.filtro.hasta),
      estado: this.filtro.estado || undefined,
      sede: (this.esAdmin ? this.filtro.sede : this.sedeUsuario) || undefined,
    }).subscribe({
      next: (rows) => { this.datos = rows || []; this.construirCitas(); this.cargando = false; },
      error: (err) => { this.cargando = false; this.toast(err?.error?.message ?? 'No se pudo cargar.', 'error'); },
    });
  }

  // ── Calendario (dx-scheduler) ──
  citas: any[] = [];
  calFecha = new Date();
  private mesCargado = '';
  readonly estadoRecursos = [
    { id: 'PENDIENTE', text: 'Pendiente', color: '#FB8C00' },
    { id: 'ENTREGADO', text: 'Entregado', color: '#43A047' },
    { id: 'VENCIDA',   text: 'Vencida',   color: '#E53935' },
  ];

  private construirCitas(): void {
    this.citas = this.datos.map(e => {
      const [y, m, d] = (e.fecha_entrega || '').split('-').map(Number);
      const dia = y ? new Date(y, m - 1, d) : new Date();
      const grupo = e.estado === 'ENTREGADO' ? 'ENTREGADO' : (e.vencida ? 'VENCIDA' : 'PENDIENTE');
      return {
        id: e.id, text: `${e.producto} · ${e.cliente_nombre || e.dni_cliente}`,
        start: dia, end: dia, allDay: true, grupo, _e: e,
      };
    });
  }

  /** Al navegar de mes en el calendario, recarga las entregas de ese mes. */
  onSchedulerOption = (e: any): void => {
    if (e?.name !== 'currentDate' || !e.value) return;
    const d = new Date(e.value);
    if (`${d.getFullYear()}-${d.getMonth()}` === this.mesCargado) return;
    this.filtro.desde = new Date(d.getFullYear(), d.getMonth(), 1);
    this.filtro.hasta = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    this.cargar();
  };

  /** Click en una cita del calendario → ofrece marcar entregado / revertir. */
  onCitaClick = (e: any): void => {
    e.cancel = true;   // no abrir el popup de edición nativo
    const ent: Entrega = e.appointmentData?._e;
    if (!ent) return;
    if (ent.estado === 'ENTREGADO') this.revertir(ent);
    else this.api.marcarEntregado([ent.id], this.nombreUsuario).subscribe({
      next: () => { this.toast('✔ Entrega marcada como entregada.'); this.cargar(); },
      error: (err) => this.toast(err?.error?.message ?? 'No se pudo actualizar.', 'error'),
    });
  };

  /** Marca como ENTREGADO las filas seleccionadas (check + Guardar). */
  guardarEntregas(): void {
    const ids = (this.seleccion || []).map(Number).filter(Boolean);
    const pendientes = this.datos.filter(e => ids.includes(e.id) && e.estado !== 'ENTREGADO').map(e => e.id);
    if (!pendientes.length) { this.toast('Selecciona entregas pendientes para marcarlas.', 'error'); return; }
    this.api.marcarEntregado(pendientes, this.nombreUsuario).subscribe({
      next: (r) => { this.toast(`✔ ${r.actualizados} entrega(s) marcada(s) como entregadas.`); this.cargar(); },
      error: (err) => { this.toast(err?.error?.message ?? 'No se pudo actualizar.', 'error'); },
    });
  }

  /** Revierte una entrega a PENDIENTE. */
  revertir(e: Entrega): void {
    this.api.marcarEntregado([e.id], this.nombreUsuario, false).subscribe({
      next: () => { this.toast('Entrega revertida a pendiente.'); this.cargar(); },
      error: (err) => { this.toast(err?.error?.message ?? 'No se pudo revertir.', 'error'); },
    });
  }

  eliminar(e: Entrega): void {
    this.api.eliminar(e.id).subscribe({
      next: () => { this.toast('Entrega eliminada.'); this.cargar(); },
      error: (err) => { this.toast(err?.error?.message ?? 'No se pudo eliminar.', 'error'); },
    });
  }

  /** Resalta las entregas vencidas (pendientes con fecha pasada). */
  onCellPrepared = (e: any) => {
    if (e.rowType === 'data' && e.data?.vencida) e.cellElement.style.background = '#fff3f2';
  };

  exportarExcel(): void {
    const wb = new Workbook();
    const ws = wb.addWorksheet('Entregas');
    ws.columns = [
      { header: 'Fecha entrega', key: 'fecha_entrega', width: 14 },
      { header: 'DNI', key: 'dni_cliente', width: 12 },
      { header: 'Cliente', key: 'cliente_nombre', width: 26 },
      { header: 'Producto', key: 'producto', width: 30 },
      { header: 'Sede', key: 'sede', width: 14 },
      { header: 'Estado', key: 'estado', width: 12 },
      { header: 'Vencida', key: 'vencida', width: 9 },
      { header: 'Celular', key: 'celular', width: 12 },
      { header: 'Dirección', key: 'direccion', width: 26 },
      { header: 'Registró', key: 'registrado_por', width: 18 },
      { header: 'Entregó', key: 'entregado_por', width: 18 },
      { header: 'Fecha entregado', key: 'fecha_entregado', width: 18 },
      { header: 'Observación', key: 'observacion', width: 26 },
    ];
    ws.getRow(1).font = { bold: true };
    this.datos.forEach(e => ws.addRow({ ...e, vencida: e.vencida ? 'SÍ' : '' }));
    wb.xlsx.writeBuffer().then(buf => {
      const f = (d: Date) => this.ymd(d);
      FileSaver.saveAs(new Blob([buf]), `Entregas_${f(this.filtro.desde)}_${f(this.filtro.hasta)}.xlsx`);
    });
  }

  private toast(msg: string, tipo: 'ok' | 'error' = 'ok'): void {
    this.snack.open(msg, 'OK', {
      duration: 3500, horizontalPosition: 'end', verticalPosition: 'top',
      panelClass: tipo === 'ok' ? 'toast-ok' : 'toast-error',
    });
  }
}
