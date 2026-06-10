import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { ExcelExportService } from '../../services/excel/excel.service';
import { DxDataGridComponent } from 'devextreme-angular';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-comparativo-ventas',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './comparativo-ventas.component.html',
  styleUrl: './comparativo-ventas.component.css'
})
export class ComparativoVentasComponent implements OnInit {
  protected excelService = inject(ExcelExportService);

  formComparativo: UntypedFormGroup;

  dataVentas: any[] = [];
  filtroVentas: any[] = [];

  chartComparativo: any[] = [];
  chartMontoMensual: { Mes: string; MontoTotal: number }[] = [];
  chartRankingAsesores: { Asesor: string; Monto: number }[] = [];

  // Comparativo por CONTACTO (KOMMO, BD, etc.) — eje X = Contacto
  chartContacto: any[] = [];          // default: [{ Contacto, MontoGen }] | comparación: [{ Contacto, MontoA, MontoB }]
  comparandoContacto = false;         // modo: false = rango general; true = Rango A vs Rango B
  serieGenLabel = 'Rango general';
  serieALabel = 'Rango A';
  serieBLabel = 'Rango B';
  formContacto: UntypedFormGroup;     // 2 rangos de fecha solo para este gráfico

  keepAssesorsUnique = () => 0;

  protected showFilterRow: boolean = true;
  protected currentFilter: string = 'auto';

  asesores = [
    { value: '', viewValue: 'Seleccione Asesor' },
    { value: 'CC1', viewValue: 'MORETO DELGADO PATRICIA ESTEFANY' },
    { value: 'CC3', viewValue: 'UCHOFEN VIGO FELICITA' },
    { value: 'CC5', viewValue: 'QUISPE FONSECA KAREN AIMEE' },
    { value: 'CC6', viewValue: 'MORALES ÑIQUE MARIA CANDELARIA' },
    { value: 'CC7', viewValue: 'ACOSTA JIMENEZ MARIELA NATALY' },
    { value: 'CC8', viewValue: 'CHANTA CAMPOS KELLY KARINTIA' },
    { value: 'CC9', viewValue: 'PÉREZ TINEO MARICIELO TATIANA' },
    { value: 'CC11', viewValue: 'SAMAME HUAMAN ARIADNE' },
    { value: 'CC13', viewValue: 'CARBONEL GUERRERO FRANCIS JHON' },
    { value: 'CC14', viewValue: 'MIÑOPE GONZALES ANYELA ESTHEFANY' },
    { value: 'CC15', viewValue: 'TORRES ALVARADO JUDY ESMERALDA' },
    { value: 'CC16', viewValue: 'BONILLA CHUMACERO VILMA ROSMERY' },
  ];

  @ViewChild(DxDataGridComponent, { static: false }) dataGrid!: DxDataGridComponent;

  constructor(private fb: UntypedFormBuilder) {
    this.formComparativo = this.fb.group({
      fechaInicio: [null, Validators.required],
      fechaFin: [null, Validators.required],
      Asesores: ['']
    });

    // Rangos de fecha exclusivos del gráfico por contacto
    this.formContacto = this.fb.group({
      aInicio: [null], aFin: [null],
      bInicio: [null], bFin: [null],
    });
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
        Productos: row['Productos'],
        Cuotas: row['Cuotas'],
        DocIdentidad: row['DocIdentidad'],
        TipoVenta: row['TipoVenta'],
        TipoBase: row['TipoBase'],
        AsesorVenta: row['AsesorVenta'],
        EstadoVenta: row['EstadoVenta'],
        Entidad: row['Entidad'],
        LineaReal: row['LineaReal'],
        TipoProducto: row['TipoProducto'],
        Contacto: (row['CONTACTO'] ?? row['Contacto'] ?? row['contacto'] ?? '')
          .toString().trim().toUpperCase() || 'SIN CONTACTO'
      }));

      this.filtroVentas = [...this.dataVentas];
      // this.generarChartData();
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

  onAsesorChanged(event: any) {
    if (this.formComparativo.valid) {
      this.aplicarFiltros();
    }
  }

  actualizarFiltros(): void {
    if (this.formComparativo.valid) {
      this.aplicarFiltros();
    }
  }

  aplicarFiltros(): void {
    const selectedAsesor = (this.formComparativo.value.Asesores || '').toString().trim().toUpperCase();

    const fechaInicio = new Date(this.formComparativo.value.fechaInicio);
    const fechaFin = new Date(this.formComparativo.value.fechaFin);
    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(23, 59, 59, 999);

    this.filtroVentas = this.dataVentas.filter(venta => {
      const fechaVenta = new Date(venta.FECHAVENTA);
      const cumpleFecha = fechaVenta >= fechaInicio && fechaVenta <= fechaFin;

      const asesor = (venta.AsesorVenta || '').toString().trim().toUpperCase();
      const cumpleAsesor = !selectedAsesor || asesor === selectedAsesor;

      return cumpleFecha && cumpleAsesor;
    });

    this.generarComparativo();
    this.generarChartMontoMensual();
    this.generarRankingAsesores();

    // Al aplicar filtros generales volvemos al modo "rango general" del gráfico por contacto
    this.comparandoContacto = false;
    this.generarChartContacto();
  }

  calcularVentasPorAsesorYRango(fechaInicio: Date, fechaFin: Date): any[] {
    const ventasFiltradas = this.dataVentas.filter(v => {
      const fechaVenta = new Date(v.FECHAVENTA);
      return fechaVenta >= fechaInicio && fechaVenta <= fechaFin;
    });

    const agrupado = new Map<string, number>();

    for (const venta of ventasFiltradas) {
      const asesor = venta.AsesorVenta || 'SIN ASESOR';
      const monto = venta.MontoConsolidado || 0;
      agrupado.set(asesor, (agrupado.get(asesor) || 0) + monto);
    }

    return Array.from(agrupado, ([Asesor, Monto]) => ({ Asesor, Monto }));
  }

  // generarComparativo(): void {
  //   const f1Inicio = new Date(this.formComparativo.value.fechaInicio);
  //   const f1Fin = new Date(this.formComparativo.value.fechaFin);
  //   const f2Inicio = new Date(this.formComparativo.value.fechaInicio2);
  //   const f2Fin = new Date(this.formComparativo.value.fechaFin2);

  //   const rango1 = this.calcularVentasPorAsesorYRango(f1Inicio, f1Fin);
  //   const rango2 = (f2Inicio && f2Fin) ? this.calcularVentasPorAsesorYRango(f2Inicio, f2Fin) : [];

  //   const asesoresUnicos = Array.from(
  //     new Set([...rango1.map(r => r.Asesor), ...rango2.map(r => r.Asesor)])
  //   );

  //   this.chartComparativo = asesoresUnicos.map(asesor => {
  //     const v1 = rango1.find(r => r.Asesor === asesor)?.Monto || 0;
  //     const v2 = rango2.find(r => r.Asesor === asesor)?.Monto || 0;
  //     const diferencia = v2 - v1;

  //     return {
  //       asesor,
  //       Rango1: v1,
  //       Rango2: v2,
  //       Crecimiento: diferencia
  //     };
  //   });
  // }

  generarComparativo(): void {
    // Usamos this.filtroVentas, ya filtrado por fechas/asesor en aplicarFiltros()
    const ventasFiltradas = this.filtroVentas;

    // 🔹 Map para agrupar montos y Set para coleccionar claves de mes (YYYY-MM)
    const agrupado = new Map<string, { label: string; monto: number }>();
    const mesesSet = new Set<string>(); // 💡 Nuevo: Similar a generarChartMontoMensual

    ventasFiltradas.forEach(v => {
      const monto = Number(v.MontoConsolidado || v.Monto || 0);

      if (monto <= 0) return;

      const fechaVenta = new Date(v.FECHAVENTA);
      const year = fechaVenta.getFullYear();
      const month = fechaVenta.getMonth() + 1;

      const mesKey = `${year}-${String(month).padStart(2, '0')}`; // Ej: "2025-10"
      const mesLabel = `${this.getNombreMes(month)} ${year}`;

      // 💡 Nuevo: Agregamos la clave al Set
      mesesSet.add(mesKey);

      if (!agrupado.has(mesKey)) agrupado.set(mesKey, { label: mesLabel, monto: 0 });
      agrupado.get(mesKey)!.monto += monto;
    });

    // 🔹 Ordenar los meses usando el Set (similar a generarChartMontoMensual)
    const mesesOrdenados = Array.from(mesesSet).sort();

    const datosFinales: any[] = [];
    let montoPrevio: number | null = null;

    // 🔹 Iteramos sobre las claves de mes ordenadas
    mesesOrdenados.forEach(mesKey => {
      const dataMes = agrupado.get(mesKey);

      // Debe existir la data, pero es buena práctica verificar
      if (!dataMes) return;

      const { label, monto } = dataMes;

      let crecimiento = 0;
      if (montoPrevio !== null) {
        // Cálculo del crecimiento porcentual
        crecimiento = montoPrevio > 0 ? ((monto - montoPrevio) / montoPrevio) * 100 : 0;
      }

      datosFinales.push({
        Mes: label,
        MesKey: mesKey,
        Monto: parseFloat(monto.toFixed(2)),
        Crecimiento: Math.round(crecimiento),
        Proyeccion: null as number | null
      });

      montoPrevio = monto;
    });

    // Proyección para el mes en curso
    const hoy = new Date();
    const mesActualKey = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    const diasTranscurridos = hoy.getDate();
    const totalDiasMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();

    datosFinales.forEach(item => {
      if (item.MesKey === mesActualKey && diasTranscurridos > 0 && item.Monto > 0) {
        item.Proyeccion = parseFloat(((item.Monto / diasTranscurridos) * totalDiasMes).toFixed(2));
      }
    });

    this.chartComparativo = datosFinales;
  }

  customizePoint = (info: any) => {
    // Solo colorear la línea de crecimiento
    if (info.seriesName === 'Crecimiento (%)') {
      const val = info.data.Crecimiento;
      return {
        color: val > 0 ? '#4CAF50' : val < 0 ? '#F44336' : '#9E9E9E',
        hoverStyle: {
          color: val > 0 ? '#66BB6A' : val < 0 ? '#E57373' : '#BDBDBD'
        }
      };
    }
    return {};
  };

  customizeTooltip(pointInfo: any) {
    if (pointInfo.seriesName === 'Monto (S/)') {
      return { text: `Monto: S/ ${Number(pointInfo.value).toLocaleString('es-PE', { maximumFractionDigits: 0 })}` };
    }
    if (pointInfo.seriesName === 'Crecimiento (%)') {
      return { text: `Crecimiento: ${Math.round(pointInfo.value)}%` };
    }
    if (pointInfo.seriesName === 'Proyección Mes Actual') {
      return { text: `Proyección mes: S/ ${Number(pointInfo.value).toLocaleString('es-PE', { maximumFractionDigits: 0 })}` };
    }
    return { text: '' };
  }

  generarChartMontoMensual(): void {
    const agrupado = new Map<string, number>();
    const mesesSet = new Set<string>();

    for (const venta of this.filtroVentas) {
      if (!venta.MontoConsolidado || venta.MontoConsolidado <= 0) continue;

      const fecha = new Date(venta.FECHAVENTA);
      const claveMes = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}`; // Ej: "2025-07"
      mesesSet.add(claveMes);

      agrupado.set(
        claveMes,
        (agrupado.get(claveMes) || 0) + venta.MontoConsolidado
      );
    }

    const mesesOrdenados = Array.from(mesesSet).sort();

    this.chartMontoMensual = mesesOrdenados.map(claveMes => {
      const [anio, mes] = claveMes.split('-');
      const nombreMes = this.getNombreMes(+mes) + ' ' + anio;
      return {
        Mes: nombreMes,
        MontoTotal: agrupado.get(claveMes) || 0
      };
    });
  }

  /** Normaliza el valor de la columna CONTACTO. */
  private normContacto(v: any): string {
    return (v || 'SIN CONTACTO').toString().trim().toUpperCase() || 'SIN CONTACTO';
  }

  /** Suma montos por contacto dentro de un rango de fechas, respetando el asesor seleccionado. */
  private montosPorContacto(fechaInicio: any, fechaFin: any): Map<string, number> {
    const di = new Date(fechaInicio); di.setHours(0, 0, 0, 0);
    const df = new Date(fechaFin);    df.setHours(23, 59, 59, 999);
    const asesor = (this.formComparativo.value.Asesores || '').toString().trim().toUpperCase();

    const map = new Map<string, number>();
    for (const v of this.dataVentas) {
      const monto = Number(v.MontoConsolidado || 0);
      if (monto <= 0) continue;

      const fv = new Date(v.FECHAVENTA);
      if (fv < di || fv > df) continue;

      const a = (v.AsesorVenta || '').toString().trim().toUpperCase();
      if (asesor && a !== asesor) continue;

      const c = this.normContacto(v.Contacto);
      map.set(c, (map.get(c) || 0) + monto);
    }
    return map;
  }

  /** Modo por defecto: monto por contacto en el rango GENERAL (usa filtroVentas ya filtrado). */
  generarChartContacto(): void {
    const agrupado = new Map<string, number>();
    for (const v of this.filtroVentas) {
      const monto = Number(v.MontoConsolidado || 0);
      if (monto <= 0) continue;
      const c = this.normContacto(v.Contacto);
      agrupado.set(c, (agrupado.get(c) || 0) + monto);
    }

    const ini = this.formComparativo.value.fechaInicio;
    const fin = this.formComparativo.value.fechaFin;
    this.serieGenLabel = `Rango general (${this.fmtFecha(ini)} – ${this.fmtFecha(fin)})`;

    this.chartContacto = Array.from(agrupado, ([Contacto, MontoGen]) => ({
      Contacto, MontoGen: parseFloat(MontoGen.toFixed(2))
    })).sort((a, b) => b.MontoGen - a.MontoGen);
  }

  /** Modo comparación: Rango A vs Rango B por contacto (2 barras por contacto). */
  compararRangosContacto(): void {
    const f = this.formContacto.value;
    if (!f.aInicio || !f.aFin || !f.bInicio || !f.bFin) {
      return; // se requieren los 4 campos de fecha
    }

    const mapA = this.montosPorContacto(f.aInicio, f.aFin);
    const mapB = this.montosPorContacto(f.bInicio, f.bFin);
    const contactos = Array.from(new Set([...mapA.keys(), ...mapB.keys()])).sort();

    this.serieALabel = `A: ${this.fmtFecha(f.aInicio)} – ${this.fmtFecha(f.aFin)}`;
    this.serieBLabel = `B: ${this.fmtFecha(f.bInicio)} – ${this.fmtFecha(f.bFin)}`;

    this.chartContacto = contactos.map(c => ({
      Contacto: c,
      MontoA: parseFloat((mapA.get(c) || 0).toFixed(2)),
      MontoB: parseFloat((mapB.get(c) || 0).toFixed(2)),
    }));
    this.comparandoContacto = true;
  }

  /** Quita la comparación y vuelve al monto por contacto del rango general. */
  limpiarComparacionContacto(): void {
    this.formContacto.reset();
    this.comparandoContacto = false;
    this.generarChartContacto();
  }

  private fmtFecha(d: any): string {
    if (!d) return '';
    return new Date(d).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  customizeContactoTooltip = (pointInfo: any) => {
    return {
      text: `${pointInfo.seriesName}\n${pointInfo.argument}: S/ ${Number(pointInfo.value).toLocaleString('es-PE', { maximumFractionDigits: 0 })}`
    };
  };

  getNombreMes(mes: number): string {
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return meses[mes - 1] || '';
  }

  generarRankingAsesores(): void {
    const agrupado = new Map<string, number>();
    for (const venta of this.filtroVentas) {
      const asesor = venta.AsesorVenta || 'SIN ASESOR';
      const monto = venta.MontoConsolidado || 0;
      if (monto <= 0) continue;
      agrupado.set(asesor, (agrupado.get(asesor) || 0) + monto);
    }
    this.chartRankingAsesores = Array.from(agrupado, ([Asesor, Monto]) => ({ Asesor, Monto }))
      .sort((a, b) => b.Monto - a.Monto);
  }

  formatMontoLabel = (info: any): string => {
    const val = Number(info.value);
    if (!val) return '';
    return `S/ ${val.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`;
  };

  formatCrecimientoLabel = (info: any): string => {
    const val = info.value as number;
    if (val === 0 || val == null) return '0%';
    return `${val > 0 ? '+' : ''}${val}%`;
  };

  formatProyeccionLabel = (info: any): string => {
    const val = Number(info.value);
    if (!val) return '';
    return `Proy: S/ ${val.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`;
  };

  customizeRankingPoint = (info: any): any => {
    const total = this.chartRankingAsesores.length;
    if (total === 0) return {};
    const idx = this.chartRankingAsesores.findIndex(r => r.Asesor === info.argument);
    if (idx === -1) return {};
    const tercio = Math.ceil(total / 3);
    if (idx < tercio) return { color: '#2E7D32' };
    if (idx >= total - tercio) return { color: '#C62828' };
    return { color: '#1565C0' };
  };

  exportar(): void {
    if (this.dataGrid) {
      this.excelService.exportarDesdeGrid("dataAgendamientos", this.dataGrid);
    }
  }

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
