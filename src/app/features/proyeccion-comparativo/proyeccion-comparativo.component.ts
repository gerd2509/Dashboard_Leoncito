import { Component, OnInit } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-proyeccion-comparativo',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './proyeccion-comparativo.component.html',
  styleUrl: './proyeccion-comparativo.component.css'
})
export class ProyeccionComparativoComponent implements OnInit {
  form: UntypedFormGroup;

  dataVentas: any[] = [];
  dataOriginal: any[] = [];
  filtroVentas: any[] = [];
  resumenPorSede: any[] = [];
  ventasPorTipoBase: any[] = [];

  asesoresMeta = [
    { id: 'CC1', nombre: 'MORETO DELGADO PATRICIA ESTEFANY', meta: 60000 },
    { id: 'CC3', nombre: 'UCHOFEN VIGO FELICITA', meta: 60000 },
    { id: 'CC5', nombre: 'QUISPE FONSECA KAREN AIMEE', meta: 70000 },
    { id: 'CC6', nombre: 'MORALES ÑIQUE MARIA CANDELARIA', meta: 60000 },
    { id: 'CC7', nombre: 'ACOSTA JIMENEZ MARIELA NATALY', meta: 30000 },
    { id: 'CC8', nombre: 'CHANTA CAMPOS KELLY KARINTIA', meta: 60000 },
    { id: 'CC9', nombre: 'PÉREZ TINEO MARICIELO TATIANA', meta: 20000 }
  ];

  tablaBonos = [
    { monto: 100000, bono: 1500 }, { monto: 95000, bono: 1400 }, { monto: 90000, bono: 1300 },
    { monto: 85000, bono: 1200 }, { monto: 80000, bono: 1100 }, { monto: 75000, bono: 1000 },
    { monto: 70000, bono: 900 }, { monto: 65000, bono: 800 }, { monto: 60000, bono: 700 },
    { monto: 55000, bono: 600 }, { monto: 50000, bono: 500 }, { monto: 45000, bono: 400 },
    { monto: 40000, bono: 300 }, { monto: 35000, bono: 200 }, { monto: 30000, bono: 150 },
    { monto: 25000, bono: 100 }, { monto: 20000, bono: 75 }, { monto: 15000, bono: 50 }
  ];

  asesores = this.asesoresMeta.map(a => ({ value: a.id, viewValue: a.nombre }));

  constructor(private fb: UntypedFormBuilder) {
    this.form = this.fb.group({
      fechaInicio: [null, Validators.required],
      fechaFin: [null, Validators.required],
      Asesores: ['']
    });
  }

  async ngOnInit() { }

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

      this.dataOriginal = jsonData
        .map((row: any) => ({
          IDVENTA: row['IDVENTA'],
          FECHAVENTA: this.getFechaJS(row['FECHAVENTA']),
          Sede: row['Sede'],
          MontoConsolidado: this.parseNumber(row['MontoConsolidado']),
          CuotaInicial: this.parseNumber(row['CuotaInicial']),
          Productos: row['Productos'],
          Cuotas: row['Cuotas'],
          DocIdentidad: row['DocIdentidad'],
          TipoVenta: row['TipoVenta'],
          TipoBase: (row['TipoBase'] || '').toString().trim().toUpperCase(),
          AsesorVenta: (row['AsesorVenta'] || '').toString().trim().toUpperCase(),
          EstadoVenta: row['EstadoVenta']
        }))
        .filter(venta => venta.AsesorVenta !== 'NAS');

      this.aplicarFiltros();
      this.generarResumenPorAsesor();
      this.generarResumenPorSede();
      this.generarVentasPorTipoBase();
    };

    reader.readAsArrayBuffer(file);
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

  actualizarFiltros(): void {
    if (this.form.valid) {
      this.aplicarFiltros();
      this.generarResumenPorAsesor();
      this.generarResumenPorSede();
      this.generarVentasPorTipoBase();
    }
  }

  aplicarFiltros(): void {
    const selectedAsesor = (this.form.value.Asesores || '').toString().trim().toUpperCase();

    const fechaInicio = new Date(this.form.value.fechaInicio);
    const fechaFin = new Date(this.form.value.fechaFin);
    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(23, 59, 59, 999);

    this.dataVentas = this.dataOriginal.filter(venta => {
      const fechaVenta = new Date(venta.FECHAVENTA);
      const cumpleFecha = fechaVenta >= fechaInicio && fechaVenta <= fechaFin;
      const asesor = (venta.AsesorVenta || '').toString().trim().toUpperCase();
      const cumpleAsesor = !selectedAsesor || asesor === selectedAsesor;
      return cumpleFecha && cumpleAsesor && asesor !== 'NAS';
    });
  }

  generarResumenPorAsesor(): void {
    const hoy = new Date();
    const diaHoy = hoy.getDate();
    const mesHoy = hoy.getMonth();
    const anioHoy = hoy.getFullYear();
    const diasMesActual = new Date(anioHoy, mesHoy + 1, 0).getDate();
    const diasTranscurridos = diaHoy - 1;
    const diasRestantes = diasMesActual - diaHoy + 1;

    const resumenMap = new Map<string, any>();

    for (const venta of this.dataVentas) {
      const asesorID = venta.AsesorVenta;
      if (!asesorID || asesorID === 'NAS') continue;

      if (!resumenMap.has(asesorID)) {
        resumenMap.set(asesorID, { ASESOR: asesorID, VENTAS: 0, TICKET: 0 });
      }

      const item = resumenMap.get(asesorID)!;
      item.VENTAS += venta.MontoConsolidado;
      item.TICKET += 1;
    }

    this.filtroVentas = Array.from(resumenMap.entries()).map(([id, data]) => {
      const metaData = this.asesoresMeta.find(a => a.id === id);
      const nombreAsesor = metaData?.nombre || id;
      const meta = metaData?.meta || 0;

      const ventas = Math.round(data.VENTAS);
      const ticket = Math.round(ventas / (data.TICKET || 1));
      const ticketDiario = diasTranscurridos > 0 ? ventas / diasTranscurridos : 0;
      const proyeccion = Math.round(ticketDiario * diasMesActual);
      const difMeta = Math.round(meta - ventas);
      const cuDia100 = diasRestantes > 0 ? Math.round(difMeta / diasRestantes) : 0;
      const bono = this.calcularBono(proyeccion);

      return {
        ASESOR: nombreAsesor,
        VENTAS: ventas,
        TICKET: ticket,
        TICKETDIARIO: ticketDiario,
        PROYECCION: proyeccion,
        BONO: bono,
        META: meta,
        DIFMETA: difMeta,
        CUADIA100: cuDia100
      };
    });
  }

  generarResumenPorSede(): void {
    const resumen = new Map<string, number>();

    for (const venta of this.dataVentas) {
      const sede = (venta.Sede || '').toString().trim().toUpperCase();
      const monto = venta.MontoConsolidado || 0;

      if (!resumen.has(sede)) {
        resumen.set(sede, monto);
      } else {
        resumen.set(sede, resumen.get(sede)! + monto);
      }
    }

    this.resumenPorSede = Array.from(resumen.entries()).map(([sede, monto]) => ({
      SEDE: sede,
      VALOR: Math.round(monto)
    }));

    console.log('Resumen por Sede:', this.resumenPorSede);
  }

  generarVentasPorTipoBase(): void {
    const resumenMap = new Map<string, number>();

    for (const venta of this.dataVentas) {
      const tipoBase = (venta.TipoBase || '').toString().trim().toUpperCase();
      if (!tipoBase) continue;

      if (resumenMap.has(tipoBase)) {
        resumenMap.set(tipoBase, resumenMap.get(tipoBase)! + 1);
      } else {
        resumenMap.set(tipoBase, 1);
      }
    }

    this.ventasPorTipoBase = Array.from(resumenMap.entries()).map(([TipoBase, TOTAL]) => ({
      TipoBase,
      TOTAL
    }));

    console.log('Resumen por TipoBase:', this.ventasPorTipoBase);
  }


  calcularBono(proyeccion: number): number {
    if (!proyeccion || proyeccion < 15000) return 0;
    for (const item of this.tablaBonos) {
      if (proyeccion >= item.monto) return item.bono;
    }
    return 0;
  }

  onAsesorChanged(event: any): void {
    if (this.form.valid) {
      this.aplicarFiltros();
      this.generarResumenPorAsesor();
      this.generarResumenPorSede();
      this.generarVentasPorTipoBase();
    }
  }

  customizeCurrencyText(cell: any): string {
    return `S/. ${Math.round(cell.value)}`;
  }

  onCellPrepared(e: any) {
    if (e.rowType === 'header') {
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

    if (e.rowType === 'data') {
      e.cellElement.style.border = '1px solid #ccc';
      e.cellElement.style.textAlign = 'center';
      e.cellElement.style.fontWeight = 'bold';

      if (e.column?.dataField === 'BONO') {
        const valor = e.value
        if (valor >= 700) {
          e.cellElement.style.backgroundColor = '#4CAF50';
          e.cellElement.style.color = 'black';
        } else if (valor >= 300 && valor <= 600) {
          e.cellElement.style.backgroundColor = '#63C967';
          e.cellElement.style.color = 'black';
        } else if (valor < 600) {
          e.cellElement.style.backgroundColor = '#7BD17F';
          e.cellElement.style.color = 'black';
        }
      }
    }

    // if (e.rowType === 'totalFooter') {
    //   e.cellElement.style.fontWeight = 'bold';
    // }
  }
}
