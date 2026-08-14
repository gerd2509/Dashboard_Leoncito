import { Component, Input, OnInit, HostListener, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from '../../services/auth.service';
import { SedeConfigService } from '../../services/sede-config.service';
import { EntregasService, Entrega } from '../../services/entregas.service';
import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';
import { GpsRutaComponent } from '../gps-ruta/gps-ruta.component';
import { Coordenada } from '../gps-ruta/models/ruta.model';
import { Workbook } from 'exceljs';
import * as FileSaver from 'file-saver';
import { firstValueFrom } from 'rxjs';

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
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES, LoadingOverlayComponent, GpsRutaComponent],
  templateUrl: './logistica.component.html',
  styleUrl: './logistica.component.css',
})
export class LogisticaComponent implements OnInit {
  @Input() vista: 'registrar' | 'entregas' | 'calendario' | 'rutas' = 'registrar';

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
    this.calcAltura();
    if (this.vista === 'entregas' || this.vista === 'calendario' || this.vista === 'rutas') this.cargar();
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
      celular: '', direccion: '', coordenadas: '', observacion: '',
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
      coordenadas: this.f.coordenadas.trim() || undefined,
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
      next: (rows) => { this.datos = rows || []; this.construirCitas(); this.construirRuta(); this.cargando = false; },
      error: (err) => { this.cargando = false; this.toast(err?.error?.message ?? 'No se pudo cargar.', 'error'); },
    });
  }

  // ── Ruta de reparto (usa las coordenadas de las entregas PENDIENTES) ──
  puntosRuta: Coordenada[] = [];
  entregasSinCoord = 0;
  // Ubicación en tiempo real del logístico → punto de PARTIDA de la ruta.
  ubicacionActual: Coordenada | null = null;
  ubicacionError = '';
  obteniendoUbic = false;

  obtenerUbicacion(): void {
    if (!navigator.geolocation) { this.ubicacionError = 'Tu navegador no soporta geolocalización.'; return; }
    this.ubicacionError = ''; this.obteniendoUbic = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.ubicacionActual = { id: '__me__', nombre: '📍 Mi ubicación (inicio)', lat: pos.coords.latitude, lng: pos.coords.longitude };
        this.obteniendoUbic = false; this.construirRuta();
      },
      () => { this.obteniendoUbic = false; this.ubicacionError = 'No se pudo obtener tu ubicación. Permite el acceso a la ubicación en el navegador.'; },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }

  private construirRuta(): void {
    const pts: Coordenada[] = [];
    this.entregasSinCoord = 0;
    for (const e of this.datos) {
      if (e.estado !== 'PENDIENTE') continue;
      const c = this.parseCoord(e.coordenadas);
      if (!c) { this.entregasSinCoord++; continue; }
      pts.push({ id: String(e.id), nombre: `${e.producto} · ${e.cliente_nombre || e.dni_cliente}`, lat: c.lat, lng: c.lng });
    }
    // La ruta PARTE desde la ubicación actual del logístico (origen). Google optimiza
    // el orden de las entregas por CERCANÍA (optimizeWaypoints), no por orden de registro.
    this.puntosRuta = this.ubicacionActual ? [this.ubicacionActual, ...pts] : pts;
  }
  /** Parsea "lat, lng" (o "lat; lng") a números. */
  private parseCoord(s: string | null | undefined): { lat: number; lng: number } | null {
    if (!s) return null;
    const p = s.split(/[,;]/).map(x => parseFloat(x.trim()));
    if (p.length < 2 || !isFinite(p[0]) || !isFinite(p[1])) return null;
    return { lat: p[0], lng: p[1] };
  }

  // ── Calendario (dx-scheduler) ──
  citas: any[] = [];
  calFecha = new Date();
  private mesCargado = '';
  readonly estadoRecursos = [
    { id: 'PENDIENTE', text: 'Pendiente', color: '#FB8C00' },
    { id: 'ENTREGADO', text: 'Entregado', color: '#43A047' },
    { id: 'VENCIDA',   text: 'Vencida',   color: '#E53935' },
    { id: 'ANULADO',   text: 'Anulado',   color: '#90A4AE' },
  ];

  private construirCitas(): void {
    this.citas = this.datos.map(e => {
      const [y, m, d] = (e.fecha_entrega || '').split('-').map(Number);
      // Evento CON HORA dentro del día (no all-day) → se queda dentro de la celda del día,
      // nunca se desborda al día siguiente.
      const ini = y ? new Date(y, m - 1, d, 8, 0, 0) : new Date();
      const fin = y ? new Date(y, m - 1, d, 9, 0, 0) : new Date();
      const grupo = e.estado === 'ENTREGADO' ? 'ENTREGADO'
        : e.estado === 'ANULADO' ? 'ANULADO'
        : (e.vencida ? 'VENCIDA' : 'PENDIENTE');
      return {
        id: e.id, text: `${e.producto} · ${e.cliente_nombre || e.dni_cliente}`,
        start: ini, end: fin, grupo, _e: e,
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

  /** Alto del calendario: ocupa el panel sin generar scroll de página. */
  alturaCal = 560;
  @HostListener('window:resize') onResize(): void { this.calcAltura(); }
  private calcAltura(): void {
    const h = (typeof window !== 'undefined' ? window.innerHeight : 820) - 250;
    this.alturaCal = Math.max(460, h);
  }
  /** Evita que el clic/doble-clic abra el popup de edición nativo (solo tooltip de detalle). */
  onCitaClick = (e: any): void => { e.cancel = true; };
  onFormOpening = (e: any): void => { e.cancel = true; };

  // ══════════ ACCIONES SOBRE LA SELECCIÓN (sección de botones) ══════════
  readonly estadosEdit = ['PENDIENTE', 'ENTREGADO', 'ANULADO'];
  /** Entregas seleccionadas (el id llega como STRING → comparar como string). */
  get selE(): Entrega[] {
    const s = new Set((this.seleccion || []).map(String));
    return this.datos.filter(e => s.has(String(e.id)));
  }
  get selPend(): Entrega[] { return this.selE.filter(e => e.estado === 'PENDIENTE'); }

  /** Marca como ENTREGADO las pendientes seleccionadas. */
  marcarEntregadoSel(): void {
    const ids = this.selPend.map(e => e.id);
    if (!ids.length) { this.toast('Selecciona entregas pendientes para marcarlas.', 'error'); return; }
    this.api.marcarEntregado(ids, this.nombreUsuario).subscribe({
      next: (r) => { this.toast(`✔ ${r.actualizados} entrega(s) marcada(s) como entregadas.`); this.cargar(); },
      error: (err) => { this.toast(err?.error?.message ?? 'No se pudo actualizar.', 'error'); },
    });
  }

  // ── Editar (1 seleccionada) ──
  editando: Entrega | null = null;
  edGuardando = false;
  ed = this.edVacio();
  private edVacio() {
    return { cliente_nombre: '', producto: '', fecha_entrega: null as Date | null, sede: '',
      celular: '', direccion: '', coordenadas: '', observacion: '', estado: 'PENDIENTE' };
  }
  abrirEditar(): void {
    const sel = this.selE;
    if (sel.length !== 1) { this.toast('Selecciona una sola entrega para editar.', 'error'); return; }
    const x = sel[0];
    const [y, m, d] = (x.fecha_entrega || '').split('-').map(Number);
    this.ed = {
      cliente_nombre: x.cliente_nombre || '', producto: x.producto || '',
      fecha_entrega: y ? new Date(y, m - 1, d) : null, sede: x.sede || '',
      celular: x.celular || '', direccion: x.direccion || '', coordenadas: x.coordenadas || '',
      observacion: x.observacion || '', estado: x.estado || 'PENDIENTE',
    };
    this.editando = x;
  }
  cancelarEditar(): void { this.editando = null; }
  guardarEditar(): void {
    if (!this.editando || this.edGuardando) return;
    if (!this.ed.producto.trim() || !this.ed.fecha_entrega) { this.toast('Producto y fecha son obligatorios.', 'error'); return; }
    this.edGuardando = true;
    this.api.actualizar(this.editando.id, {
      cliente_nombre: this.ed.cliente_nombre.trim(), producto: this.ed.producto.trim(),
      fecha_entrega: this.ymd(this.ed.fecha_entrega as Date), sede: this.ed.sede,
      celular: this.ed.celular.trim(), direccion: this.ed.direccion.trim(),
      coordenadas: this.ed.coordenadas.trim(), observacion: this.ed.observacion.trim(),
      estado: this.ed.estado,
    }).subscribe({
      next: () => { this.edGuardando = false; this.editando = null; this.toast('Entrega actualizada.'); this.cargar(); },
      error: (err) => { this.edGuardando = false; this.toast(err?.error?.message ?? 'No se pudo actualizar.', 'error'); },
    });
  }

  // ── Anular (pendientes seleccionadas, con motivo) ──
  readonly motivosAnulacion = ['DESISTIÓ DEL CRÉDITO', 'CLIENTE NO UBICADO', 'CAMBIO DE PRODUCTO',
    'DEVOLUCIÓN', 'DUPLICADO', 'OTRO'];
  anulSel: Entrega[] = [];
  anulMotivo = '';
  anulComentario = '';
  anulGuardando = false;
  pedirAnular(): void {
    const p = this.selPend;
    if (!p.length) { this.toast('Selecciona entregas pendientes para anular.', 'error'); return; }
    this.anulSel = p; this.anulMotivo = ''; this.anulComentario = '';
  }
  cancelarAnular(): void { this.anulSel = []; }
  confirmarAnular(): void {
    if (!this.anulSel.length || !this.anulMotivo || this.anulGuardando) return;
    const motivo = this.anulMotivo + (this.anulComentario.trim() ? ` — ${this.anulComentario.trim()}` : '');
    this.anulGuardando = true;
    Promise.all(this.anulSel.map(e => firstValueFrom(this.api.actualizar(e.id, { estado: 'ANULADO', motivo_anulacion: motivo }))))
      .then(() => { this.anulGuardando = false; this.anulSel = []; this.toast('Entrega(s) anulada(s).'); this.cargar(); })
      .catch((err) => { this.anulGuardando = false; this.toast(err?.error?.message ?? 'No se pudo anular.', 'error'); });
  }

  // ── Reprogramar (pendientes seleccionadas: nueva fecha + motivo) ──
  readonly motivosReprogramacion = ['CLIENTE NO UBICADO', 'CLIENTE AUSENTE', 'DIRECCIÓN INCORRECTA / INUBICABLE',
    'CLIENTE SOLICITÓ OTRA FECHA', 'ZONA INACCESIBLE / CLIMA', 'PRODUCTO NO DISPONIBLE / SIN STOCK',
    'PROBLEMA DE TRANSPORTE', 'FUERA DE HORARIO', 'OTRO'];
  reprogSel: Entrega[] = [];
  reprogFecha: Date | null = null;
  reprogMotivo = '';
  reprogComentario = '';
  reprogGuardando = false;
  pedirReprogramar(): void {
    const p = this.selPend;
    if (!p.length) { this.toast('Selecciona entregas pendientes para reprogramar.', 'error'); return; }
    this.reprogSel = p; this.reprogFecha = null; this.reprogMotivo = ''; this.reprogComentario = '';
  }
  cancelarReprog(): void { this.reprogSel = []; }
  confirmarReprog(): void {
    if (!this.reprogSel.length || !this.reprogFecha || !this.reprogMotivo || this.reprogGuardando) return;
    const motivo = this.reprogMotivo + (this.reprogComentario.trim() ? ` — ${this.reprogComentario.trim()}` : '');
    const fecha = this.ymd(this.reprogFecha);
    const ids = this.reprogSel.map(e => e.id);
    this.reprogGuardando = true;
    this.api.reprogramar(ids, fecha, motivo).subscribe({
      next: (r) => { this.reprogGuardando = false; this.reprogSel = []; this.toast(`✔ ${r.actualizados} entrega(s) reprogramada(s).`); this.cargar(); },
      error: (err) => { this.reprogGuardando = false; this.toast(err?.error?.message ?? 'No se pudo reprogramar.', 'error'); },
    });
  }

  // ── Eliminar (selección) con confirmación ──
  eliminandoSel: Entrega[] | null = null;
  elimGuardando = false;
  pedirEliminar(): void {
    if (!this.selE.length) { this.toast('Selecciona entregas para eliminar.', 'error'); return; }
    this.eliminandoSel = this.selE;
  }
  cancelarEliminar(): void { this.eliminandoSel = null; }
  confirmarEliminar(): void {
    if (!this.eliminandoSel?.length || this.elimGuardando) return;
    this.elimGuardando = true;
    Promise.all(this.eliminandoSel.map(e => firstValueFrom(this.api.eliminar(e.id))))
      .then(() => { this.elimGuardando = false; this.eliminandoSel = null; this.toast('Entrega(s) eliminada(s).'); this.cargar(); })
      .catch((err) => { this.elimGuardando = false; this.toast(err?.error?.message ?? 'No se pudo eliminar.', 'error'); });
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
