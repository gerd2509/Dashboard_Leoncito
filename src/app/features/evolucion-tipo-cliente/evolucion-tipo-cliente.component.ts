import { Component, inject, OnInit } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { ExcelExportService } from '../../services/excel/excel.service';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-evolucion-tipo-cliente',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './evolucion-tipo-cliente.component.html',
  styleUrl: './evolucion-tipo-cliente.component.css'
})
export class EvolucionTipoClienteComponent implements OnInit {
  protected excelService = inject(ExcelExportService);

  formComparativo: UntypedFormGroup;

  dataVentas: any[] = [];
  filtroVentas: any[] = [];
  chartData: any[] = [];

  verPorTipo: boolean = true;
  tiposUnicos: string[] = [];
  vistaSeparada: boolean = false;

  colores: string[] = [
    '#1E88E5', '#E53935', '#43A047', '#FB8C00', '#8E24AA',
    '#00ACC1', '#3949AB', '#D81B60', '#FDD835', '#546E7A'
  ];

  constructor(private fb: UntypedFormBuilder) {
    this.formComparativo = this.fb.group({
      fechaInicio: [null, Validators.required],
      fechaFin: [null, Validators.required],
      Asesores: ['']
    });
    // Bindeo para contexto
    this.formatearMoneda = this.formatearMoneda.bind(this);
  }

  ngOnInit(): void {
    // Inicializar el componente
  }

  importar(event: any): void {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: any) => {
      const data = new Uint8Array(e.target.result);
      const workbook: XLSX.WorkBook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      this.dataVentas = jsonData.map((row: any) => ({
        IDVENTA: row['IDVENTA'],
        FECHAVENTA: this.getFechaJS(row['FECHAVENTA']),
        Sede: row['Sede'],
        MontoConsolidado: this.parseNumber(row['MontoConsolidado']),
        CuotaInicial: this.parseNumber(row['CuotaInicial']),
        // ... otros campos
        TipoCliente: row['TipoCliente'],
      }));

      this.filtroVentas = [...this.dataVentas];
      // Procesar data al cargar si es necesario, o esperar al botón
      // this.actualizarFiltros(); 
    };
    reader.readAsArrayBuffer(file);
  }

  // Método principal para generar la data del gráfico
  actualizarFiltros(): void {
    const { fechaInicio, fechaFin } = this.formComparativo.value;
    let datosFiltrados = this.dataVentas;

    // 1. Filtro de Fechas
    if (fechaInicio && fechaFin) {
      datosFiltrados = datosFiltrados.filter(d =>
        d.FECHAVENTA >= fechaInicio && d.FECHAVENTA <= fechaFin
      );
    }

    const agrupado: any = {};
    const setTipos = new Set<string>();

    datosFiltrados.forEach(item => {
      // Normalizar al día 1 del mes
      const fechaMes = new Date(item.FECHAVENTA.getFullYear(), item.FECHAVENTA.getMonth(), 1);
      const fechaTime = fechaMes.getTime();

      // --- Lógica de Fusión DORMIDO / NO VIGENTE ---
      let tipoOriginal = item.TipoCliente || 'SIN TIPO';
      const tipoCheck = String(tipoOriginal).toUpperCase().trim();
      let tipoReal = tipoOriginal;

      if (tipoCheck === 'DORMIDO' || tipoCheck === 'NO VIGENTE') {
        tipoReal = 'DORMIDO / NO VIGENTE';
      }
      // --------------------------------------------

      setTipos.add(tipoReal);

      const key = `${fechaTime}_${tipoReal}`;

      if (!agrupado[key]) {
        agrupado[key] = {
          fecha: fechaMes,
          tipo: tipoReal,
          monto: 0
        };
      }
      agrupado[key].monto += item.MontoConsolidado;
    });

    // Guardar datos para el gráfico
    this.chartData = Object.values(agrupado).sort((a: any, b: any) => a.fecha - b.fecha);
    this.tiposUnicos = Array.from(setTipos).sort();

    // =========================================================================
    // INICIO ZONA DE DEPURACIÓN (CONSOLE TABLE)
    // =========================================================================

    // Filtramos solo para ver lo que te interesa (o quita el filter para ver todo)
    // Creamos una vista limpia para la consola
    const debugView = this.chartData.map((d: any) => ({
      Fecha: d.fecha.toLocaleDateString('es-PE', { year: 'numeric', month: 'long' }), // Ej: "septiembre 2025"
      TipoCliente: d.tipo,
      Monto: d.monto.toLocaleString('es-PE', { style: 'currency', currency: 'PEN' }), // Formato S/.
      MontoPuro: d.monto // Para ver si es 0 o null
    }));

    console.group("🔍 DATOS PROCESADOS PARA EL GRÁFICO");
    console.log(`Total registros generados: ${debugView.length}`);

    // ESTO MOSTRARÁ LA TABLA ORDENADA
    console.table(debugView);

    // Verificación específica para REENGANCHE (si existe)
    const reengancheData = debugView.filter(d => d.TipoCliente.toUpperCase().includes('REENGANCHE'));
    if (reengancheData.length > 0) {
      console.log("⚠️ FILTRADO SOLO REENGANCHE:", reengancheData);
    } else {
      console.warn("⚠️ ALERTA: No se encontraron datos para 'REENGANCHE' en este rango de fechas.");
    }

    console.groupEnd();
    // =========================================================================
  }

  getDataPorTipo(tipo: string): any[] {
    return this.chartData.filter(d => d.tipo === tipo);
  }

  formatearMoneda(arg: any) {
    return 'S/. ' + arg.valueText;
  }

  getFechaJS(excelDate: any): Date {
    if (typeof excelDate === 'number') {
      const utc_days = Math.floor(excelDate - 25569);
      const utc_value = utc_days * 86400 * 1000;
      const date_info = new Date(utc_value);
      return new Date(date_info.getUTCFullYear(), date_info.getUTCMonth(), date_info.getUTCDate());
    }
    const parsed = new Date(excelDate);
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  parseNumber(value: any): number {
    return typeof value === 'string'
      ? Number(value.replace(',', '').replace(/[^0-9.]/g, '')) || 0
      : value || 0;
  }

  customizeTooltip(arg: any) {
    return {
      text: arg.seriesName + ': S/. ' + arg.valueText
    };
  }
}