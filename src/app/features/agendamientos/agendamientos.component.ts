import { Component, inject, ViewChild } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { SheetsService } from '../../services/service-google.service';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { DxDataGridComponent } from 'devextreme-angular';
import { ExcelExportService } from '../../services/excel/excel.service';

@Component({
  selector: 'app-agendamientos',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './agendamientos.component.html',
  styleUrl: './agendamientos.component.css'
})
export class AgendamientosComponent {
  protected service = inject(SheetsService);
  protected excelService = inject(ExcelExportService);

  protected showFilterRow: boolean = true;  // Controla si la fila de filtro está visible o no
  protected currentFilter: string = 'auto'; // Puede ser 'auto' o 'onClick'

  formAgendamientos: UntypedFormGroup;
  datosFiltrados: any[] = [];
  datosOriginales: any[] = [];

  isLoading = false;

  @ViewChild(DxDataGridComponent, { static: false }) dataGrid!: DxDataGridComponent;

  constructor(
    private fb: UntypedFormBuilder
  ) {
    const currentDate = new Date();

    this.formAgendamientos = this.fb.group({
      fechaGestion: [currentDate],
      Asesores: ['']
    });
  }

  async ngOnInit() {
    this.cargasIniciales();
  }

  async cargasIniciales() {
    this.datosOriginales = await lastValueFrom(this.service.getSheetData());
    console.log(this.datosOriginales)
  }

  soloFecha = (d: any) => {
    return d['Marca temporal']?.split(' ')[0] ?? '';
  };

  evaluarEstadoString(fila: any, agendamientos: any[]): string {
    const dni = fila["DNI CLIENTE"];
    const marcaTemporalActualStr = fila["Marca temporal"];
    const motivoInteres = fila["MOTIVO INTERÉS"];

    if (motivoInteres !== "CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)") return "";

    const marcaTemporalActual = this.parseFecha(marcaTemporalActualStr);
    if (!marcaTemporalActual) return "";

    const posteriores = agendamientos.filter(p => {
      const mt = this.parseFecha(p["Marca temporal"]);
      return p["DNI CLIENTE"] === dni && mt && mt > marcaTemporalActual;
    });

    const reagendado = posteriores.some(p =>
      (p["RESULTADO DE GESTIÓN"]?.toUpperCase().trim() === "TERCERO RELACIONADO") ||
      (p["MOTIVO INTERÉS"]?.toUpperCase().trim() === "CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)")
    );
    if (reagendado) return "REAGENDADO";

    const resultadosAtendido = [
      "VENTA DERIVADA PARA CIERRE A SEDE",
      "VISITARÁ TIENDA",
      "SE ENVIÓ A ASESOR VISITA A DOMICILIO",
      "NO INTERESADO",
      "NO ATENDIBLE"
    ];
    const estadosAtendido = ["CONTACTO", "NO CONTACTO"];

    const atendido = posteriores.some(p => {
      const resultado = (p["RESULTADO DE GESTIÓN"] || "").toUpperCase().trim();
      const estado = (p["ESTADO DE GESTIÓN"] || "").toUpperCase().trim();
      return resultadosAtendido.includes(resultado) || estadosAtendido.includes(estado);
    });

    return atendido ? "ATENDIDO" : "VIGENTE";
  }

  parseFecha(fechaStr: string): Date | null {
    if (!fechaStr) return null;
    const partes = fechaStr.split(' ');
    const [dia, mes, anio] = partes[0].split('/').map(Number);
    const [hora, minuto, segundo] = partes[1]?.split(':').map(Number) || [0, 0, 0];

    return new Date(anio, mes - 1, dia, hora, minuto, segundo);
  }

  async actualizar() {
    const fechaSeleccionada = this.formAgendamientos.value.fechaGestion;
    if (!fechaSeleccionada) return;

    this.isLoading = true;

    try {
      // Re-consultar los datos desde Google Sheets
      this.datosOriginales = await lastValueFrom(this.service.getSheetData());

      const dia = fechaSeleccionada.getDate().toString().padStart(2, '0');
      const mes = (fechaSeleccionada.getMonth() + 1).toString().padStart(2, '0');
      const anio = fechaSeleccionada.getFullYear();
      const fechaSeleccionadaFormateada = `${dia}/${mes}/${anio}`;

      const agendamientosDelDia = this.datosOriginales.filter((d: any) => {
        const fechaInteres = (d['FECHA DE INTERÉS'] || '').trim();
        const motivo = (d['MOTIVO INTERÉS'] || '').trim().toUpperCase();

        return fechaInteres === fechaSeleccionadaFormateada &&
          motivo === "CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)";
      });

      this.datosFiltrados = agendamientosDelDia.map(fila => ({
        ...fila,
        estadoAgendamiento: this.evaluarEstadoString(fila, this.datosOriginales)
      }));
    } catch (error) {
      console.error('Error al actualizar datos:', error);
    } finally {
      this.isLoading = false;
    }
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
      this.excelService.exportarDesdeGrid("dataAgendamientos", this.dataGrid);
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

    // Estilos por estado en la columna "estadoAgendamiento"
    if (e.rowType === 'data' && e.column.dataField === 'estadoAgendamiento') {
      const estado = e.value;
      switch (estado) {
        case 'ATENDIDO':
          e.cellElement.style.backgroundColor = '#c8e6c9'; // verde claro
          break;
        case 'REAGENDADO':
          e.cellElement.style.backgroundColor = '#fff9c4'; // amarillo claro
          break;
        case 'VIGENTE':
          e.cellElement.style.backgroundColor = '#ffcdd2'; // rojo claro
          break;
      }

      // Estilo común para celdas con estado
      e.cellElement.style.fontWeight = 'bold';
      e.cellElement.style.textAlign = 'center';
    }
  }

}
