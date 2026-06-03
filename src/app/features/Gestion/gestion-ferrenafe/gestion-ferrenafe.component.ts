import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { SheetsService } from '../../../services/service-google.service';
import { DX_COMMON_MODULES } from '../../dx_common_modules';
import { SHARED_MATERIAL_IMPORTS } from '../../common_imports';
import { DxDataGridComponent } from 'devextreme-angular';
import { ExcelExportService } from '../../../services/excel/excel.service';
@Component({
  selector: 'app-gestion-ferrenafe',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './gestion-ferrenafe.component.html',
  styleUrl: './gestion-ferrenafe.component.css'
})
export class GestionFerrenafeComponent implements OnInit {
  protected service      = inject(SheetsService);
  protected excelService = inject(ExcelExportService);

  formGestion: UntypedFormGroup;
  dataFiltrada: any[] = [];
  listData:     any[] = [];

  protected showFilterRow = true;
  protected currentFilter = 'auto';

  isLoading               = false;
  filtroDerivacionActivo  = false;
  filtroAgendamientoActivo = false;

  asesores = [
    { value: '',     viewValue: 'Seleccione Asesor' },
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

  @ViewChild(DxDataGridComponent, { static: false }) dataGrid!: DxDataGridComponent;

  constructor(private fb: UntypedFormBuilder) {
    this.formGestion = this.fb.group({
      fechaInicio: [null, Validators.required],
      fechaFin:    [null, Validators.required],
      Asesores:    [''],
    });
  }

  async ngOnInit() {

    this.isLoading = true;
    try {
      this.listData     = await lastValueFrom(this.service.getSheetDataFerre());
      this.dataFiltrada = [...this.listData];
    } catch (e) {
      console.error('Error al cargar datos Ferreñafe:', e);
    } finally {
      this.isLoading = false;
    }
  }

  async aplicarFiltros(): Promise<void> {
    this.isLoading = true;
    try {
      const fechaInicio = this.formGestion.value.fechaInicio;
      const fechaFin    = this.formGestion.value.fechaFin;
      const asesor      = this.formGestion.value.Asesores;

      if (!fechaInicio || !fechaFin) {
        this.dataFiltrada = [];
        return;
      }

      this.listData = await lastValueFrom(this.service.getSheetDataFerre());

      const desde = new Date(fechaInicio); desde.setHours(0, 0, 0, 0);
      const hasta = new Date(fechaFin);    hasta.setHours(23, 59, 59, 999);

      let filtrados = this.listData.filter(item => {
        const fecha = this.parseMarcaTemporal(item['Marca temporal']);
        return fecha ? fecha >= desde && fecha <= hasta : false;
      });

      if (asesor) {
        const nombre = this.asesores.find(a => a.value === asesor)?.viewValue?.trim().toUpperCase();
        filtrados = filtrados.filter(item =>
          (item['ASESOR CONTACT'] || '').toString().trim().toUpperCase() === (nombre || '')
        );
      }

      if (this.filtroDerivacionActivo) {
        const validos = ['VENTA DERIVADA PARA CIERRE A SEDE', 'VISITARÁ TIENDA', 'SE ENVIÓ A ASESOR VISITA A DOMICILIO']
          .map(x => x.toUpperCase());
        filtrados = filtrados.filter(item =>
          validos.includes((item['MOTIVO INTERÉS'] || '').toString().trim().toUpperCase())
        );
      }

      if (this.filtroAgendamientoActivo) {
        const validos = ['CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)'].map(x => x.toUpperCase());
        filtrados = filtrados.filter(item =>
          validos.includes((item['MOTIVO INTERÉS'] || '').toString().trim().toUpperCase())
        );
      }

      this.dataFiltrada = filtrados;
    } catch (e) {
      console.error('Error al aplicar filtros:', e);
      this.dataFiltrada = [];
    } finally {
      this.isLoading = false;
    }
  }

  async filtrarPorFecha() { this.aplicarFiltros(); }

  async onAsesorChanged(event: any): Promise<void> {
    this.formGestion.patchValue({ Asesores: event.value });
    this.aplicarFiltros();
  }

  exportar(): void {
    if (this.dataGrid) this.excelService.exportarDesdeGrid('gestion-ferrenafe', this.dataGrid);
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
  }

  private parseMarcaTemporal(texto: string): Date | null {
    if (!texto || typeof texto !== 'string') return null;
    const regex = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?/;
    const match = texto.match(regex);
    if (!match) return null;

    let day   = parseInt(match[1], 10);
    let month = parseInt(match[2], 10) - 1;
    const year = parseInt(match[3], 10);
    let hour   = match[4] ? parseInt(match[4], 10) : 0;
    const min  = match[5] ? parseInt(match[5], 10) : 0;
    const sec  = match[6] ? parseInt(match[6], 10) : 0;
    const ampm = match[7]?.toUpperCase() ?? null;

    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

    const d = new Date(year, month, day, hour, min, sec, 0);
    return isNaN(d.getTime()) ? null : d;
  }
}
