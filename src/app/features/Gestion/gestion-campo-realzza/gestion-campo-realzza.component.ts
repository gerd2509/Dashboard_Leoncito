import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../../common_imports';
import { DX_COMMON_MODULES } from '../../dx_common_modules';
import { SheetsService } from '../../../services/service-google.service';
import { ExcelExportService } from '../../../services/excel/excel.service';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { DxDataGridComponent } from 'devextreme-angular';
import { lastValueFrom } from 'rxjs';

@Component({
  selector: 'app-gestion-campo-realzza',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './gestion-campo-realzza.component.html',
  styleUrl: './gestion-campo-realzza.component.css'
})
export class GestionCampoRealzzaComponent implements OnInit {
  protected service = inject(SheetsService);
  protected excelService = inject(ExcelExportService);

  formGestion: UntypedFormGroup;
  dataFiltrada: any[] = [];
  listData: any[] = [];

  protected showFilterRow: boolean = true;
  protected currentFilter: string = 'auto';

  isLoading = false;
  filtroDerivacionActivo: boolean = false;

  asesores = [
    { value: '', viewValue: 'SELECCIONE ASESOR' },
    { value: 'AV1', viewValue: 'MONTALVO LUYO ERNESTO ADOLFO' },
    { value: 'AV2', viewValue: 'ACOSTA JIMENEZ MARIELA NATALY' },
    { value: 'AV3', viewValue: 'PEREZ TINEO MARICIELO TATIANA' },
    { value: 'AV4', viewValue: 'RIVAS PURISACA KAREN YUDITH' },
    { value: 'AV5', viewValue: 'NAVARRO CASTAÑEDA MARISA GLADYS' },
    { value: 'AV6', viewValue: 'SANDOVAL OTINIANO JUANA DEL PILAR' },
    { value: 'AV7', viewValue: 'ORDINOLA LEON SILVANA MARTINA' },
    { value: 'AV8', viewValue: 'BERNAL BAZAN BRENDA NICOL' },
    { value: 'AV9', viewValue: 'ARROBAS LOZADA DORA YVONNE' },
    { value: 'AV10', viewValue: 'SERNAQUE DAVILA JUAN ALBERTO' },
    { value: 'AV11', viewValue: 'SANTAMARIA GUZMAN MERLY BRIGHITE' }
  ];

  @ViewChild(DxDataGridComponent, { static: false }) dataGrid!: DxDataGridComponent;

  constructor(private fb: UntypedFormBuilder) {
    this.formGestion = this.fb.group({
      fechaInicio: [null, Validators.required],
      fechaFin: [null, Validators.required],
      Asesores: [''],
    });
  }

  // Devuelve la fecha dinámica según el motivo
  obtenerFechaInteres(item: any): string {
    const motivo = (item["MOTIVO INTERÉS"] || '').toString().trim().toUpperCase();

    if (motivo === 'VENTA DERIVADA PARA CIERRE A SEDE') {
      return item["FECHA DE INTERÉS DERIVACIÓN"] || '';
    }
    if (motivo === 'CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)') {
      return item["FECHA DE INTERÉS AGENDAMIENTO"] || '';
    }

    return '';
  }

  // Devuelve el comentario adicional según el motivo
  obtenerComentrarioAdicional(item: any): string {
    const motivo = (item["MOTIVO INTERÉS"] || '').toString().trim().toUpperCase();

    if (motivo === 'VENTA DERIVADA PARA CIERRE A SEDE') {
      return item["COMENTARIO ADICIONAL DERIVACIÓN"] || '';
    }
    if (motivo === 'CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)') {
      return item["COMENTARIO ADICIONAL AGENDAMIENTO"] || '';
    }

    return '';
  }

  async ngOnInit() {
    await this.cargasIniciales();
  }

  async cargasIniciales() {
    this.isLoading = true;
    try {
      this.listData = await lastValueFrom(this.service.getSheetDataCampo());

      // 🔹 Calculamos la columna dinámica desde el inicio
      this.listData = this.listData.map(item => ({
        ...item,
        FECHA_INTERES_DINAMICA: this.obtenerFechaInteres(item),
        COMENTARIO_ADICIONAL_DINAMICA: this.obtenerComentrarioAdicional(item)
      }));

      this.dataFiltrada = [...this.listData];
    } catch (error) {
      console.error('Error al cargar los datos:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async aplicarFiltros(): Promise<void> {
    this.isLoading = true;
    try {
      const fechaInicio = this.formGestion.value.fechaInicio;
      const fechaFin = this.formGestion.value.fechaFin;
      const asesor = this.formGestion.value.Asesores;

      if (!fechaInicio || !fechaFin) {
        this.dataFiltrada = [];
        return;
      }

      this.listData = await lastValueFrom(this.service.getSheetDataCampo());

      // 🔹 Aplicamos la misma lógica de fecha dinámica al cargar nueva data
      this.listData = this.listData.map(item => ({
        ...item,
        FECHA_INTERES_DINAMICA: this.obtenerFechaInteres(item),
        COMENTARIO_ADICIONAL_DINAMICA: this.obtenerComentrarioAdicional(item)
      }));

      const desde = new Date(fechaInicio);
      desde.setHours(0, 0, 0, 0);

      const hasta = new Date(fechaFin);
      hasta.setHours(23, 59, 59, 999);

      let datosFiltrados = this.listData.filter(item => {
        const texto = item["Marca temporal"];
        if (!texto) return false;
        const fecha = this.parseMarcaTemporal(texto);
        if (!fecha) return false;
        return fecha >= desde && fecha <= hasta;
      });

      if (asesor) {
        const asesorNombre = this.asesores.find(a => a.value === asesor)?.viewValue?.trim().toUpperCase();
        datosFiltrados = datosFiltrados.filter(item => {
          const asesorEnDato = (item['ASESOR REALZZA'] || '').toString().trim().toUpperCase();
          return asesorEnDato === (asesorNombre || '');
        });
      }

      if (this.filtroDerivacionActivo) {
        const motivosValidos = [
          'VENTA DERIVADA PARA CIERRE A SEDE'
        ].map(x => x.toUpperCase());

        datosFiltrados = datosFiltrados.filter(item =>
          motivosValidos.includes((item["MOTIVO INTERÉS"] || '').toString().trim().toUpperCase())
        );
      }

      this.dataFiltrada = datosFiltrados;
    } catch (error) {
      console.error('Error al aplicar filtros:', error);
      this.dataFiltrada = [];
    } finally {
      this.isLoading = false;
    }
  }

  async filtrarPorFecha() {
    if (this.formGestion.controls['fechaInicio'].invalid || this.formGestion.controls['fechaFin'].invalid) {
      await this.cargasIniciales()
    } else {
      await this.aplicarFiltros();
    }
  }

  async onAsesorChanged(event: any): Promise<void> {
    this.formGestion.patchValue({ Asesores: event.value });
    this.aplicarFiltros();
  }

  exportar(): void {
    if (this.dataGrid) {
      this.excelService.exportarDesdeGrid("dataGestionCampo", this.dataGrid);
    }
  }

  // Parseo robusto de "Marca temporal" (dd/MM/yyyy [HH:mm[:ss]] [AM/PM])
  private parseMarcaTemporal(texto: string): Date | null {
    if (!texto || typeof texto !== 'string') return null;
    const regex = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?/;
    const m = texto.match(regex);
    if (!m) return null;

    let day = parseInt(m[1], 10);
    let month = parseInt(m[2], 10) - 1;
    const year = parseInt(m[3], 10);

    let hour = m[4] ? parseInt(m[4], 10) : 0;
    const minute = m[5] ? parseInt(m[5], 10) : 0;
    const second = m[6] ? parseInt(m[6], 10) : 0;
    const ampm = m[7]?.toUpperCase() ?? null;

    if (ampm) {
      if (ampm === 'PM' && hour < 12) hour += 12;
      if (ampm === 'AM' && hour === 12) hour = 0;
    }

    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

    const d = new Date(year, month, day, hour, minute, second, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  onCellPrepared(e: any) {
    if (e.rowType === 'header') {
      e.cellElement.style.padding = "8px";
      e.cellElement.style.backgroundColor = "#293964";
      e.cellElement.style.color = "white";
      e.cellElement.style.textAlign = "center";
      e.cellElement.style.fontWeight = "bold";
      e.cellElement.style.whiteSpace = "normal";
      e.cellElement.style.height = "auto";
      e.cellElement.style.border = "1.5px solid black";
    }
  }
}
