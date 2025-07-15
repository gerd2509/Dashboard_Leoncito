import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { SheetsService } from '../../../services/service-google.service';
import { DX_COMMON_MODULES } from '../../dx_common_modules';
import { SHARED_MATERIAL_IMPORTS } from '../../common_imports';
import { ExcelExportService } from '../../../services/excel/excel.service';
import { DxDataGridComponent } from 'devextreme-angular';

@Component({
  selector: 'app-gestion-contact-x-hora',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './gestion-contact-x-hora.component.html',
  styleUrl: './gestion-contact-x-hora.component.css'
})
export class GestionContactXHoraComponent implements OnInit {
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
    { value: '', viewValue: 'Seleccione Asesor' },
    { value: 'CC1', viewValue: 'MORETO DELGADO PATRICIA ESTEFANY' },
    { value: 'CC3', viewValue: 'UCHOFEN VIGO FELICITA' },
    { value: 'CC5', viewValue: 'QUISPE FONSECA KAREN AIMEE' },
    { value: 'CC6', viewValue: 'MORALES ÑIQUE MARIA CANDELARIA' },
    { value: 'CC7', viewValue: 'ACOSTA JIMENEZ MARIELA NATALY' },
    { value: 'CC8', viewValue: 'CHANTA CAMPOS KELLY KARINTIA' },
    { value: 'CC9', viewValue: 'PÉREZ TINEO MARICIELO TATIANA' }
  ];

  @ViewChild(DxDataGridComponent, { static: false }) dataGrid!: DxDataGridComponent;

  constructor(private fb: UntypedFormBuilder) {
    this.formGestion = this.fb.group({
      fechaInicio: [null, Validators.required],
      fechaFin: [null, Validators.required],
      Asesores: [''],
    });
  }

  async ngOnInit() {
    this.isLoading = true;
    try {
      this.listData = await lastValueFrom(this.service.getSheetData());
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

      this.listData = await lastValueFrom(this.service.getSheetData());

      const desde = new Date(fechaInicio);
      desde.setHours(0, 0, 0, 0);

      const hasta = new Date(fechaFin);
      hasta.setHours(23, 59, 59, 999);

      let datosFiltrados = this.listData.filter(item => {
        const texto = item["Marca temporal"];
        if (!texto) return false;

        const partes = texto.split(/[/\s:]/);
        const fecha = new Date(+partes[2], +partes[1] - 1, +partes[0]);

        return fecha >= desde && fecha <= hasta;
      });

      if (asesor) {
        const asesorNombre = this.asesores.find(a => a.value === asesor)?.viewValue?.trim().toUpperCase();
        datosFiltrados = datosFiltrados.filter(item => {
          const asesorEnDato = (item['ASESOR CONTACT'] || '').toString().trim().toUpperCase();
          return asesorEnDato === asesorNombre;
        });
      }

      if (this.filtroDerivacionActivo) {
        const motivosValidos = [
          'VENTA DERIVADA PARA CIERRE A SEDE',
          'VISITARÁ TIENDA',
          'SE ENVIÓ A ASESOR VISITA A DOMICILIO'
        ];
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
    // this.isLoading = true;
    // try {
    //   const fechaInicio = this.formGestion.value.fechaInicio;
    //   const fechaFin = this.formGestion.value.fechaFin;

    //   if (!fechaInicio || !fechaFin) {
    //     this.dataFiltrada = [];
    //     return;
    //   }

    //   this.listData = await lastValueFrom(this.service.getSheetData());

    //   const desde = new Date(fechaInicio);
    //   desde.setHours(0, 0, 0, 0);

    //   const hasta = new Date(fechaFin);
    //   hasta.setHours(23, 59, 59, 999);

    //   this.dataFiltrada = this.listData.filter(item => {
    //     const texto = item["Marca temporal"];
    //     if (!texto) return false;

    //     const partes = texto.split(/[/\s:]/);
    //     const fecha = new Date(+partes[2], +partes[1] - 1, +partes[0]);

    //     return fecha >= desde && fecha <= hasta;
    //   });
    // } catch (error) {
    //   console.error('Error al filtrar por fecha:', error);
    //   this.dataFiltrada = [];
    // } finally {
    //   this.isLoading = false;
    // }

    this.aplicarFiltros();
  }

  async onAsesorChanged(event: any): Promise<void> {
    // this.isLoading = true;
    // try {
    //   const selectedValue = event.value;

    //   // Vuelve a filtrar desde el servicio (opcional: puedes quitar esta línea si prefieres trabajar sobre `listData` local)
    //   // this.listData = await lastValueFrom(this.service.getSheetData());

    //   await this.filtrarPorFecha(); // aplica filtro de fecha primero

    //   if (!selectedValue) return;

    //   const asesorSeleccionado = this.asesores.find(a => a.value === selectedValue)?.viewValue?.trim().toUpperCase();

    //   this.dataFiltrada = this.dataFiltrada.filter(item => {
    //     const asesorEnDato = (item['ASESOR CONTACT'] || '').toString().trim().toUpperCase();
    //     return asesorEnDato === asesorSeleccionado;
    //   });
    // } catch (error) {
    //   console.error('Error al filtrar por asesor:', error);
    //   this.dataFiltrada = [];
    // } finally {
    //   this.isLoading = false;
    // }

    this.formGestion.patchValue({ Asesores: event.value });
    this.aplicarFiltros();
  }

  exportar(): void {
    if (this.dataGrid) {
      this.excelService.exportarDesdeGrid("dataTipoReportes", this.dataGrid);
    }
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
