import { Component, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { SheetsService } from '../../services/service-google.service';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';

@Component({
  selector: 'app-agendamientos',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './agendamientos.component.html',
  styleUrl: './agendamientos.component.css'
})
export class AgendamientosComponent {
  protected service = inject(SheetsService);

  protected showFilterRow: boolean = true;  // Controla si la fila de filtro está visible o no
  protected currentFilter: string = 'auto'; // Puede ser 'auto' o 'onClick'

  formAgendamientos: UntypedFormGroup;
  datosFiltrados: any[] = [];
  datosOriginales: any[] = [];

  constructor(
    private fb: UntypedFormBuilder
  ) {
    const currentDate = new Date();

    this.formAgendamientos = this.fb.group({
      fechaGestion: [currentDate]
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

  // public calcularEstadoAgendamiento = (rowData: any): string => {
  //   return this.evaluarEstadoString(rowData);
  // };

  evaluarEstadoString(fila: any, // fila actual a evaluar
    agendamientos: any[] // todo el dataset completo
  ): string {
    const dni = fila["DNI CLIENTE"];
    const marcaTemporalActual = fila["Marca temporal"]; // ya es string
    const motivoInteres = fila["MOTIVO INTERÉS"];

    if (motivoInteres !== "CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)") return "";

    // registros del mismo DNI con marca temporal posterior
    const posteriores = agendamientos.filter(a =>
      a["DNI CLIENTE"] === dni &&
      a["Marca temporal"] > marcaTemporalActual // alfabéticamente funciona con este formato
    );

    // 🔁 REAGENDADO
    const reagendado = posteriores.some(p =>
      p["RESULTADO DE GESTIÓN"] === "TERCERO RELACIONADO" ||
      p["MOTIVO INTERÉS"] === "CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)"
    );
    if (reagendado) return "REAGENDADO";

    // ☎️ ATENDIDO
    const atendido = posteriores.some(p =>
      [
        "NO INTERESADO", "NO ATENDIBLE",
        "VENTA DERIVADA PARA CIERRE A SEDE",
        "VISITARÁ TIENDA",
        "SE ENVIÓ A ASESOR VISITA A DOMICILIO"
      ].includes(p["RESULTADO DE GESTIÓN"] || p["MOTIVO INTERÉS"]) ||
      ["CONTACTO", "NO CONTACTO"].includes(p["ESTADO DE GESTIÓN"])
    );
    if (atendido) return "ATENDIDO";

    // 🟢 VIGENTE
    return "VIGENTE";
  }

  actualizar() {
    const fechaSeleccionada = this.formAgendamientos.value.fechaGestion;
    if (!fechaSeleccionada) return;

    const dia = fechaSeleccionada.getDate().toString().padStart(2, '0');
    const mes = (fechaSeleccionada.getMonth() + 1).toString().padStart(2, '0');
    const anio = fechaSeleccionada.getFullYear();
    const fechaSeleccionadaFormateada = `${dia}/${mes}/${anio}`;

    // Filtrar solo registros de la fecha seleccionada por FECHA DE INTERÉS
    const agendamientosDelDia = this.datosOriginales.filter((d: any) => {
      const fechaInteres = d['FECHA DE INTERÉS'];
      if (!fechaInteres) return false;
      return fechaInteres.trim() === fechaSeleccionadaFormateada;
    });

    this.datosFiltrados = agendamientosDelDia.map(fila => ({
      ...fila,
      estadoAgendamiento: this.evaluarEstadoString(fila, agendamientosDelDia)
    }));

    console.log('Filtrados con estado:', this.datosFiltrados);
  }

  getComentarioAdicionalUnido = (d: any): string => {
    const comentarios = Object.keys(d)
      .filter(key => key.toUpperCase().startsWith('COMENTARIO ADICIONAL'))
      .map(key => d[key])
      .filter(valor => valor && valor.trim() !== '');
    return comentarios.join(' | ');
  };

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
