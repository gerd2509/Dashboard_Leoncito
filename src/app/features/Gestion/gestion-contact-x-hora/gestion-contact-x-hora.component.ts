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

  // 🔄 Tabla y columnas dinámicas para exportación de Gestión
  tablaGestion: any[] = [];
  columnasGestion: Array<{ dataField: string; caption: string }> = [];

  @ViewChild(DxDataGridComponent, { static: false }) dataGrid!: DxDataGridComponent;
  @ViewChild('gridGestion', { static: false }) gridGestion!: DxDataGridComponent;

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
        const fecha = this.parseMarcaTemporal(texto);
        if (!fecha) return false;
        return fecha >= desde && fecha <= hasta;
      });

      if (asesor) {
        const asesorNombre = this.asesores.find(a => a.value === asesor)?.viewValue?.trim().toUpperCase();
        datosFiltrados = datosFiltrados.filter(item => {
          const asesorEnDato = (item['ASESOR CONTACT'] || '').toString().trim().toUpperCase();
          return asesorEnDato === (asesorNombre || '');
        });
      }

      if (this.filtroDerivacionActivo) {
        const motivosValidos = [
          'VENTA DERIVADA PARA CIERRE A SEDE',
          'VISITARÁ TIENDA',
          'SE ENVIÓ A ASESOR VISITA A DOMICILIO'
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
    this.aplicarFiltros();
  }

  async onAsesorChanged(event: any): Promise<void> {
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

  // =========================
  // Exportar “Gestión” DINÁMICO (meses según rango + STATUS)
  // =========================
  async exportarGestion(): Promise<void> {
    if (!this.dataFiltrada || this.dataFiltrada.length === 0) {
      console.warn('No hay datos filtrados para generar la tabla de Gestión.');
      return;
    }

    const fechaInicio: Date = this.formGestion.value.fechaInicio;
    const fechaFin: Date = this.formGestion.value.fechaFin;
    if (!fechaInicio || !fechaFin) {
      console.warn('Selecciona un rango de fechas válido.');
      return;
    }

    this.isLoading = true;
    try {
      // 1) Meses del rango (inclusive)
      const meses = this.obtenerMesesEntre(fechaInicio, fechaFin);
      // meses: [{ key:'2025-05', month:4, year:2025, caption:'MAYO' }, ...]

      // 2) Preparar columnas dinámicas: DNI + meses + STATUS
      this.columnasGestion = [
        { dataField: 'DNI', caption: 'DNI' },
        ...meses.map(m => ({ dataField: m.caption, caption: m.caption })),
        { dataField: 'STATUS', caption: 'STATUS' }
      ];

      // 3) Agrupar por DNI y mes (guardando la ÚLTIMA gestión del mes)
      type Celda = { fecha: Date; estado: string };
      const porDni: Record<string, Record<string, Celda>> = {};
      const mesesSet = new Set(meses.map(m => m.key));

      for (const item of this.dataFiltrada) {
        const dni = (item['DNI CLIENTE'] || '').toString().trim();
        if (!dni) continue;

        const texto = item['Marca temporal'];
        if (!texto) continue;

        const fecha = this.parseMarcaTemporal(texto);
        if (!fecha) continue;

        // clave año-mes
        const ymKey = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
        if (!mesesSet.has(ymKey)) continue; // Solo meses del rango

        const estado = (item['ESTADO DE GESTIÓN'] || '').toString().trim().toUpperCase();

        porDni[dni] ??= {};
        const actual = porDni[dni][ymKey];
        // Guardamos solo la última gestión del mes
        if (!actual || fecha > actual.fecha) {
          porDni[dni][ymKey] = { fecha, estado };
        }
      }

      // 4) Construir filas: una por DNI
      const resultado: any[] = [];
      for (const dni of Object.keys(porDni)) {
        const row: any = { DNI: dni };

        // Inicializa celdas de meses en blanco
        for (const m of meses) row[m.caption] = '';

        // Completa cada mes con la última gestión
        for (const m of meses) {
          const celda = porDni[dni][m.key];
          if (celda) row[m.caption] = celda.estado; // último ESTADO DE GESTIÓN del mes
        }

        // 5) Calcular STATUS con la lógica final
        const valoresMes = meses
          .map(m => (row[m.caption] || '').toString().toUpperCase().trim())
          .filter(v => v !== '');

        const total = valoresMes.length;
        const tieneContacto = valoresMes.includes('CONTACTO');
        const todosNoContacto = (total > 0) && valoresMes.every(v => v === 'NO CONTACTO');

        let status = '';
        if (total === 0) {
          status = ''; // sin gestiones en el rango
        } else if (total === 1) {
          // Una sola gestión total
          status = (valoresMes[0] === 'NO CONTACTO') ? 'PISO' : 'CALL';
        } else {
          // Varias gestiones
          if (tieneContacto) {
            status = 'CALL';
          } else if (todosNoContacto) {
            status = 'PISO';
          } else {
            // Cualquier otro caso (mezclas no estándar) lo tratamos como CALL
            status = 'CALL';
          }
        }

        row['STATUS'] = status;
        resultado.push(row);
      }

      // 6) Ordenar por DNI (opcional)
      resultado.sort((a, b) => a.DNI.localeCompare(b.DNI, 'es'));

      // 7) Asignar data y exportar
      this.tablaGestion = resultado;

      setTimeout(() => {
        if (this.gridGestion) {
          this.excelService.exportarDesdeGrid(this.tituloArchivoGestion(meses), this.gridGestion);
        } else {
          console.error('No se encontró la referencia del grid de Gestión para exportar.');
        }
      }, 0);
    } catch (err) {
      console.error('Error generando la tabla de Gestión:', err);
    } finally {
      this.isLoading = false;
    }
  }

  // =========================
  // Helpers
  // =========================

  // Genera meses entre dos fechas (inclusive) en orden
  private obtenerMesesEntre(desde: Date, hasta: Date): Array<{ key: string; month: number; year: number; caption: string }> {
    const MESES_ES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

    const start = new Date(desde.getFullYear(), desde.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(hasta.getFullYear(), hasta.getMonth(), 1, 0, 0, 0, 0);

    const meses: Array<{ key: string; month: number; year: number; caption: string }> = [];
    const sameYear = start.getFullYear() === end.getFullYear();

    let y = start.getFullYear();
    let m = start.getMonth();

    while (y < end.getFullYear() || (y === end.getFullYear() && m <= end.getMonth())) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}`;
      const baseCaption = MESES_ES[m];
      // Si el rango cruza años, añade el año al caption (p.ej., "ENERO 2025")
      const caption = sameYear ? baseCaption : `${baseCaption} ${y}`;

      meses.push({ key, month: m, year: y, caption });
      m++;
      if (m > 11) { m = 0; y++; }
    }

    return meses;
  }

  private tituloArchivoGestion(meses: Array<{ caption: string }>): string {
    if (!meses.length) return 'Gestion';
    const primero = meses[0].caption.replace(/\s+/g, '');
    const ultimo = meses[meses.length - 1].caption.replace(/\s+/g, '');
    return `Gestion_${primero}_${ultimo}`;
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
}
