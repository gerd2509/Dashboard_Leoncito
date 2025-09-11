import { Component, inject, ViewChild } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { SheetsService } from '../../services/service-google.service';
import { ExcelExportService } from '../../services/excel/excel.service';
import { DxDataGridComponent } from 'devextreme-angular';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { lastValueFrom } from 'rxjs';

@Component({
  selector: 'app-terceros',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './terceros.component.html',
  styleUrl: './terceros.component.css'
})
export class TercerosComponent {
  protected service = inject(SheetsService);
  protected excelService = inject(ExcelExportService);

  protected showFilterRow: boolean = true;  // Controla si la fila de filtro está visible o no
  protected currentFilter: string = 'auto'; // Puede ser 'auto' o 'onClick'

  formTerceros: UntypedFormGroup;
  datosFiltrados: any[] = [];
  datosOriginales: any[] = [];

  isLoading = false;

  @ViewChild(DxDataGridComponent, { static: false }) dataGrid!: DxDataGridComponent;

  constructor(
    private fb: UntypedFormBuilder
  ) {
    this.formTerceros = this.fb.group({
      fechaInicio: [null, Validators.required],
      fechaFin: [null, Validators.required],
      Asesores: ['']
    });
  }

  async ngOnInit(): Promise<void> {
    await this.cargasIniciales();
  }

  async cargasIniciales(): Promise<void> {
    this.datosOriginales = await lastValueFrom(this.service.getSheetData());
    console.log(this.datosOriginales)
  }

  soloFecha = (d: any) => {
    return d['Marca temporal']?.split(' ')[0] ?? '';
  };

  async actualizar(): Promise<void> {
    const { fechaInicio, fechaFin, Asesores } = this.formTerceros.value;
    if (!fechaInicio || !fechaFin) return;

    this.isLoading = true;

    try {
      this.datosOriginales = await lastValueFrom(this.service.getSheetData());

      // Normalizar las fechas de comparación (inicio al 00:00:00 y fin al 23:59:59)
      const inicio = new Date(fechaInicio);
      const fin = new Date(fechaFin);
      fin.setHours(23, 59, 59, 999);

      const tercerosFiltrados = this.datosOriginales.filter((d: any) => {
        const fechaReLlamadaStr = (d['FECHA DE RE-LLAMADA'] || '').trim();
        const resultadoGestion = (d['RESULTADO DE GESTIÓN'] || '').trim().toUpperCase();

        const fechaReLlamada = this.parseFechaDMY(fechaReLlamadaStr); // dd/mm/yyyy

        return (
          fechaReLlamada &&
          fechaReLlamada >= inicio &&
          fechaReLlamada <= fin &&
          resultadoGestion === "TERCERO RELACIONADO"
        );
      });

      this.datosFiltrados = tercerosFiltrados.map(fila => ({
        ...fila,
        estadoTercero: this.evaluarEstadoString(fila, this.datosOriginales)
      }));
    } catch (error) {
      console.error('Error al actualizar:', error);
    } finally {
      this.isLoading = false;
    }
  }

  evaluarEstadoString(fila: any, agendamientos: any[]): string {
    const dni = fila["DNI CLIENTE"];
    const marcaTemporalStr = fila["Marca temporal"];
    const resultado = (fila["RESULTADO DE GESTIÓN"] || "").toUpperCase().trim();

    if (resultado !== "TERCERO RELACIONADO") return "";

    const marcaTemporal = this.parseFecha(marcaTemporalStr);
    if (!marcaTemporal) return "";

    // 1. Filtrar registros del mismo DNI y resultado "TERCERO RELACIONADO"
    const relacionados = agendamientos.filter(p =>
      (p["DNI CLIENTE"] === dni) &&
      (p["RESULTADO DE GESTIÓN"]?.toUpperCase().trim() === "TERCERO RELACIONADO")
    );

    if (relacionados.length === 0) return "";

    // 2. Encontrar la marca temporal máxima
    const maxMarcaTemporal = relacionados.reduce((max, p) => {
      const mt = this.parseFecha(p["Marca temporal"]);
      return (mt && (!max || mt > max)) ? mt : max;
    }, null as Date | null);

    if (!maxMarcaTemporal || marcaTemporal.getTime() !== maxMarcaTemporal.getTime()) {
      return "ATENDIDO"; // No es la marca temporal más reciente
    }

    // 3. Verificar si existen registros posteriores (misma persona, fecha mayor)
    const posteriores = agendamientos.filter(p => {
      const mt = this.parseFecha(p["Marca temporal"]);
      return (p["DNI CLIENTE"] === dni) &&
        mt &&
        mt.getTime() > marcaTemporal.getTime();
    });

    return posteriores.length > 0 ? "ATENDIDO" : "NO ATENDIDO";
  }

  parseFecha(fechaStr: string): Date | null {
    if (!fechaStr) return null;
    const partes = fechaStr.split(' ');
    const fechaPartes = partes[0].split('/').map(Number);
    if (fechaPartes.length !== 3) return null;

    const [dia, mes, anio] = fechaPartes;

    let horas = 0, minutos = 0, segundos = 0;
    if (partes[1]) {
      const horaPartes = partes[1].split(':').map(Number);
      [horas, minutos, segundos] = horaPartes;
    }

    return new Date(anio, mes - 1, dia, horas, minutos, segundos);
  }

  parseFechaDMY(fechaStr: string): Date | null {
    if (!fechaStr) return null;
    const partes = fechaStr.split('/');
    if (partes.length !== 3) return null;

    const [dia, mes, anio] = partes.map(Number);
    if (isNaN(dia) || isNaN(mes) || isNaN(anio)) return null;

    return new Date(anio, mes - 1, dia);
  }

  getComentarioAdicionalUnido = (d: any): string => {
    const comentarios = Object.keys(d)
      .filter(key => key.toUpperCase().startsWith('COMENTARIO ADICIONAL'))
      .map(key => d[key])
      .filter(valor => valor && valor.trim() !== '');
    return comentarios.join(' | ');
  };

  exportar(): void {
    if (this.dataGrid) {
      this.excelService.exportarDesdeGrid("dataTerceros", this.dataGrid);
    }
  }

  onCellPrepared(e: any) {
    // Estilos para el encabezado
    if (e.rowType === 'header' && !e.cellElement.classList.contains('dx-editor-cell')) {
      e.cellElement.style.padding = "8px";
      e.cellElement.style.backgroundColor = "#293964";
      e.cellElement.style.color = "white";
      e.cellElement.style.textAlign = "center";
      e.cellElement.style.fontWeight = "bold";
      e.cellElement.style.whiteSpace = "normal";
      e.cellElement.style.height = "auto";
      e.cellElement.style.borderWidth = "1.5px";
      e.cellElement.style.borderColor = "black";
      return;
    }

    // Estilos por estado en la columna "estadoTercero"
    if (e.rowType === 'data' && e.column.dataField === 'estadoTercero') {
      const estado = e.value;
      switch (estado) {
        case 'ATENDIDO':
          e.cellElement.style.backgroundColor = '#c8e6c9'; // verde claro
          break;
        case 'NO ATENDIDO':
          e.cellElement.style.backgroundColor = '#fff9c4'; // amarillo claro
          break;
      }

      // Estilo común para celdas con estado
      e.cellElement.style.fontWeight = 'bold';
      e.cellElement.style.textAlign = 'center';
    }
  }
}
