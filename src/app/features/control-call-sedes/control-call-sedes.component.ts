import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { SheetsService } from '../../services/service-google.service';
import { AuthService } from '../../services/auth.service';
import { SedeConfigService } from '../../services/sede-config.service';

interface AsesorRow {
  asesor: string;
  contacto: number;
  noContacto: number;
  total: number;
  porcentaje: number;        // contacto / total (0-1) para formato percent del grid
  agendamientos: number;     // MOTIVO INTERÉS = 'CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)'
  ventaNoConcretada: number; // MOTIVO INTERÉS = 'VENTA NO CONCRETADA'
}

interface VncRow {
  asesor: string;
  dni: string;
  producto: string;
  motivoNoCierre: string;
  comentario: string;
}

@Component({
  selector: 'app-control-call-sedes',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './control-call-sedes.component.html',
  styleUrl: './control-call-sedes.component.css'
})
export class ControlCallSedesComponent implements OnInit, OnDestroy {

  private auth     = inject(AuthService);
  private sedeCfg  = inject(SedeConfigService);

  formCtrl: UntypedFormGroup;
  isLoading = false;

  // ── Sede ──
  esAdmin = false;
  sedesDisponibles: { key: string; nombre: string }[] = [];
  sedeKey = 'ferrenafe';

  asesoresData: AsesorRow[] = [];
  vncDetalle: VncRow[] = [];
  vncPorAsesor: { asesor: string; cantidad: number }[] = [];

  // KPIs
  totalContactos = 0;
  totalNoContactos = 0;
  totalGestiones = 0;
  pctContactabilidad = 0;
  totalAgendamientos = 0;
  totalVentaNoConcretada = 0;

  // Donut Contacto vs No Contacto
  chartContacto: { tipo: string; cantidad: number }[] = [];

  kpiSeleccionado: string | null = null;

  private listData: any[] = [];
  private intervaloCincoMin: any = null;

  // Valores de referencia (normalizados) para clasificar MOTIVO INTERÉS
  private readonly AGENDAMIENTO_KEY = this.normalizar('CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)');
  private readonly VNC_KEY          = this.normalizar('VENTA NO CONCRETADA');

  constructor(
    private fb: UntypedFormBuilder,
    private sheetsService: SheetsService,
  ) {
    this.formCtrl = this.fb.group({
      fechaGestion: [new Date()],
      sede: ['ferrenafe'],
    });
  }

  async ngOnInit() {
    this.configurarSedeSegunUsuario();
    await this.cargarDatos();
    this.intervaloCincoMin = setInterval(() => this.cargarDatos(), 5 * 60 * 1000);
  }

  ngOnDestroy() {
    if (this.intervaloCincoMin) clearInterval(this.intervaloCincoMin);
  }

  // Define qué sede(s) puede ver el usuario actual:
  //  - admin / sede 'todas'  → selector con todas las sedes Call (por defecto la 1ª)
  //  - usuario de sede        → fijo a su sede, sin selector
  private configurarSedeSegunUsuario() {
    const u = this.auth.getUsuario();
    this.esAdmin = !u || u.rol === 'admin' || this.sedeCfg.normalizar(u.sede) === 'todas';

    if (this.esAdmin) {
      this.sedesDisponibles = this.sedeCfg.getSedesCall();
      this.sedeKey = this.sedesDisponibles[0]?.key ?? 'ferrenafe';
    } else {
      this.sedeKey = this.sedeCfg.normalizar(u!.sede);
      const cfg = this.sedeCfg.getConfig(u!.sede);
      this.sedesDisponibles = [{ key: this.sedeKey, nombre: cfg?.nombre ?? u!.sede }];
    }
    this.formCtrl.patchValue({ sede: this.sedeKey }, { emitEvent: false });
  }

  // Cambio de sede (solo admin) → recalcula sobre los datos ya cargados
  onSedeChange(e: any) {
    const key = e?.value ?? this.formCtrl.value.sede;
    if (!key || key === this.sedeKey) return;
    this.sedeKey = key;
    this.calcular();
  }

  get sedeNombre(): string {
    return this.sedeCfg.getConfig(this.sedeKey)?.nombre ?? this.sedeKey;
  }

  // Columna del asesor en el form, p.ej. 'ASESOR FERREÑAFE' / 'ASESOR MOTUPE'
  get columnaAsesor(): string {
    const cfg = this.sedeCfg.getConfig(this.sedeKey);
    return cfg ? `ASESOR ${cfg.valorSede.toUpperCase()}` : 'ASESOR';
  }

  async cargarDatos() {
    this.isLoading = true;
    try {
      // Form de gestión (contacto / no contacto / motivo interés). Hoy contiene Ferreñafe (+ Motupe).
      this.listData = await lastValueFrom(this.sheetsService.getSheetDataFerre());
      this.calcular();
    } catch (e) {
      console.error('Error al cargar datos de gestión de sedes:', e);
      this.listData = [];
      this.asesoresData = [];
      this.vncDetalle = [];
      this.vncPorAsesor = [];
    } finally {
      this.isLoading = false;
    }
  }

  async actualizar() {
    await this.cargarDatos();
  }

  private calcular() {
    const fecha = this.formCtrl.value.fechaGestion as Date;
    const col = this.columnaAsesor;

    // Filas que pertenecen a la sede seleccionada = tienen su columna de asesor con valor
    const filasSede = this.listData.filter(r => (r[col] ?? '').toString().trim() !== '');

    // Asesores de la sede (dinámico: distintos de la columna de asesor, en toda la data)
    const asesores = Array.from(
      new Set(filasSede.map(r => (r[col] ?? '').toString().trim().toUpperCase()))
    ).filter(a => a).sort();

    // Solo las filas del día seleccionado
    const filasDia = filasSede.filter(r => this.esMismaFecha(r['Marca temporal'], fecha));

    this.asesoresData = asesores.map(asesorNombre => {
      const regs = filasDia.filter(r => (r[col] ?? '').toString().trim().toUpperCase() === asesorNombre);

      const contacto   = regs.filter(r => this.esContacto(r)).length;
      const noContacto = regs.filter(r => this.esNoContacto(r)).length;
      const total      = contacto + noContacto;

      return {
        asesor: asesorNombre,
        contacto, noContacto, total,
        porcentaje: total > 0 ? contacto / total : 0,
        agendamientos:     regs.filter(r => this.esAgendamiento(r)).length,
        ventaNoConcretada: regs.filter(r => this.esVentaNoConcretada(r)).length,
      };
    });

    // Detalle VENTA NO CONCRETADA del día
    this.vncDetalle = filasDia
      .filter(r => this.esVentaNoConcretada(r))
      .map(r => ({
        asesor:        (r[col] ?? '').toString().trim(),
        dni:           (r['DNI CLIENTE'] ?? '').toString().trim(),
        producto:      (r['PRODUCTO INTERÉS'] ?? '').toString().trim(),
        motivoNoCierre:(r['MOTIVO DE NO CIERRE'] ?? '').toString().trim(),
        comentario:    (r['COMENTARIO VENTA NO CONCRETADA'] ?? '').toString().trim(),
      }));

    this.vncPorAsesor = this.asesoresData
      .filter(a => a.ventaNoConcretada > 0)
      .map(a => ({ asesor: a.asesor, cantidad: a.ventaNoConcretada }))
      .sort((x, y) => y.cantidad - x.cantidad);

    // KPIs globales (sede)
    this.totalContactos    = this.asesoresData.reduce((s, a) => s + a.contacto, 0);
    this.totalNoContactos  = this.asesoresData.reduce((s, a) => s + a.noContacto, 0);
    this.totalGestiones    = this.totalContactos + this.totalNoContactos;
    this.totalAgendamientos = this.asesoresData.reduce((s, a) => s + a.agendamientos, 0);
    this.totalVentaNoConcretada = this.asesoresData.reduce((s, a) => s + a.ventaNoConcretada, 0);
    this.pctContactabilidad = this.totalGestiones > 0
      ? Math.round((this.totalContactos / this.totalGestiones) * 100) : 0;

    this.chartContacto = [
      { tipo: 'Contacto',    cantidad: this.totalContactos },
      { tipo: 'No Contacto', cantidad: this.totalNoContactos },
    ];
  }

  customizeTooltipDonut = (arg: any) => ({
    text: `${arg.argumentText}: ${arg.valueText} (${arg.percentText})`,
  });

  customizeLabelDonut = (arg: any) => `${arg.valueText} (${arg.percentText})`;

  // ── KPIs: panel de detalle por asesor ──
  toggleKpi(tipo: string): void {
    this.kpiSeleccionado = this.kpiSeleccionado === tipo ? null : tipo;
  }

  get detalleKpiActual(): { asesor: string; valor: number; meta: number }[] {
    const valorDe: Record<string, (a: AsesorRow) => number> = {
      'contactos':          a => a.contacto,
      'no-contactos':       a => a.noContacto,
      'agendamientos':      a => a.agendamientos,
      'venta-no-concretada': a => a.ventaNoConcretada,
    };
    const fn = this.kpiSeleccionado ? valorDe[this.kpiSeleccionado] : null;
    if (!fn) return [];

    const lista = this.asesoresData
      .map(a => ({ asesor: a.asesor, valor: fn(a) }))
      .sort((x, y) => y.valor - x.valor);

    // Barra relativa al máximo del KPI seleccionado
    const max = lista.reduce((m, i) => Math.max(m, i.valor), 0);
    return lista.map(i => ({ ...i, meta: max > 0 ? i.valor / max : 0 }));
  }

  get tituloDetalleKpi(): string {
    const titulos: Record<string, string> = {
      'contactos':           '✅ Contactos · por asesor',
      'no-contactos':        '❌ No Contactos · por asesor',
      'agendamientos':       '📅 Agendamientos · por asesor',
      'venta-no-concretada': '🚫 Ventas no concretadas · por asesor',
    };
    return this.kpiSeleccionado ? (titulos[this.kpiSeleccionado] ?? '') : '';
  }

  getNombreCorto(nombreCompleto: string): string {
    const partes = (nombreCompleto || '').trim().split(' ');
    const nombre = partes[0] ?? nombreCompleto;
    return nombre.charAt(0).toUpperCase() + nombre.slice(1).toLowerCase();
  }

  onCellPrepared(e: any) {
    if (e.rowType === 'header') {
      e.cellElement.style.padding         = '8px';
      e.cellElement.style.backgroundColor = '#293964';
      e.cellElement.style.color           = 'white';
      e.cellElement.style.textAlign       = 'center';
      e.cellElement.style.fontWeight      = 'bold';
      e.cellElement.style.whiteSpace      = 'normal';
      e.cellElement.style.height          = 'auto';
      e.cellElement.style.border          = '1.5px solid black';
    }
    if (e.rowType === 'data') {
      e.cellElement.style.textAlign = 'center';
      if (e.column?.dataField === 'porcentaje') {
        const valor = (e.value || 0) * 100;
        e.cellElement.style.fontWeight = 'bold';
        if (valor >= 80)      { e.cellElement.style.backgroundColor = '#2E9B2F'; e.cellElement.style.color = '#FFFFFF'; }
        else if (valor >= 60) { e.cellElement.style.backgroundColor = '#8BC34A'; e.cellElement.style.color = '#1F2A0F'; }
        else if (valor >= 25) { e.cellElement.style.backgroundColor = '#F4C20D'; e.cellElement.style.color = '#1F2A0F'; }
        else                  { e.cellElement.style.backgroundColor = '#DC2626'; e.cellElement.style.color = '#FFFFFF'; }
      }
    }
  }

  // ── Helpers de clasificación ──
  private normalizar(v: any): string {
    return (v ?? '').toString().toLowerCase().trim()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }
  private esContacto(r: any): boolean {
    return this.normalizar(r['ESTADO DE GESTIÓN'] ?? r['ESTADO DE GESTION']) === 'contacto';
  }
  private esNoContacto(r: any): boolean {
    return this.normalizar(r['ESTADO DE GESTIÓN'] ?? r['ESTADO DE GESTION']) === 'nocontacto';
  }
  private esAgendamiento(r: any): boolean {
    return this.normalizar(r['MOTIVO INTERÉS'] ?? r['MOTIVO INTERES']) === this.AGENDAMIENTO_KEY;
  }
  private esVentaNoConcretada(r: any): boolean {
    return this.normalizar(r['MOTIVO INTERÉS'] ?? r['MOTIVO INTERES']) === this.VNC_KEY;
  }

  private esMismaFecha(marca: string, fecha: Date): boolean {
    if (!marca || !marca.includes('/')) return false;
    const [d, m, a] = marca.split(' ')[0].split('/');
    return +d === fecha.getDate() && +m === (fecha.getMonth() + 1) && +a === fecha.getFullYear();
  }
}
