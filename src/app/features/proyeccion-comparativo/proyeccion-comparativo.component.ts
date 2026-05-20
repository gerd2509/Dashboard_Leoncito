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

  protected showFilterRow: boolean = true;
  protected currentFilter: string = 'auto';

  dataVentas: any[] = [];
  dataOriginal: any[] = [];
  filtroVentas: any[] = [];
  resumenPorSede: any[] = [];
  ventasPorTipoBase: any[] = [];

  totalVentas = 0;
  totalMontoVentas = 0;
  ticket = 0;

  tablaSedeBase: any[] = [];
  columnasDinamicas: string[] = [];
  tablaResumen: any[] = [];
  tablaResumenZonas: any[] = [];
  columnasResumen: string[] = [];
  tablaAsesorTipoCliente: any[] = [];
  columnasAsesorTipoCliente: string[] = [];

  // NUEVAS VARIABLES PARA LA TABLA DIARIA
  tablaDiariaSedes: any[] = [];

  // Definición de las zonas según tu imagen
  sedesZona1 = ['FERREÑAFE', 'LAMBAYEQUE', 'CAYALTI', 'CHONGOYAPE', 'MORROPE', 'MOCHUMI', 'OYOTUN'];
  sedesZona2 = ['OLMOS', 'MOTUPE', 'JAYANCA'];
  sedeRealzza = 'REALZZA';

  columnasResumenZonas: string[] = ['ZONA 1', 'ZONA 2', 'REALZZA'];

  asesoresMeta = [
    { id: 'CC1', nombre: 'MORETO DELGADO PATRICIA ESTEFANY', meta: 70000 },
    { id: 'CC3', nombre: 'UCHOFEN VIGO FELICITA', meta: 65000 },
    { id: 'CC5', nombre: 'QUISPE FONSECA KAREN AIMEE', meta: 75000 },
    { id: 'CC6', nombre: 'MORALES ÑIQUE MARIA CANDELARIA', meta: 60000 },
    { id: 'CC8', nombre: 'CHANTA CAMPOS KELLY KARINTIA', meta: 80000 },
    { id: 'CC11', nombre: 'SAMAME HUAMAN ARIADNE', meta: 50000 },
    { id: 'CC13', nombre: 'CARBONEL GUERRERO FRANCIS JHON', meta: 10000 },
    { id: 'CC14', nombre: 'MIÑOPE GONZALES ANYELA ESTHEFANY', meta: 10000 },
    { id: 'CC15', nombre: 'TORRES ALVARADO JUDY ESMERALDA', meta: 50000 },
    { id: 'CC16', nombre: 'BONILLA CHUMACERO VILMA ROSSMERY', meta: 50000 }
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
          TipoCliente: (row['TipoCliente'] || '').toString().trim().toUpperCase(),
          EstadoVenta: row['EstadoVenta'],
          AsesorVenta: (row['AsesorVenta'] || '').toString().trim().toUpperCase()
        }));

      this.aplicarFiltros();
      this.generarResumenPorAsesor();
      this.generarResumenPorSede();
      this.generarVentasPorTipoBase();
      this.generarTablaPorAsesorYTipoCliente();
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

      const { columnas, filas } = this.generarTablaSedeVsTipoBase();
      this.columnasDinamicas = columnas;
      this.tablaSedeBase = filas;

      const { columnasC, filasC } = this.generarResumenCarteraVsVigente();
      this.columnasResumen = columnasC;
      this.tablaResumen = filasC;

      const { columnasTipoCliente, filasTipoCliente } = this.generarTablaPorAsesorYTipoCliente();
      this.columnasAsesorTipoCliente = columnasTipoCliente;
      this.tablaAsesorTipoCliente = filasTipoCliente;

      this.generarTablaDiariaPorSede();
      this.generarResumenZonasSede();
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

  // generarResumenPorAsesor(): void {
  //   const hoy = new Date();
  //   const diaHoy = hoy.getDate();
  //   const mesHoy = hoy.getMonth();
  //   const anioHoy = hoy.getFullYear();
  //   const diasMesActual = new Date(anioHoy, mesHoy + 1, 0).getDate();
  //   const diasTranscurridos = diaHoy - 1;
  //   const diasRestantes = diasMesActual - diaHoy + 1;

  //   const resumenMap = new Map<string, any>();

  //   for (const venta of this.dataVentas) {
  //     const asesorID = venta.AsesorVenta;
  //     if (!asesorID || asesorID === 'NAS') continue;

  //     if (!resumenMap.has(asesorID)) {
  //       resumenMap.set(asesorID, { ASESOR: asesorID, VENTAS: 0, TICKET: 0 });
  //     }

  //     const item = resumenMap.get(asesorID)!;
  //     item.VENTAS += venta.MontoConsolidado;
  //     item.TICKET += 1;
  //   }

  //   this.filtroVentas = Array.from(resumenMap.entries()).map(([id, data]) => {
  //     const metaData = this.asesoresMeta.find(a => a.id === id);
  //     const nombreAsesor = metaData?.nombre || id;
  //     const meta = metaData?.meta || 0;

  //     const ventas = Math.round(data.VENTAS);
  //     const ticket = Math.round(ventas / (data.TICKET || 1));
  //     const ticketDiario = diasTranscurridos > 0 ? ventas / diasTranscurridos : 0;
  //     const proyeccion = Math.round(ticketDiario * diasMesActual);
  //     const difMeta = Math.round(meta - ventas);
  //     const cuDia100 = diasRestantes > 0 ? Math.round(difMeta / diasRestantes) : 0;
  //     const bono = this.calcularBono(proyeccion);

  //     return {
  //       ASESOR: nombreAsesor,
  //       VENTAS: ventas,
  //       TICKET: ticket,
  //       TICKETDIARIO: ticketDiario,
  //       PROYECCION: proyeccion,
  //       BONO: bono,
  //       META: meta,
  //       DIFMETA: difMeta,
  //       CUADIA100: cuDia100
  //     };
  //   });

  //   this.totalVentas = this.dataVentas.length;
  //   this.totalMontoVentas = this.dataVentas.reduce((sum, v) => sum + v.MontoConsolidado, 0);
  //   this.ticket = this.totalVentas ? this.totalMontoVentas / this.totalVentas : 0;
  // }

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

    const diasRango = Math.ceil((fechaFin.getTime() - fechaInicio.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const diasMesSeleccionado = new Date(fechaFin.getFullYear(), fechaFin.getMonth() + 1, 0).getDate();

    // 🟢 Detectar si se seleccionó todo el mes
    const seleccionaMesCompleto =
      fechaInicio.getDate() === 1 &&
      fechaFin.getDate() === diasMesSeleccionado &&
      fechaInicio.getMonth() === fechaFin.getMonth() &&
      fechaInicio.getFullYear() === fechaFin.getFullYear();

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

      let ticketDiario = 0;
      let proyeccion = 0;
      let bono = 0;
      let cuDia100 = 0;

      if (seleccionaMesCompleto) {
        // ⚠️ Si se selecciona el mes completo, se usa lo vendido directamente
        ticketDiario = ventas / diasMesSeleccionado;
        proyeccion = ventas;
        bono = this.calcularBono(ventas);
        cuDia100 = 0;
      } else {
        // ✅ Caso normal (mes en curso o parcial)
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

    this.totalVentas = this.dataVentas.length;
    this.totalMontoVentas = this.dataVentas.reduce((sum, v) => sum + v.MontoConsolidado, 0);
    this.ticket = this.totalVentas ? this.totalMontoVentas / this.totalVentas : 0;
  }

  // 
  generarTablaPorAsesorYTipoCliente(): { columnasTipoCliente: string[], filasTipoCliente: any[] } {
    const resultado: any[] = [];

    // 1. Crear un Mapa rápido para buscar nombres por ID
    // Esto convierte el array en un objeto: { 'CC1': 'MORETO...', 'CC3': 'UCHOFEN...' }
    const mapaNombres: Record<string, string> = {};
    this.asesoresMeta.forEach(m => {
      mapaNombres[m.id] = m.nombre;
    });

    // 2. Obtener los IDs únicos de la data de ventas (Igual que antes)
    let asesoresIds = [...new Set(this.dataVentas
      .map(v => (v.AsesorVenta || '').toString().trim().toUpperCase())
      .filter(a => a && a !== 'NAS' && a !== 'TOTAL'))];

    // 3. Crear una lista de objetos { id, nombre } y ORDENAR POR NOMBRE
    let asesoresOrdenados = asesoresIds.map(id => {
      return {
        id: id,
        // Si el ID existe en tu lista de meta, usa el nombre. Si no, usa el ID como respaldo.
        nombre: mapaNombres[id] || id
      };
    });

    // Ordenamos alfabéticamente por el NOMBRE
    asesoresOrdenados.sort((a, b) => a.nombre.localeCompare(b.nombre));

    // 4. Obtener tipos de cliente (Igual que antes)
    let tiposCliente = [...new Set(this.dataVentas
      .map(v => (v.TipoCliente || '').toString().trim().toUpperCase())
      .filter(t => t !== ''))];
    tiposCliente.sort((a, b) => a.localeCompare(b));

    // 5. Construir filas iterando sobre la lista ordenada
    asesoresOrdenados.forEach(asesorObj => {
      // 👁️ OJO: Aquí usamos el NOMBRE para la visualización
      const fila: any = { ASESOR: asesorObj.nombre };
      let totalFila = 0;

      tiposCliente.forEach(tipo => {
        const ventasFiltradas = this.dataVentas.filter(v =>
          // 🧠 LÓGICA: Filtramos usando el ID original ('CC1'), no el nombre largo
          (v.AsesorVenta || '').toString().trim().toUpperCase() === asesorObj.id &&
          (v.TipoCliente || '').toString().trim().toUpperCase() === tipo
        );

        const monto = ventasFiltradas.reduce((sum, v) => sum + (v.MontoConsolidado || 0), 0);
        fila[tipo] = monto;
        totalFila += monto;
      });

      fila['TOTAL'] = totalFila;
      resultado.push(fila);
    });

    return { columnasTipoCliente: [...tiposCliente, 'TOTAL'], filasTipoCliente: resultado };
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

  generarTablaSedeVsTipoBase(): { columnas: string[], filas: any[] } {
    const resultado: any[] = [];
    const sedes = [...new Set(this.dataVentas.map(v => (v.Sede || '').toString().trim().toUpperCase()))];
    let tiposBase = [...new Set(this.dataVentas.map(v => (v.TipoBase || '').toString().trim().toUpperCase()))];

    // 🚀 Ordenar alfabéticamente las columnas dinámicas
    tiposBase = tiposBase.sort((a, b) => a.localeCompare(b));

    sedes.forEach(sede => {
      const fila: any = { SEDE: sede };
      let totalFila = 0;

      tiposBase.forEach(base => {
        const ventasFiltradas = this.dataVentas.filter(v =>
          (v.Sede || '').toString().trim().toUpperCase() === sede &&
          (v.TipoBase || '').toString().trim().toUpperCase() === base
        );

        const monto = ventasFiltradas.reduce((sum, v) => sum + (v.MontoConsolidado || 0), 0);
        fila[base] = monto;
        totalFila += monto;
      });

      fila['TOTAL'] = totalFila; // 🚀 solo columna total por sede
      resultado.push(fila);
    });

    // 🚀 columnas ordenadas + la columna TOTAL al final
    return { columnas: [...tiposBase, 'TOTAL'], filas: resultado };
  }

  generarResumenCarteraVsVigente(): { columnasC: string[], filasC: any[] } {
    let carteraCall = 0;
    let vigente = 0;

    this.dataVentas.forEach(v => {
      const tipoBase = (v.TipoBase || '').toString().trim().toUpperCase();
      const monto = v.MontoConsolidado || 0;

      if (tipoBase === 'VIGENTE') {
        vigente += monto;
      } else {
        carteraCall += monto;
      }
    });

    const filaResumen = {
      'CARTERA CALL': carteraCall,
      'VIGENTE': vigente
    };

    return { columnasC: ['CARTERA CALL', 'VIGENTE'], filasC: [filaResumen] };
  }

  generarResumenZonasSede(): void {
    let totalZona1 = 0;
    let totalZona2 = 0;
    let totalRealzza = 0;

    this.dataVentas.forEach(venta => {
      const nombreSede = (venta.Sede || '').toString().trim().toUpperCase();
      const monto = venta.MontoConsolidado || 0;

      // Lógica para detectar si pertenece a Zona 1 (Búsqueda parcial "includes")
      if (this.sedesZona1.some(s => nombreSede.includes(s))) {
        totalZona1 += monto;
      }
      // Lógica para Zona 2
      else if (this.sedesZona2.some(s => nombreSede.includes(s))) {
        totalZona2 += monto;
      }
      // Lógica para Realzza
      else if (nombreSede.includes(this.sedeRealzza)) {
        totalRealzza += monto;
      }
    });

    // Creamos una única fila con los resultados
    const filaResumen = {
      'ZONA 1': totalZona1,
      'ZONA 2': totalZona2,
      'REALZZA': totalRealzza
    };

    this.tablaResumenZonas = [filaResumen];
  }

  generarTablaDiariaPorSede(): void {
    if (!this.form.value.fechaInicio || !this.form.value.fechaFin) return;

    const fechaInicio = new Date(this.form.value.fechaInicio);
    const fechaFin = new Date(this.form.value.fechaFin);

    // Normalizar horas para comparar solo fechas
    fechaInicio.setHours(0, 0, 0, 0);
    fechaFin.setHours(23, 59, 59, 999);

    const resultado: any[] = [];
    const loopDate = new Date(fechaInicio);

    // Formateador: "01 ene"
    const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };

    // Lista completa de tus columnas simplificadas para inicializar en 0
    const todasLasSedes = [...this.sedesZona1, ...this.sedesZona2, this.sedeRealzza];

    // --- BUCLE POR CADA DÍA DEL RANGO ---
    while (loopDate <= fechaFin) {
      const fechaStr = loopDate.toLocaleDateString('es-ES', options);

      // 1. Crear la fila vacía para este día
      const fila: any = {
        DIA: fechaStr,
        FECHA_OBJ: new Date(loopDate) // Útil si necesitas ordenar por fecha real
      };

      // Inicializar todas las columnas en 0
      todasLasSedes.forEach(sede => fila[sede] = 0);

      // 2. Filtrar las ventas SOLO de este día
      const ventasDelDia = this.dataVentas.filter(v => {
        const fVenta = new Date(v.FECHAVENTA);
        return fVenta.getDate() === loopDate.getDate() &&
          fVenta.getMonth() === loopDate.getMonth() &&
          fVenta.getFullYear() === loopDate.getFullYear();
      });

      // 3. Asignar los montos a la columna correcta (LÓGICA CORREGIDA)
      ventasDelDia.forEach(venta => {
        const nombreSedeExcel = (venta.Sede || '').toString().trim().toUpperCase();
        const monto = venta.MontoConsolidado || 0;

        // Buscamos a qué sede simplificada pertenece este registro del Excel.
        // Ejemplo: Si nombreSedeExcel es "SEDE RELENOR FERREÑAFE", .find devolverá "FERREÑAFE"
        const sedeKey = todasLasSedes.find(sedeSimple => nombreSedeExcel.includes(sedeSimple));

        if (sedeKey) {
          // Si encontramos coincidencia, sumamos al acumulador de esa columna
          fila[sedeKey] += monto;
        } else {
          // Opcional: Console log para detectar sedes que no cuadran con tu lista
          // console.warn('Sede no mapeada:', nombreSedeExcel);
        }
      });

      resultado.push(fila);

      // Avanzar al siguiente día
      loopDate.setDate(loopDate.getDate() + 1);
    }

    this.tablaDiariaSedes = resultado;
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
