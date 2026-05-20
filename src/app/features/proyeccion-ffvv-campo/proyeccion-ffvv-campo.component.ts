import { Component, OnInit } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-proyeccion-ffvv-campo',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './proyeccion-ffvv-campo.component.html',
  styleUrl: './proyeccion-ffvv-campo.component.css'
})
export class ProyeccionFfvvCampoComponent implements OnInit {
  form: UntypedFormGroup;

  dataVentas: any[] = [];
  dataOriginal: any[] = [];
  filtroVentas: any[] = [];

  totalVentas = 0;
  totalMontoVentas = 0;
  ticket = 0;

  asesoresMeta = [
    { id: 'AV1', nombre: 'MONTALVO LUYO ERNESTO ADOLFO', meta: 75000 },
    { id: 'AV2', nombre: 'ACOSTA JIMENEZ MARIELA NATALY', meta: 50000 },
    { id: 'AV3', nombre: 'PEREZ TINEO MARICIELO TATIANA', meta: 50000 },
    { id: 'AV4', nombre: 'NAVARRO CASTAÑEDA MARISA GLADYS', meta: 25000 },
    { id: 'AV5', nombre: 'SANDOVAL OTINIANO JUANA DEL PILAR', meta: 25000 },
    { id: 'AV6', nombre: 'ORDINOLA LEON SILVANA MARTINA', meta: 25000 },
    { id: 'AV8', nombre: 'ARROBAS LOZADA DORA YVONNE', meta: 25000 },
    { id: 'AV9', nombre: 'SERNAQUE DAVILA JUAN ALBERTO', meta: 25000 }
  ];

  tablaBonos = [
    { monto: 115000, bono: 1800 }, { monto: 110000, bono: 1700 }, { monto: 105000, bono: 1600 },
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

  async ngOnInit() {
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
          Vendedor: (row['Vendedor'] || '').toString().trim().toUpperCase(), // 🟢 nuevo campo
          EstadoVenta: row['EstadoVenta']
        }));


      this.dataVentas = [...this.dataOriginal];

      this.aplicarFiltros();
      this.generarResumenPorAsesor();
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
    }
  }

  aplicarFiltros(): void {
    const selectedAsesor = (this.form.value.Asesores || '').toString().trim().toUpperCase();

    const fechaInicio = new Date(this.form.value.fechaInicio);
    const fechaFin = new Date(this.form.value.fechaFin);
    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(23, 59, 59, 999);

    // 🟢 Lista de asesores válidos (en mayúsculas)
    const asesoresValidos = this.asesoresMeta.map(a => a.nombre.toUpperCase());

    this.dataVentas = this.dataOriginal.filter(venta => {
      const fechaVenta = new Date(venta.FECHAVENTA);

      const cumpleFecha = fechaVenta >= fechaInicio && fechaVenta <= fechaFin;

      // ✅ Comparación contra la columna Vendedor
      const cumpleAsesor = selectedAsesor
        ? venta.Vendedor === selectedAsesor
        : asesoresValidos.includes(venta.Vendedor);

      return cumpleFecha && cumpleAsesor;
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

    const fechaInicio = new Date(this.form.value.fechaInicio);
    const fechaFin = new Date(this.form.value.fechaFin);
    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(23, 59, 59, 999);

    const diasMesSeleccionado = new Date(
      fechaFin.getFullYear(),
      fechaFin.getMonth() + 1,
      0
    ).getDate();

    // 🟢 Detectar si se seleccionó todo el mes
    const seleccionaMesCompleto =
      fechaInicio.getDate() === 1 &&
      fechaFin.getDate() === diasMesSeleccionado &&
      fechaInicio.getMonth() === fechaFin.getMonth() &&
      fechaInicio.getFullYear() === fechaFin.getFullYear();

    const resumenMap = new Map<string, any>();

    // 📌 Usar la columna Vendedor para agrupar las ventas
    for (const venta of this.dataVentas) {
      // ⚠️ Filtrar solo las ventas de la sede REALZZA STORE
      if (venta.Sede?.toUpperCase() !== 'SEDE REALZZA STORE') continue;

      const vendedor = venta.Vendedor;
      if (!vendedor) continue;

      if (!resumenMap.has(vendedor)) {
        resumenMap.set(vendedor, { ASESOR: vendedor, VENTAS: 0, TICKET: 0 });
      }

      const item = resumenMap.get(vendedor)!;
      item.VENTAS += venta.MontoConsolidado;
      item.TICKET += 1;
    }

    // 📌 Generar el resumen final por asesor válido
    this.filtroVentas = Array.from(resumenMap.entries()).map(([id, data]) => {
      const metaData = this.asesoresMeta.find(
        a => a.nombre.toUpperCase() === id
      );
      const nombreAsesor = metaData?.nombre || id;
      const meta = metaData?.meta || 0;

      const ventas = Math.round(data.VENTAS);
      const ticket = Math.round(ventas / (data.TICKET || 1));

      let ticketDiario = 0;
      let proyeccion = 0;
      let bono = 0;
      let cuDia100 = 0;

      if (seleccionaMesCompleto) {
        ticketDiario = ventas / diasMesSeleccionado;
        proyeccion = ventas;
        bono = this.calcularBono(ventas);
        cuDia100 = 0;
      } else {
        ticketDiario = diasTranscurridos > 0 ? ventas / diasTranscurridos : 0;
        proyeccion = Math.round(ticketDiario * diasMesActual);
        bono = this.calcularBono(proyeccion);
        const difMeta = Math.round(meta - ventas);
        cuDia100 = diasRestantes > 0 ? Math.round(difMeta / diasRestantes) : 0;
      }

      const difMeta = Math.round(meta - ventas);

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

    // Totales solo de REALZZA STORE
    const ventasFiltradas = this.dataVentas.filter(
      v => v.Sede?.toUpperCase() === 'REALZZA STORE'
    );

    this.totalVentas = ventasFiltradas.length;
    this.totalMontoVentas = ventasFiltradas.reduce(
      (sum, v) => sum + v.MontoConsolidado,
      0
    );
    this.ticket = this.totalVentas
      ? this.totalMontoVentas / this.totalVentas
      : 0;
  }

  calcularBono(proyeccion: number): number {
    if (!proyeccion || proyeccion < 15000) return 0;
    for (const item of this.tablaBonos) {
      if (proyeccion >= item.monto) return item.bono;
    }
    return 0;
  }

  customizeCurrencyText(cell: any): string {
    return `S/. ${Math.round(cell.value)}`;
  }

  customizeTicketSummaryText = (e: any) => {
    return `S/. ${Math.round(this.ticket)}`;
  };

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
