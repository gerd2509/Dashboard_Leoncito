import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { ExcelExportService } from '../../services/excel/excel.service';
import { DxDataGridComponent } from 'devextreme-angular';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-ventas-cuotas-tipo-venta',
  standalone: true,
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './ventas-cuotas-tipo-venta.component.html',
  styleUrl: './ventas-cuotas-tipo-venta.component.css'
})
export class VentasCuotasTipoVentaComponent implements OnInit {
  protected excelService = inject(ExcelExportService);

  form: UntypedFormGroup;

  dataVentas: any[] = [];
  filtroVentas: any[] = [];

  filtroVentasPorcentaje: any[] = [];
  filtroVentasMontos: any[] = [];
  resumenTipoVenta: any[] = [];

  totalesPorMesMontos: any[] = [];
  totalesPorMesPorcentaje: any[] = [];

  tiposDeVenta: string[] = []; // ← dinámico desde Excel
  cuotas: string[] = Array.from({ length: 13 }, (_, i) => i.toString());

  protected showFilterRow: boolean = true;
  protected currentFilter: string = 'auto';

  @ViewChild(DxDataGridComponent, { static: false }) dataGrid!: DxDataGridComponent;

  constructor(private fb: UntypedFormBuilder) {
    this.form = this.fb.group({
      fechaInicio: [null, Validators.required],
      fechaFin: [null, Validators.required],
      REALZZA: [false]
    });
  }

  ngOnInit() { }

  actualizarFiltros(): void {
    this.generarMontosPorCuota();
    this.generarPorcentajePorCuota();
    this.generarTotalesPorMes();
    this.generarResumenPorTipoVenta(); // ← NUEVA
  }

  importar(event: any): void {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e: any) => {
      const data = new Uint8Array(e.target.result);
      const workbook: XLSX.WorkBook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      this.dataVentas = jsonData.map((row: any) => ({
        Sede: row['Sede'],
        Cuotas: Number(row['Cuotas']) || 0,
        MontoConsolidado: this.parseNumber(row['MontoConsolidado']),
        FECHAVENTA: this.getFechaJS(row['FECHAVENTA']),
        EstadoVenta: row['EstadoVenta'],
        TipoVenta: row['TipoVenta']
      }));

      this.filtroVentas = [...this.dataVentas];

      // Extraer tipos únicos dinámicamente
      this.tiposDeVenta = [...new Set(this.dataVentas.map(v => v.TipoVenta).filter(Boolean))];
    };

    reader.readAsArrayBuffer(file);
  }

  generarMontosPorCuota(): void {
    const fechaInicio = new Date(this.form.value.fechaInicio);
    const fechaFin = new Date(this.form.value.fechaFin);
    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(23, 59, 59, 999);

    const filtradas = this.dataVentas.filter(v => {
      const fecha = new Date(v.FECHAVENTA);
      return fecha >= fechaInicio && fecha <= fechaFin;
    });

    const agrupado: { [sede: string]: { [cuota: string]: number } } = {};

    filtradas.forEach(venta => {
      const sede = venta.Sede || 'Sin Sede';
      const cuota = venta.Cuotas?.toString() || '0';
      const monto = venta.MontoConsolidado || 0;

      if (!agrupado[sede]) {
        agrupado[sede] = {};
        this.cuotas.forEach(c => agrupado[sede][c] = 0);
      }

      agrupado[sede][cuota] += monto;
    });

    this.filtroVentasMontos = Object.entries(agrupado).map(([sede, valores]) => {
      const row: any = { Sede: sede };
      let total = 0;
      this.cuotas.forEach(cuota => {
        const monto = valores[cuota] || 0;
        total += monto;
        row[cuota] = monto;
      });
      row.Total = total;
      return row;
    });
  }

  generarPorcentajePorCuota(): void {
    let totalGlobal = 0;
    this.filtroVentasMontos.forEach(sede => {
      this.cuotas.forEach(cuota => {
        totalGlobal += sede[cuota] || 0;
      });
    });

    this.filtroVentasPorcentaje = this.filtroVentasMontos.map(sede => {
      const row: any = { Sede: sede.Sede };
      let totalPorcentaje = 0;
      this.cuotas.forEach(cuota => {
        const monto = sede[cuota] || 0;
        const porcentaje = totalGlobal > 0 ? monto / totalGlobal : 0;
        row[cuota] = porcentaje;
        totalPorcentaje += porcentaje;
      });
      row.Total = totalPorcentaje;
      return row;
    });
  }

  generarTotalesPorMes(): void {
    const fechaInicio = new Date(this.form.value.fechaInicio);
    const fechaFin = new Date(this.form.value.fechaFin);
    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(23, 59, 59, 999);
    const filtrarRealzza = this.form.value.REALZZA === true;

    const agrupadoPorMes: { [mes: string]: { [cuota: string]: number } } = {};

    this.dataVentas.forEach(venta => {
      const fecha = new Date(venta.FECHAVENTA);
      const dentroDeRango = fecha >= fechaInicio && fecha <= fechaFin;
      const noEsRealzza = filtrarRealzza ? venta.Sede !== 'SEDE REALZZA STORE' : true;
      if (!dentroDeRango || !noEsRealzza) return;

      const mesKey = fecha.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }).replace(',', '');
      const cuota = venta.Cuotas?.toString() || '0';
      const monto = venta.MontoConsolidado || 0;

      if (!agrupadoPorMes[mesKey]) {
        agrupadoPorMes[mesKey] = {};
        this.cuotas.forEach(c => agrupadoPorMes[mesKey][c] = 0);
      }

      agrupadoPorMes[mesKey][cuota] += monto;
    });

    this.totalesPorMesMontos = [];
    this.totalesPorMesPorcentaje = [];

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
        totalPorcentaje += porcentaje;
        rowPorcentaje[c] = porcentaje;
      });

      rowPorcentaje.Total = totalPorcentaje;

      this.totalesPorMesMontos.push(rowMontos);
      this.totalesPorMesPorcentaje.push(rowPorcentaje);
    });

    this.totalesPorMesMontos.sort((a, b) => new Date(`01-${a.Mes}`).getTime() - new Date(`01-${b.Mes}`).getTime());
    this.totalesPorMesPorcentaje.sort((a, b) => new Date(`01-${a.Mes}`).getTime() - new Date(`01-${b.Mes}`).getTime());
  }

  generarResumenPorTipoVenta(): void {
    const fechaInicio = new Date(this.form.value.fechaInicio);
    const fechaFin = new Date(this.form.value.fechaFin);
    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(23, 59, 59, 999);

    const tipos = this.tiposDeVenta;
    const resumenMap: { [sede: string]: { [tipo: string]: number } } = {};

    const filtradas = this.dataVentas.filter(v => {
      const fecha = new Date(v.FECHAVENTA);
      const dentroDeRango = fecha >= fechaInicio && fecha <= fechaFin;
      const noEsNotaCredito = v.EstadoVenta !== 'NOTA DE CRÉDITO';
      return dentroDeRango && noEsNotaCredito;
    });

    filtradas.forEach(v => {
      const sede = v.Sede || 'Sin Sede';
      const tipo = v.TipoVenta || 'Otros';
      const monto = v.MontoConsolidado || 0;

      if (!resumenMap[sede]) {
        resumenMap[sede] = {};
        tipos.forEach(t => resumenMap[sede][t] = 0);
      }

      if (!resumenMap[sede][tipo]) resumenMap[sede][tipo] = 0;
      resumenMap[sede][tipo] += monto;
    });

    this.resumenTipoVenta = Object.entries(resumenMap).map(([sede, valores]) => {
      const fila: any = { Sede: sede };
      let total = 0;

      tipos.forEach(tipo => {
        fila[tipo] = valores[tipo] || 0;
        total += fila[tipo];
      });

      fila.Total = total;
      return fila;
    });
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
      return `S/ ${cell.value.toLocaleString('es-PE', {
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
    e.cellElement.style.fontWeight = "bold";
  }
}
