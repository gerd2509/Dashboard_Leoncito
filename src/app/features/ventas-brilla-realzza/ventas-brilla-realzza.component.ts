import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { ExcelExportService } from '../../services/excel/excel.service';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { DxDataGridComponent } from 'devextreme-angular';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-ventas-brilla-realzza',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './ventas-brilla-realzza.component.html',
  styleUrl: './ventas-brilla-realzza.component.css'
})
export class VentasBrillaRealzzaComponent implements OnInit {
  protected excelService = inject(ExcelExportService);

  form: UntypedFormGroup;

  dataVentas: any[] = [];
  filtroVentas: any[] = [];

  protected showFilterRow: boolean = true;
  protected currentFilter: string = 'auto';

  totalesPorMesPorcentajeRealzza: any[] = [];
  totalesPorMesMontosRealzza: any[] = [];
  totalesPorMesMontosRealzzaCP: any[] = [];
  totalesPorMesMontosBrilla: any[] = [];

  cuotas: string[] = Array.from({ length: 13 }, (_, i) => i.toString()); // "0" a "12"

  @ViewChild(DxDataGridComponent, { static: false }) dataGrid!: DxDataGridComponent;

  constructor(private fb: UntypedFormBuilder) {
    this.form = this.fb.group({
      fechaInicio: [null, Validators.required],
      fechaFin: [null, Validators.required],
    });
  }

  async ngOnInit() { }

  actualizarFiltros(): void {
    this.generarTotalesPorMesSoloRealzza();
    this.generarTotalesPorMesBrilla();
    this.generarTotalesPorMesRealzza();
  }

  generarTotalesPorMesSoloRealzza(): void {
    const fechaInicio = new Date(this.form.value.fechaInicio);
    const fechaFin = new Date(this.form.value.fechaFin);
    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(23, 59, 59, 999);

    const dataFiltrada = this.dataVentas.filter(venta => {
      const fecha = new Date(venta.FECHAVENTA);
      const estadoVenta = (venta.ESTADOVENTA || '').toString().trim().toUpperCase();
      const entidad = (venta.ENTIDAD || '').toString().trim().toUpperCase();
      return (
        venta.Sede === 'SEDE REALZZA STORE' &&
        estadoVenta !== 'NOTA DE CRÉDITO' &&
        entidad === 'LEONCITO' &&
        fecha >= fechaInicio &&
        fecha <= fechaFin
      );
    });

    const agrupadoPorMes: { [mes: string]: { [cuota: string]: number } } = {};

    dataFiltrada.forEach(venta => {
      const fecha = new Date(venta.FECHAVENTA);
      const mesKey = fecha.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }).replace(',', '');
      const cuota = venta.Cuotas?.toString() || '0';
      const monto = venta.MontoConsolidado || 0;

      if (!agrupadoPorMes[mesKey]) {
        agrupadoPorMes[mesKey] = {};
        this.cuotas.forEach(c => agrupadoPorMes[mesKey][c] = 0);
      }

      agrupadoPorMes[mesKey][cuota] += monto;
    });

    const montos: any[] = [];
    const porcentajes: any[] = [];

    Object.entries(agrupadoPorMes).forEach(([mes, valores]) => {
      const rowMontos: any = { Mes: mes };
      const rowPorcentaje: any = { Mes: mes };

      let totalMes = 0;
      this.cuotas.forEach(c => {
        const monto = valores[c] || 0;
        totalMes += monto;
        rowMontos[c] = monto;
      });
      rowMontos.Total = totalMes;

      let totalPorcentaje = 0;
      this.cuotas.forEach(c => {
        const monto = valores[c] || 0;
        const porcentaje = totalMes > 0 ? monto / totalMes : 0;
        rowPorcentaje[c] = porcentaje;
        totalPorcentaje += porcentaje;
      });
      rowPorcentaje.Total = totalPorcentaje;

      montos.push(rowMontos);
      porcentajes.push(rowPorcentaje);
    });

    // Ordenar cronológicamente por mes (asegura parsing correcto)
    const parseFecha = (mes: string) => {
      const partes = mes.split(' ');
      const mesNum = new Date(`${partes[0]} 1, 20${partes[1]}`).getTime();
      return mesNum;
    };

    montos.sort((a, b) => parseFecha(a.Mes) - parseFecha(b.Mes));
    porcentajes.sort((a, b) => parseFecha(a.Mes) - parseFecha(b.Mes));

    this.totalesPorMesMontosRealzza = montos;
    this.totalesPorMesPorcentajeRealzza = porcentajes;
  }

  generarTotalesPorMesRealzza(): void {
    const fechaInicio = new Date(this.form.value.fechaInicio);
    const fechaFin = new Date(this.form.value.fechaFin);
    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(23, 59, 59, 999);

    const dataFiltrada = this.dataVentas.filter(venta => {
      const fecha = new Date(venta.FECHAVENTA);
      const estadoVenta = (venta.ESTADOVENTA || '').toString().trim().toUpperCase();
      const entidad = (venta.ENTIDAD || '').toString().trim().toUpperCase();
      const sede = (venta.Sede || '').toString().trim().toUpperCase();

      return (
        sede === 'SEDE REALZZA STORE' &&
        estadoVenta !== 'NOTA DE CRÉDITO' &&
        entidad === 'LEONCITO' &&
        fecha >= fechaInicio &&
        fecha <= fechaFin
      );
    });

    const agrupadoPorMes: { [mes: string]: { Total: number, Contact: number, Piso: number } } = {};

    dataFiltrada.forEach(venta => {
      const fecha = new Date(venta.FECHAVENTA);
      const mesKey = fecha.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }).replace(',', '');
      const monto = venta.MontoConsolidado || 0;
      const asesor = (venta.ASESORVENTA || '').toString().trim().toUpperCase();

      if (!agrupadoPorMes[mesKey]) {
        agrupadoPorMes[mesKey] = { Total: 0, Contact: 0, Piso: 0 };
      }

      agrupadoPorMes[mesKey].Total += monto;

      if ( asesor === 'CC9' ||asesor === 'CC7' || asesor === 'CC1') {
        agrupadoPorMes[mesKey].Contact += monto;
      } else if (asesor === 'NAS') {
        agrupadoPorMes[mesKey].Piso += monto;
      }
    });

    const montos: any[] = Object.entries(agrupadoPorMes).map(([mes, valores]) => ({
      Mes: mes,
      Total: valores.Total,
      Contact: valores.Contact,
      Piso: valores.Piso
    }));

    const parseFecha = (mes: string) => {
      const [mesStr, anio] = mes.split(' ');
      return new Date(`${mesStr} 1, 20${anio}`).getTime();
    };

    montos.sort((a, b) => parseFecha(a.Mes) - parseFecha(b.Mes));

    this.totalesPorMesMontosRealzzaCP = montos;
  }

  generarTotalesPorMesBrilla(): void {
    const fechaInicio = new Date(this.form.value.fechaInicio);
    const fechaFin = new Date(this.form.value.fechaFin);
    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(23, 59, 59, 999);

    const dataFiltrada = this.dataVentas.filter(venta => {
      const fecha = new Date(venta.FECHAVENTA);
      const estadoVenta = (venta.ESTADOVENTA || '').toString().trim().toUpperCase();
      const entidad = (venta.ENTIDAD || '').toString().trim().toUpperCase();
      const sede = (venta.Sede || '').toString().trim().toUpperCase();

      return (
        (sede === 'SEDE LA VICTORIA' || sede === 'SEDE REALZZA STORE') &&
        estadoVenta !== 'NOTA DE CRÉDITO' &&
        entidad === 'BRILLA' &&
        fecha >= fechaInicio &&
        fecha <= fechaFin
      );
    });

    const agrupadoPorMes: { [mes: string]: { Total: number, Contact: number, Piso: number } } = {};

    dataFiltrada.forEach(venta => {
      const fecha = new Date(venta.FECHAVENTA);
      const mesKey = fecha.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }).replace(',', '');
      const monto = venta.MontoConsolidado || 0;
      const asesor = (venta.ASESORVENTA || '').toString().trim().toUpperCase();

      if (!agrupadoPorMes[mesKey]) {
        agrupadoPorMes[mesKey] = { Total: 0, Contact: 0, Piso: 0 };
      }

      agrupadoPorMes[mesKey].Total += monto;

      if (asesor === 'CC7') {
        agrupadoPorMes[mesKey].Contact += monto;
      } else if (asesor === 'NAS') {
        agrupadoPorMes[mesKey].Piso += monto;
      }
    });

    const montos: any[] = Object.entries(agrupadoPorMes).map(([mes, valores]) => ({
      Mes: mes,
      Total: valores.Total,
      Contact: valores.Contact,
      Piso: valores.Piso
    }));

    const parseFecha = (mes: string) => {
      const [mesStr, anio] = mes.split(' ');
      return new Date(`${mesStr} 1, 20${anio}`).getTime();
    };

    montos.sort((a, b) => parseFecha(a.Mes) - parseFecha(b.Mes));

    this.totalesPorMesMontosBrilla = montos;
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
        Sede: row['Sede'],
        Cuotas: Number(row['Cuotas']) || 0,
        MontoConsolidado: this.parseNumber(row['MontoConsolidado']),
        FECHAVENTA: this.getFechaJS(row['FECHAVENTA']),
        ESTADOVENTA: (row['EstadoVenta']),
        ENTIDAD: (row['Entidad']),
        ASESORVENTA: (row['AsesorVenta'])
      }));

      // Filtramos solo los datos válidos
      this.filtroVentas = [...this.dataVentas];
    };

    reader.readAsArrayBuffer(file);
  }

  parseNumber(value: any): number {
    return typeof value === 'string'
      ? Number(value.replace(',', '').replace(/[^0-9.]/g, '')) || 0
      : value || 0;
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

  customizeCurrencyText = function (cell: any): string {
    if (typeof cell.value === 'number') {
      return `S/. ${cell.value.toLocaleString('es-PE', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      })}`;
    }
    return '';
  };

  exportar() { }

  onCellPrepared(e: any) {
    if (e.rowType != 'header' || e.cellElement.classList.contains('dx-editor-cell')) return;
    e.cellElement.style.padding = "8px";
    e.cellElement.style.backgroundColor = "#293964";
    e.cellElement.style.color = "white";
    e.cellElement.style.textAlign = "center";
    e.cellElement.style.fontWeight = "bold !important";
    e.cellElement.style.textWrap = "wrap !important";
    e.cellElement.style.height = "auto !important";
    e.cellElement.style.borderWidth = "1.5px !important";
    e.cellElement.style.borderColor = "black !important";
  }
}
