import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { ExcelExportService } from '../../services/excel/excel.service';
import { DxDataGridComponent } from 'devextreme-angular';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-venta-x-plazo-av',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './venta-x-plazo-av.component.html',
  styleUrl: './venta-x-plazo-av.component.css'
})
export class VentaXPlazoAvComponent implements OnInit {
  protected excelService = inject(ExcelExportService);

  form: UntypedFormGroup;

  dataVentas: any[] = [];
  filtroVentas: any[] = [];

  cuotas: string[] = Array.from({ length: 13 }, (_, i) => i.toString());

  ventasPorCuotaAcumulada: any[] = [];
  ventasPorCuotaOchoADoce: any[] = [];
  ventasPorCuota8: any[] = [];

  protected showFilterRow: boolean = true;
  protected currentFilter: string = 'auto';

  @ViewChild(DxDataGridComponent, { static: false }) dataGrid!: DxDataGridComponent;

  constructor(private fb: UntypedFormBuilder) {
    this.form = this.fb.group({
      fechaInicio: [null, Validators.required],
      fechaFin: [null, Validators.required]
    });
  }

  ngOnInit() { }

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
        AsesorVenta: row['AsesorVenta'] || 'Sin Asesor', // Verifica el nombre exacto en el Excel
        Cuotas: Number(row['Cuotas']) || 0,
        FECHAVENTA: this.getFechaJS(row['FECHAVENTA']) // Conversión segura de fecha
      }));

      // Opcional: reiniciar filtro al importar
      this.filtroVentas = [];
    };

    reader.readAsArrayBuffer(file);
  }

  generarTotalesPorAsesor(): void {
    const fechaInicio = new Date(this.form.value.fechaInicio);
    const fechaFin = new Date(this.form.value.fechaFin);
    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(23, 59, 59, 999);

    const resumenMap = new Map<string, any>();

    this.dataVentas.forEach(venta => {
      const fechaVenta = new Date(venta.FECHAVENTA);

      // Validar rango de fechas
      if (fechaVenta < fechaInicio || fechaVenta > fechaFin) return;

      const asesor = venta.AsesorVenta?.trim() || 'Sin Asesor';
      const cuota = Number(venta.Cuotas);

      // Asegurar que la cuota esté entre 0 y 12
      if (isNaN(cuota) || cuota < 0 || cuota > 12) return;

      // Si asesor no está en el mapa, lo inicializamos
      if (!resumenMap.has(asesor)) {
        const nuevoAsesor: any = { AsesorVenta: asesor, TotalVentas: 0 };
        this.cuotas.forEach(c => (nuevoAsesor[c] = 0));
        resumenMap.set(asesor, nuevoAsesor);
      }

      // Incrementamos el conteo en la cuota correspondiente
      const resumen = resumenMap.get(asesor);
      resumen[cuota]++;
      resumen.TotalVentas++;
    });

    // Convertimos a arreglo para el grid
    this.filtroVentas = Array.from(resumenMap.values());
  }

  generarTotalesPorCuotasMenorIgualSiete(): void {
    const asesores = [...new Set(this.filtroVentas.map(item => item.AsesorVenta))];

    this.ventasPorCuotaAcumulada = asesores.map(asesor => {
      const ventasAsesor = this.filtroVentas.find(item => item.AsesorVenta === asesor);

      // Suma los valores de las cuotas 1 a 7 directamente
      let totalCuotas = 0;
      for (let i = 0; i <= 7; i++) {
        const valor = ventasAsesor[i];
        if (!isNaN(valor)) totalCuotas += valor;
      }

      return {
        AsesorVenta: asesor,
        CuotaMenorIgualSiete: totalCuotas
      };
    });
  }

  generarTotalesPorCuotasEntreNueveYDoce(): void {
    const asesores = [...new Set(this.filtroVentas.map(item => item.AsesorVenta))];

    this.ventasPorCuotaOchoADoce = asesores.map(asesor => {
      const ventasAsesor = this.filtroVentas.find(item => item.AsesorVenta === asesor);

      let totalCuotas = 0;
      for (let i = 9; i <= 12; i++) {
        const valor = ventasAsesor[i];
        if (!isNaN(valor)) totalCuotas += valor;
      }

      return {
        AsesorVenta: asesor,
        CuotaOchoADoce: totalCuotas
      };
    });
  }

  generarTotalesPorCuota8(): void {
    const asesores = [...new Set(this.filtroVentas.map(item => item.AsesorVenta))];

    this.ventasPorCuota8 = asesores.map(asesor => {
      const ventasAsesor = this.filtroVentas.find(item => item.AsesorVenta === asesor);

      const totalCuotas = !isNaN(ventasAsesor[8]) ? ventasAsesor[8] : 0;

      return {
        AsesorVenta: asesor,
        CuotaOcho: totalCuotas
      };
    });
  }

  actualizarFiltros(): void {
    this.generarTotalesPorAsesor();
    this.generarTotalesPorCuotasMenorIgualSiete();
    this.generarTotalesPorCuotasEntreNueveYDoce();
    this.generarTotalesPorCuota8();
  }

  exportar() { }

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

  onCellPrepared(e: any) {
    if (e.rowType != 'header' || e.cellElement.classList.contains('dx-editor-cell')) return;
    e.cellElement.style.padding = "8px";
    e.cellElement.style.backgroundColor = "#293964";
    e.cellElement.style.color = "white";
    e.cellElement.style.textAlign = "center";
    e.cellElement.style.fontWeight = "bold";
  }
}
