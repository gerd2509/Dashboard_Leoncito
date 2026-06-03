import { Component, OnInit, OnDestroy } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { SheetsService } from '../../services/service-google.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-control-gestion-ferrenafe',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './control-gestion-ferrenafe.component.html',
  styleUrl: './control-gestion-ferrenafe.component.css'
})
export class ControlGestionFerrenafeComponent implements OnInit, OnDestroy {

  formFerre: UntypedFormGroup;

  dataFerre: any[] = [];
  dataContactabilidad: any[] = [];

  totalContactos     = 0;
  totalNoContactos   = 0;
  totalCortaLlamada  = 0;
  totalGestiones     = 0;
  porcentajeContactabilidad = 0;

  isLoading = false;
  kpiSeleccionado: string | null = null;
  nombreSede = '';

  private readonly META_LLAMADAS = 30;
  private intervaloCincoMin: any = null;

  private readonly asesores = [
    { value: 'FE1',  viewValue: 'ESMERALDA CHICOMA' },
    { value: 'FE2',  viewValue: 'LUCIA RUIZ' },
    { value: 'FE3',  viewValue: 'IRENE CARRASCO' },
    { value: 'FE4',  viewValue: 'LISET NUÑEZ' },
    { value: 'FE5',  viewValue: 'PAOLA QUEZADA' },
    { value: 'FE6',  viewValue: 'NATALI MORANTE' },
    { value: 'FE7',  viewValue: 'DANITZA CESPEDES' },
    { value: 'FE8',  viewValue: 'ADRIANA GINES' },
    { value: 'FE9',  viewValue: 'JULISSA VILCHEZ' },
    { value: 'FE10', viewValue: 'DAYANA CIEZA' },
    { value: 'FE11', viewValue: 'ERICK CAJO' },
  ];
  constructor(
    private fb: UntypedFormBuilder,
    private sheetsService: SheetsService,
    private auth: AuthService,
  ) {
    this.formFerre = this.fb.group({ fechaGestion: [new Date()] });
  }

  async ngOnInit() {
    this.nombreSede = this.auth.getSede();

    await this.cargarDatos();
    this.intervaloCincoMin = setInterval(() => this.actualizar(), 5 * 60 * 1000);
  }

  ngOnDestroy() {
    if (this.intervaloCincoMin) clearInterval(this.intervaloCincoMin);
  }

  private async cargarDatos() {
    this.isLoading = true;
    try {
      this.dataFerre = await lastValueFrom(this.sheetsService.getSheetDataFerre());
      this.calcularIndicadores();
    } catch (e) {
      console.error(`Error al cargar datos ${this.nombreSede}:`, e);
    } finally {
      this.isLoading = false;
    }
  }

  async actualizar() {
    await this.cargarDatos();
  }

  calcularIndicadores() {
    this.dataContactabilidad = this.procesarContactabilidad();
    this.totalContactos     = this.dataContactabilidad.reduce((s, r) => s + (r['CONTACTO']      || 0), 0);
    this.totalNoContactos   = this.dataContactabilidad.reduce((s, r) => s + (r['NO CONTACTO']   || 0), 0);
    this.totalCortaLlamada  = this.dataContactabilidad.reduce((s, r) => s + (r['CORTA LLAMADA'] || 0), 0);
    this.totalGestiones     = this.dataContactabilidad.reduce((s, r) => s + (r['TOTAL']         || 0), 0);
    this.porcentajeContactabilidad = this.totalGestiones > 0
      ? Math.round((this.totalContactos / this.totalGestiones) * 100) : 0;
  }

  private procesarContactabilidad(): any[] {
    const fecha = this.obtenerFechaSeleccionada();
    if (!fecha) return [];
    const { dia, mes, anio } = fecha;

    return this.asesores.map(asesor => {
      const registros = this.dataFerre.filter(item =>
        item['ASESOR CONTACT']?.toUpperCase().trim() === asesor.viewValue.toUpperCase().trim() &&
        this.esMismaFecha(item['Marca temporal'], dia, mes, anio)
      );
      const contactoTotal  = registros.filter(r => r['ESTADO DE GESTIÓN'] === 'CONTACTO');
      const cortaLlamada   = contactoTotal.filter(r => r['MOTIVO NO INTERÉS'] === 'CORTA LLAMADA').length;
      const contacto       = contactoTotal.length - cortaLlamada;
      const noContacto     = registros.filter(r => r['ESTADO DE GESTIÓN'] === 'NO CONTACTO').length;
      const total          = contacto + cortaLlamada + noContacto;

      return {
        'ASESOR ID':      asesor.value,
        'ASESOR CONTACT': asesor.viewValue,
        'CONTACTO':       contacto,
        'CORTA LLAMADA':  cortaLlamada,
        'NO CONTACTO':    noContacto,
        'TOTAL':          total,
        'PORCENTAJE':     Math.min(total / this.META_LLAMADAS, 1),
      };
    });
  }

  toggleKpi(tipo: string): void {
    this.kpiSeleccionado = this.kpiSeleccionado === tipo ? null : tipo;
  }

  getNombreCorto(nombreCompleto: string): string {
    const partes = nombreCompleto.trim().split(' ');
    return partes[0]
      ? partes[0].charAt(0).toUpperCase() + partes[0].slice(1).toLowerCase()
      : nombreCompleto;
  }

  onCellPrepared(e: any) {
    if (e.rowType === 'header') {
      e.cellElement.style.padding         = '8px';
      e.cellElement.style.backgroundColor = '#293964';
      e.cellElement.style.color           = '#FFFFFF';
      e.cellElement.style.fontWeight      = '700';
      e.cellElement.style.fontSize        = '11px';
      e.cellElement.style.letterSpacing   = '0.5px';
      e.cellElement.style.textTransform   = 'uppercase';
    }
    if (e.rowType === 'data') {
      if (e.column.dataField === 'PORCENTAJE') {
        const v = e.value || 0;
        e.cellElement.style.fontWeight = '700';
        e.cellElement.style.color = v >= 0.85 ? '#3D9B2F' : v >= 0.5 ? '#F07420' : '#DC2626';
      }
      if (e.column.dataField === 'CONTACTO')      { e.cellElement.style.color = '#3D9B2F'; e.cellElement.style.fontWeight = '600'; }
      if (e.column.dataField === 'NO CONTACTO')   { e.cellElement.style.color = '#DC2626'; e.cellElement.style.fontWeight = '600'; }
      if (e.column.dataField === 'CORTA LLAMADA') { e.cellElement.style.color = '#F07420'; e.cellElement.style.fontWeight = '600'; }
    }
    if (e.rowType === 'totalFooter') {
      e.cellElement.style.fontWeight      = '700';
      e.cellElement.style.backgroundColor = '#F0F6FF';
    }
  }

  get colorContactabilidad(): string {
    return this.porcentajeContactabilidad >= 85 ? '#3D9B2F'
         : this.porcentajeContactabilidad >= 50 ? '#F07420'
         : '#DC2626';
  }

  private obtenerFechaSeleccionada(): { dia: number; mes: number; anio: number } | null {
    const fecha: Date = this.formFerre.value.fechaGestion;
    if (!fecha) return null;
    return { dia: fecha.getDate(), mes: fecha.getMonth() + 1, anio: fecha.getFullYear() };
  }

  private esMismaFecha(marcaTemporal: string, dia: number, mes: number, anio: number): boolean {
    if (!marcaTemporal || !marcaTemporal.includes('/')) return false;
    const [diaStr, mesStr, anioStr] = marcaTemporal.split(' ')[0].split('/');
    return +diaStr === dia && +mesStr === mes && +anioStr === anio;
  }
}
