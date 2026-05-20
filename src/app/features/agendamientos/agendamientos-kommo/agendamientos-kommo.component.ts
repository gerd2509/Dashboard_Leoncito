import { Component, inject, ViewChild } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../../common_imports';
import { DX_COMMON_MODULES } from '../../dx_common_modules';
import { lastValueFrom } from 'rxjs';
import { SheetsService } from '../../../services/service-google.service';
import { ExcelExportService } from '../../../services/excel/excel.service';
import { UntypedFormBuilder, UntypedFormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { DxDataGridComponent } from 'devextreme-angular/ui/data-grid';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-agendamientos-kommo',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ...SHARED_MATERIAL_IMPORTS,
    ...DX_COMMON_MODULES
  ],
  templateUrl: './agendamientos-kommo.component.html',
  styleUrl: './agendamientos-kommo.component.css'
})
export class AgendamientosKommoComponent {
  protected service = inject(SheetsService);
  protected excelService = inject(ExcelExportService);

  @ViewChild(DxDataGridComponent, { static: false }) dataGrid!: DxDataGridComponent;

  formAgendamientos: UntypedFormGroup;
  datosFiltrados: any[] = [];
  datosOriginales: any[] = [];
  isLoading = false;

  private readonly COL_MAP: any = {
    'LEONCITO': {
      dni: 'DNI CLIENTE',
      asesor: 'ASESOR CONTACT',
      celular: 'CELULAR GESTIONADO',
      estado: 'ESTADO DE GESTIÓN',
      resultado: 'RESULTADO DE GESTIÓN'
    },
    'REALZZA': {
      dni: 'DNI CLIENTE REALZZA',
      asesor: 'ASESOR REALZZA',
      celular: 'CELULAR GESTIONADO REALZZA',
      estado: 'ESTADO DE GESTIÓN REALZZA',
      resultado: 'RESULTADO DE GESTIÓN'
    }
  };

  constructor(private fb: UntypedFormBuilder) {
    this.formAgendamientos = this.fb.group({
      fechaGestion: [new Date(), Validators.required],
      empresa: ['LEONCITO', Validators.required]
    });
  }

  get currentCols() {
    const emp = this.formAgendamientos.get('empresa')?.value || 'LEONCITO';
    return this.COL_MAP[emp];
  }

  // --- Limpieza al cambiar empresa ---
  onEmpresaChanged() {
    this.datosFiltrados = []; // Limpia la data de la grilla inmediatamente
    if (this.dataGrid?.instance) {
      this.dataGrid.instance.refresh(); // Refresca para actualizar encabezados
    }
  }

  // --- Funciones de extracción ---
  obtenerAsesor = (data: any) => data[this.currentCols.asesor] || '';
  obtenerDni = (data: any) => data[this.currentCols.dni] || '';
  obtenerCelular = (data: any) => data[this.currentCols.celular] || '';
  soloFecha = (d: any) => d['Marca temporal']?.split(' ')[0] ?? '';

  getComentarioAdicionalUnido = (d: any): string => {
    return Object.keys(d)
      .filter(key => key.toUpperCase().startsWith('COMENTARIO ADICIONAL AGENDAMIENTO'))
      .map(key => d[key])
      .filter(valor => valor && valor.trim() !== '')
      .join(' | ');
  };

  async actualizar() {
    const { fechaGestion } = this.formAgendamientos.value;
    if (!fechaGestion) return;

    this.isLoading = true;
    try {
      this.datosOriginales = await lastValueFrom(this.service.getSheetData());

      const dia = fechaGestion.getDate().toString().padStart(2, '0');
      const mes = (fechaGestion.getMonth() + 1).toString().padStart(2, '0');
      const anio = fechaGestion.getFullYear();
      const fechaBusqueda = `${dia}/${mes}/${anio}`;

      const agendamientosDelDia = this.datosOriginales.filter((d: any) => {
        const fechaRaw = (d['FECHA DE INTERÉS AGENDAMIENTO'] || '').trim();
        const [dDia, dMes, dAnio] = fechaRaw.split('/');
        if (!dDia || !dMes || !dAnio) return false;

        const fechaFormateada = `${dDia.padStart(2, '0')}/${dMes.padStart(2, '0')}/${dAnio}`;
        const motivo = (d['MOTIVO INTERÉS'] || '').trim().toUpperCase();

        return fechaFormateada === fechaBusqueda &&
          motivo === "CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)";
      });

      this.datosFiltrados = agendamientosDelDia.map(fila => ({
        ...fila,
        estadoAgendamiento: this.evaluarEstadoString(fila, this.datosOriginales)
      }));

    } catch (error) {
      console.error('Error:', error);
    } finally {
      this.isLoading = false;
    }
  }

  evaluarEstadoString(fila: any, agendamientos: any[]): string {
    const cols = this.currentCols;
    const dni = fila[cols.dni];
    const marcaTemporalActualStr = fila["Marca temporal"];
    if (!marcaTemporalActualStr) return "";

    const marcaTemporalActual = this.parseFecha(marcaTemporalActualStr);
    if (!marcaTemporalActual) return "";

    const posteriores = agendamientos.filter(p => {
      const mt = this.parseFecha(p["Marca temporal"]);
      return p[cols.dni] === dni && mt && mt > marcaTemporalActual;
    });

    const reagendado = posteriores.some(p =>
      (p[cols.resultado]?.toUpperCase().trim() === "TERCERO RELACIONADO") ||
      (p["MOTIVO INTERÉS"]?.toUpperCase().trim() === "CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)")
    );
    if (reagendado) return "REAGENDADO";

    const resultadosAtendido = ["VENTA DERIVADA PARA CIERRE A SEDE", "VISITARÁ TIENDA", "SE ENVIÓ A ASESOR VISITA A DOMICILIO", "NO INTERESADO", "NO ATENDIBLE"];
    const estadosAtendido = ["CONTACTO", "NO CONTACTO"];

    const atendido = posteriores.some(p => {
      const res = (p[cols.resultado] || "").toUpperCase().trim();
      const est = (p[cols.estado] || "").toUpperCase().trim();
      return resultadosAtendido.includes(res) || estadosAtendido.includes(est);
    });

    return atendido ? "ATENDIDO" : "VIGENTE";
  }

  parseFecha(fechaStr: string): Date | null {
    if (!fechaStr) return null;
    const partes = fechaStr.split(' ');
    const [dia, mes, anio] = partes[0].split('/').map(Number);
    const [hora, min, seg] = partes[1]?.split(':').map(Number) || [0, 0, 0];
    return new Date(anio, mes - 1, dia, hora, min, seg);
  }

  exportar(): void {
    if (this.dataGrid) {
      this.excelService.exportarDesdeGrid(`Agendamientos_${this.formAgendamientos.value.empresa}`, this.dataGrid);
    }
  }

  onCellPrepared(e: any) {
    if (e.rowType === 'header') {
      e.cellElement.style.backgroundColor = "#293964";
      e.cellElement.style.color = "white";
      e.cellElement.style.textAlign = "center";
      e.cellElement.style.fontWeight = "bold";
    }

    if (e.rowType === 'data' && e.column.dataField === 'estadoAgendamiento') {
      const colores: any = { 'ATENDIDO': '#c8e6c9', 'REAGENDADO': '#fff9c4', 'VIGENTE': '#ffcdd2' };
      if (colores[e.value]) {
        e.cellElement.style.backgroundColor = colores[e.value];
        e.cellElement.style.fontWeight = 'bold';
      }
    }
  }
}