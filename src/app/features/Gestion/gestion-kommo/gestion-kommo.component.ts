import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../../common_imports';
import { DX_COMMON_MODULES } from '../../dx_common_modules';
import { SheetsService } from '../../../services/service-google.service';
import { ExcelExportService } from '../../../services/excel/excel.service';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { DxDataGridComponent } from 'devextreme-angular/ui/data-grid';
import { lastValueFrom } from 'rxjs';

@Component({
  selector: 'app-gestion-kommo',
  standalone: true,
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './gestion-kommo.component.html',
  styleUrl: './gestion-kommo.component.css'
})
export class GestionKommoComponent implements OnInit {
  protected service = inject(SheetsService);
  protected excelService = inject(ExcelExportService);

  formGestion: UntypedFormGroup;
  dataFiltrada: any[] = [];
  listData: any[] = [];
  isLoading = false;

  tiendaSeleccionada: string = '';
  asesoresFiltrados: any[] = [];
  labelAsesor: string = 'Asesor';

  columnaAsesor: string = 'ASESOR CONTACT';
  columnaDni: string = 'DNI CLIENTE';
  columnaCelular: string = 'CELULAR GESTIONADO';
  columnaEstado: string = 'ESTADO DE GESTIÓN';
  columnaMotivoNoAtendible: string = 'MOTIVO NO ATENDIBLE';

  asesoresCall = [
    { value: 'CC1', viewValue: 'MORETO DELGADO PATRICIA ESTEFANY' },
    { value: 'CC3', viewValue: 'UCHOFEN VIGO FELICITA' },
    { value: 'CC5', viewValue: 'QUISPE FONSECA KAREN AIMEE' },
    { value: 'CC6', viewValue: 'MORALES ÑIQUE MARIA CANDELARIA' },
    { value: 'CC7', viewValue: 'ACOSTA JIMENEZ MARIELA NATALY' },
    { value: 'CC8', viewValue: 'CHANTA CAMPOS KELLY KARINTIA' },
    { value: 'CC9', viewValue: 'PÉREZ TINEO MARICIELO TATIANA' },
    { value: 'CC10', viewValue: 'RIVAS PURISACA KAREN YUDITH' },
    { value: 'CC11', viewValue: 'SAMAME HUAMAN ARIADNE' }
  ];

  asesoresRealzza = [
    { value: 'RZ1', viewValue: 'ACOSTA JIMENEZ MARIELA NATALY' },
    { value: 'RZ2', viewValue: 'PEREZ TINEO MARICIELO TATIANA' },
    { value: 'RZ3', viewValue: 'RIVAS PURISACA KAREN YUDITH' },
    { value: 'RZ4', viewValue: 'BERNAL BAZAN BRENDA NICOL' },
    { value: 'RZ5', viewValue: 'SAMAME HUAMAN ARIADNE' },
    { value: 'RZ6', viewValue: 'MIÑOPE GONZALES ANYELA ESTHEFANY' },
    { value: 'RZ7', viewValue: 'SANDOVAL OTINIANO JUANA DEL PILAR' },
    { value: 'RZ8', viewValue: 'SERNAQUE DAVILA JUAN ALBERTO' },
    { value: 'RZ9', viewValue: 'CARRANZA ALARCON TREYCI JOHANA' },
  ];

  @ViewChild(DxDataGridComponent, { static: false }) dataGrid!: DxDataGridComponent;

  constructor(private fb: UntypedFormBuilder) {
    this.formGestion = this.fb.group({
      tienda: [''],
      fechaInicio: [null],
      fechaFin: [null],
      Asesores: [''],
    });
  }

  async ngOnInit() {
    await this.cargarDatos();
  }

  async cargarDatos() {
    this.isLoading = true;
    try {
      this.listData = await lastValueFrom(this.service.getSheetKOMMO());
      // Al inicio trae todos los datos tal cual
      this.dataFiltrada = [...this.listData];
    } catch (error) {
      console.error('Error al cargar los datos:', error);
    } finally {
      this.isLoading = false;
    }
  }

  onTiendaChanged(e: any) {
    const seleccion = e.value;
    this.tiendaSeleccionada = seleccion;

    // 1. Limpiar la tabla inmediatamente al cambiar de opción
    this.dataFiltrada = [];

    // 2. Configurar columnas y asesores según selección
    if (seleccion === 'LEONCITO') {
      this.labelAsesor = 'Asesor Contact';
      this.asesoresFiltrados = this.asesoresCall;
      this.columnaAsesor = 'ASESOR CONTACT';
      this.columnaDni = 'DNI CLIENTE';
      this.columnaCelular = 'CELULAR GESTIONADO';
      this.columnaEstado = 'ESTADO DE GESTIÓN';
      this.columnaMotivoNoAtendible = 'MOTIVO NO ATENDIBLE';
    } else if (seleccion === 'REALZZA') {
      this.labelAsesor = 'Asesor Realzza';
      this.asesoresFiltrados = this.asesoresRealzza;
      this.columnaAsesor = 'ASESOR REALZZA';
      this.columnaDni = 'DNI CLIENTE REALZZA';
      this.columnaCelular = 'CELULAR GESTIONADO REALZZA';
      this.columnaEstado = 'ESTADO DE GESTIÓN REALZZA';
      this.columnaMotivoNoAtendible = 'MOTIVO NO ATENDIBLE';
    } else {
      this.asesoresFiltrados = [];
      this.labelAsesor = 'Asesor';
      // Si vuelve a "SELECCIONE", podemos mostrar todo de nuevo o dejarlo vacío
      this.dataFiltrada = [...this.listData];
    }

    this.formGestion.get('Asesores')?.setValue('');
  }

  async aplicarFiltros(): Promise<void> {
    const { fechaInicio, fechaFin, Asesores, tienda } = this.formGestion.value;

    this.isLoading = true;
    try {
      let datos = [...this.listData];

      if (tienda) {
        datos = datos.filter(item => item['TIENDA'] === tienda);
      }

      if (fechaInicio && fechaFin) {
        const desde = new Date(fechaInicio);
        desde.setHours(0, 0, 0, 0);
        const hasta = new Date(fechaFin);
        hasta.setHours(23, 59, 59, 999);

        datos = datos.filter(item => {
          const fecha = this.parseMarcaTemporal(item['Marca temporal']);
          return fecha && fecha >= desde && fecha <= hasta;
        });
      }

      if (Asesores) {
        const asesorObj = this.asesoresFiltrados.find(a => a.value === Asesores);
        const nombreBuscado = asesorObj?.viewValue?.trim().toUpperCase();

        datos = datos.filter(item => {
          const colBusqueda = this.columnaAsesor || 'ASESOR CONTACT';
          const asesorEnDato = (item[colBusqueda] || '').toString().trim().toUpperCase();
          return asesorEnDato === nombreBuscado;
        });
      }

      this.dataFiltrada = datos;

      if (this.dataGrid && this.dataGrid.instance) {
        this.dataGrid.instance.refresh();
      }
    } finally {
      this.isLoading = false;
    }
  }

  filtrarPorFecha() {
    this.aplicarFiltros();
  }

  exportar(): void {
    if (this.dataGrid) {
      const nombreTienda = this.tiendaSeleccionada || 'GENERAL';
      this.excelService.exportarDesdeGrid(`Reporte_Kommo_${nombreTienda}`, this.dataGrid);
    }
  }

  onCellPrepared(e: any) {
    if (e.rowType === 'header') {
      e.cellElement.style.backgroundColor = "#293964";
      e.cellElement.style.color = "white";
      e.cellElement.style.fontWeight = "bold";
      e.cellElement.style.border = "1.5px solid black";
      e.cellElement.style.textAlign = "center";
    }
  }

  private parseMarcaTemporal(texto: string): Date | null {
    if (!texto) return null;
    const regex = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
    const m = texto.match(regex);
    if (!m) return null;
    return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
  }
}