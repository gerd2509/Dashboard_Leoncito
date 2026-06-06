import { Component, OnInit, OnDestroy } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { SheetsService } from '../../services/service-google.service';

interface AsesorRow {
  asesor: string;
  contacto: number;
  noContacto: number;
  total: number;
  porcentaje: number;   // contacto / total (0-1) para formato percent del grid
}

@Component({
  selector: 'app-control-call-sedes',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './control-call-sedes.component.html',
  styleUrl: './control-call-sedes.component.css'
})
export class ControlCallSedesComponent implements OnInit, OnDestroy {

  formCtrl: UntypedFormGroup;
  isLoading = false;

  // Por ahora solo Ferreñafe (data del endpoint /ferre)
  sedeNombre = 'Ferreñafe';

  // Asesores del formulario de Ferreñafe (columna 'ASESOR CONTACT')
  private readonly asesoresFerre = [
    'ESMERALDA CHICOMA',
    'LUCIA RUIZ',
    'IRENE CARRASCO',
    'LISET NUÑEZ',
    'PAOLA QUEZADA',
    'NATALI MORANTE',
    'DANITZA CESPEDES',
    'ADRIANA GINES',
    'JULISSA VILCHEZ',
    'DAYANA CIEZA',
    'ERICK CAJO',
  ];

  asesoresData: AsesorRow[] = [];

  // KPIs
  totalContactos = 0;
  totalNoContactos = 0;
  totalGestiones = 0;
  pctContactabilidad = 0;

  // Donut Contacto vs No Contacto
  chartContacto: { tipo: string; cantidad: number }[] = [];

  kpiSeleccionado: string | null = null;

  private listData: any[] = [];
  private intervaloCincoMin: any = null;

  constructor(
    private fb: UntypedFormBuilder,
    private sheetsService: SheetsService,
  ) {
    this.formCtrl = this.fb.group({ fechaGestion: [new Date()] });
  }

  async ngOnInit() {
    await this.cargarDatos();
    this.intervaloCincoMin = setInterval(() => this.cargarDatos(), 5 * 60 * 1000);
  }

  ngOnDestroy() {
    if (this.intervaloCincoMin) clearInterval(this.intervaloCincoMin);
  }

  async cargarDatos() {
    this.isLoading = true;
    try {
      // Data del formulario de gestión de Ferreñafe (contacto / no contacto)
      this.listData = await lastValueFrom(this.sheetsService.getSheetDataFerre());
      this.calcular();
    } catch (e) {
      console.error('Error al cargar datos de Ferreñafe:', e);
      this.listData = [];
      this.asesoresData = [];
    } finally {
      this.isLoading = false;
    }
  }

  async actualizar() {
    await this.cargarDatos();
  }

  private calcular() {
    const fecha = this.formCtrl.value.fechaGestion as Date;

    // /ferre ya viene acotado a Ferreñafe → solo filtramos por fecha
    const filasDia = this.listData.filter(r => this.esMismaFecha(r['Marca temporal'], fecha));

    this.asesoresData = this.asesoresFerre.map(asesorNombre => {
      const regs = filasDia.filter(r => this.asesorDe(r) === asesorNombre.trim().toUpperCase());

      const contacto   = regs.filter(r => this.esContacto(r)).length;
      const noContacto = regs.filter(r => this.esNoContacto(r)).length;
      const total      = contacto + noContacto;

      return {
        asesor: asesorNombre,
        contacto, noContacto, total,
        porcentaje: total > 0 ? contacto / total : 0,
      };
    });

    // KPIs globales (sede)
    this.totalContactos   = this.asesoresData.reduce((s, a) => s + a.contacto, 0);
    this.totalNoContactos = this.asesoresData.reduce((s, a) => s + a.noContacto, 0);
    this.totalGestiones   = this.totalContactos + this.totalNoContactos;
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
    const map = (valor: (a: AsesorRow) => number) =>
      this.asesoresData
        .map(a => ({ asesor: a.asesor, valor: valor(a), meta: a.porcentaje }))
        .sort((x, y) => y.valor - x.valor);

    switch (this.kpiSeleccionado) {
      case 'contactos':    return map(a => a.contacto);
      case 'no-contactos': return map(a => a.noContacto);
      default: return [];
    }
  }

  get tituloDetalleKpi(): string {
    const titulos: Record<string, string> = {
      'contactos':    '✅ Contactos · por asesor',
      'no-contactos': '❌ No Contactos · por asesor',
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
  // Estado de gestión = CONTACTO / NO CONTACTO (columna 'ESTADO DE GESTIÓN' del form)
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
  private asesorDe(r: any): string {
    return (r['ASESOR CONTACT'] ?? '').toString().trim().toUpperCase();
  }

  private esMismaFecha(marca: string, fecha: Date): boolean {
    if (!marca || !marca.includes('/')) return false;
    const [d, m, a] = marca.split(' ')[0].split('/');
    return +d === fecha.getDate() && +m === (fecha.getMonth() + 1) && +a === fecha.getFullYear();
  }
}
