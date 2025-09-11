import { Component, inject, OnInit } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { SheetsService } from '../../services/service-google.service';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-cierre-gestion',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './cierre-gestion.component.html',
  styleUrl: './cierre-gestion.component.css'
})
export class CierreGestionComponent implements OnInit {
  protected service = inject(SheetsService);

  formCierreGestion: UntypedFormGroup;

  dataVentas: any[] = [];
  filtroVentas: any[] = [];

  dataOriginal: any[] = [];
  dataContactabilidad: any[] = [];
  dataAgendamientos: any[] = [];
  dataDerivaciones: any[] = [];
  dataGestionPorAsesor: any[] = [];
  dataGestionPorSedeYCliente: any[] = [];
  dataGestionPorAsesorYCliente: any[] = [];
  columnasGrid: any[] = [];

  agendamientoIndividual = 15;
  derivacionesIndividual = 2;
  metaDerivacionEquipo = 12;
  metaAgendamientoEquipo = 90;

  porcentajeMetaAgendamiento = 0;
  porcentajeMetaDerivacion = 0;
  porcentajeTotalContactabilidad = 0;

  dataGrafico: any[] = [];
  chartData: { AsesorVenta: string, MontoTotal: number }[] = [];
  chartPorDia: { Dia: string, MontoTotal: number }[] = [];
  totalContactados = 0;
  totalInteresados = 0;
  totalDerivaciones = 0;

  intervaloMediaHora: any = null;
  timeoutMediaHora: any = null;
  intervaloCincoMin: any = null;

  semanas: string[] = [];
  semanaMap = new Map<string, string>();

  totalMontoVentas = 0;
  totalVentas = 0;
  ticket = 0;
  proyeccion = 0;

  asesores1 = [
    { value: '', viewValue: 'Seleccione Asesor' },
    { value: 'CC1', viewValue: 'MORETO DELGADO PATRICIA ESTEFANY' },
    { value: 'CC3', viewValue: 'UCHOFEN VIGO FELICITA' },
    { value: 'CC5', viewValue: 'QUISPE FONSECA KAREN AIMEE' },
    { value: 'CC6', viewValue: 'MORALES ÑIQUE MARIA CANDELARIA' },
    { value: 'CC7', viewValue: 'ACOSTA JIMENEZ MARIELA NATALY' },
    { value: 'CC8', viewValue: 'CHANTA CAMPOS KELLY KARINTIA' },
    { value: 'CC9', viewValue: 'PÉREZ TINEO MARICIELO TATIANA' },
    { value: 'CC10', viewValue: 'RIVAS PURISACA KAREN YUDITH' }
  ];

  isLoading = false;

  constructor(private fb: UntypedFormBuilder) {
    const currentDate = new Date();
    this.formCierreGestion = this.fb.group({
      fechaGestion: [currentDate]
    });
  }

  async ngOnInit() {
    this.isLoading = true; // 🔹 mostrar loading desde que entra

    try {
      this.dataOriginal = await lastValueFrom(this.service.getSheetData());
      console.log('Datos originales cargados:', this.dataOriginal);
      this.totalContactabilidadContact();
      this.totalAgendamientosContact();
      this.totalDerivacionesContact();
      this.totalGestionesPorSedeYTipoCliente();
      this.totalGestionesPorAsesorYTipoCliente();
      this.graficoData();
    } catch (error) {
      console.error('Error al cargar datos iniciales:', error);
    } finally {
      this.isLoading = false; // 🔹 ocultar loading al terminar
    }

    this.limpiarTimers();

    // Mantener la programación de actualización cada media hora con voz
    this.programarActualizacionCadaMediaHora();

    // 🔹 Nueva programación: refresco cada 5 min
    this.programarActualizacionCadaCincoMinutos();
  }

  ngOnDestroy() {
    this.limpiarTimers();
  }

  limpiarTimers() {
    if (this.timeoutMediaHora) {
      clearTimeout(this.timeoutMediaHora);
      this.timeoutMediaHora = null;
    }

    if (this.intervaloMediaHora) {
      clearInterval(this.intervaloMediaHora);
      this.intervaloMediaHora = null;
    }

    if (this.intervaloCincoMin) {
      clearInterval(this.intervaloCincoMin);
      this.intervaloCincoMin = null;
    }
  }

  programarActualizacionCadaMediaHora() {
    const ahora = new Date();
    const siguiente = new Date(ahora);

    // Si estamos en la primera media hora (ej. 10:10 → 10:30)
    if (ahora.getMinutes() < 30) {
      siguiente.setMinutes(30, 0, 0);
    } else {
      siguiente.setHours(ahora.getHours() + 1, 0, 0, 0);
    }

    const tiempoEspera = siguiente.getTime() - ahora.getTime();

    // ✅ limpiar timers anteriores para evitar duplicados
    if (this.timeoutMediaHora) clearTimeout(this.timeoutMediaHora);
    if (this.intervaloMediaHora) clearInterval(this.intervaloMediaHora);

    this.timeoutMediaHora = setTimeout(() => {
      this.ejecutarActualizacionYVoz();

      // luego repetir cada 30 minutos
      this.intervaloMediaHora = setInterval(() => {
        this.ejecutarActualizacionYVoz();
      }, 30 * 60 * 1000);

    }, tiempoEspera);
  }

  programarActualizacionCadaCincoMinutos() {
    // ✅ solo 1 intervalo activo
    if (this.intervaloCincoMin) clearInterval(this.intervaloCincoMin);

    this.intervaloCincoMin = setInterval(() => {
      console.log("🔄 Actualización automática cada 5 minutos");
      this.actualizar();
    }, 5 * 60 * 1000);
  }

  async ejecutarActualizacionYVoz() {
    await this.actualizar();
    this.leerAvance();
  }

  private getNombreParaVoz(nombreCompleto: string): string {
    const normalizado = nombreCompleto.trim().toUpperCase();

    // Casos especiales
    if (normalizado === "ACOSTA JIMENEZ MARIELA NATALY") {
      return "Nataly";
    }
    if (normalizado === "PÉREZ TINEO MARICIELO TATIANA") {
      return "Tatiana";
    }
    if (normalizado === "RIVAS PURISACA KAREN YUDITH") {
      return "Yudith";
    }

    // Caso general → primer nombre
    const partes = normalizado.split(" ");
    if (partes.length > 1) {
      return this.capitalize(partes[2] ?? partes[0]); // normalmente 3er valor es primer nombre
    }

    return this.capitalize(partes[0]);
  }

  private capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }

  // 🔹 Aquí generamos el mensaje de voz
  leerAvance() {
    if (!('speechSynthesis' in window)) {
      console.warn('Tu navegador no soporta SpeechSynthesis');
      return;
    }

    let mensaje = 'Reporte actualizado. ';
    this.dataContactabilidad.forEach(item => {
      const nombre = this.getNombreParaVoz(item['ASESOR CONTACT']);
      mensaje += `${nombre} tiene ${item['CONTACTO']} contactos de ${item['TOTAL']} gestiones. `;
    });

    // 🔹 Agregamos total de derivaciones
    mensaje += `En total van ${this.totalDerivaciones} derivaciones. `;

    const utterance = new SpeechSynthesisUtterance(mensaje);
    utterance.lang = 'es-PE'; // o prueba 'es-MX', 'es-PE'
    utterance.rate = 1;       // velocidad de lectura
    utterance.pitch = 1;      // tono
    speechSynthesis.speak(utterance);
  }

  // 🔹 Método para obtener fecha seleccionada en formato numérico
  private obtenerFechaSeleccionada(): { dia: number; mes: number; anio: number } | null {
    const fecha: Date = this.formCierreGestion.value.fechaGestion;
    if (!fecha) return null;

    return {
      dia: fecha.getDate(),
      mes: fecha.getMonth() + 1,
      anio: fecha.getFullYear()
    };
  }

  // 🔹 Método reutilizable para comparar fechas
  private esMismaFecha(marcaTemporal: string, dia: number, mes: number, anio: number): boolean {
    if (!marcaTemporal || !marcaTemporal.includes('/')) return false;

    const [diaStr, mesStr, anioStr] = marcaTemporal.split(' ')[0].split('/');
    const diaExcel = parseInt(diaStr, 10);
    const mesExcel = parseInt(mesStr, 10);
    const anioExcel = parseInt(anioStr, 10);

    return (
      diaExcel === dia &&
      mesExcel === mes &&
      anioExcel === anio
    );
  }

  totalContactabilidadContact() {
    const fechaSeleccionada = this.obtenerFechaSeleccionada();

    if (!fechaSeleccionada) {
      this.dataContactabilidad = [];
      return;
    }

    const { dia, mes, anio } = fechaSeleccionada;
    const resultado: any[] = [];

    this.asesores1.filter(a => a.value !== '').forEach(asesor => {
      const registrosAsesor = this.dataOriginal.filter(item => {
        return (
          item['ASESOR CONTACT']?.toUpperCase().trim() === asesor.viewValue.toUpperCase().trim() &&
          this.esMismaFecha(item['Marca temporal'], dia, mes, anio)
        );
      });

      // Filtrar los de estado CONTACTO
      const registrosContacto = registrosAsesor.filter(r => r['ESTADO DE GESTIÓN'] === 'CONTACTO');

      // Cortas llamadas dentro de los CONTACTO
      const cortaLlamada = registrosContacto.filter(
        r => r['MOTIVO NO INTERÉS'] === 'CORTA LLAMADA'
      ).length;

      // Contactos válidos = contactos totales - cortas llamadas
      const contacto = registrosContacto.length - cortaLlamada;

      // No contacto se mantiene igual
      const noContacto = registrosAsesor.filter(r => r['ESTADO DE GESTIÓN'] === 'NO CONTACTO').length;

      // Total = contactos válidos + no contacto
      const total = contacto + cortaLlamada + noContacto;

      // Porcentaje sobre total
      const porcentaje = total > 0 ? (contacto / total) : 0;

      resultado.push({
        'ASESOR ID': asesor.value,
        'ASESOR CONTACT': asesor.viewValue,
        'CONTACTO': contacto,
        'CORTA LLAMADA': cortaLlamada,
        'NO CONTACTO': noContacto,
        'TOTAL': total,
        'PORCENTAJE': porcentaje
      });
    });

    this.dataContactabilidad = resultado;

    const sumaTotalContactos = resultado.reduce((acc, curr) => acc + (curr['CONTACTO'] || 0), 0);
    const sumaTotalGestion = resultado.reduce((acc, curr) => acc + (curr['TOTAL'] || 0), 0);

    this.porcentajeTotalContactabilidad = sumaTotalGestion > 0
      ? Math.round((sumaTotalContactos / sumaTotalGestion) * 100)
      : 0;
  }

  totalAgendamientosContact() {
    const fechaSeleccionada = this.obtenerFechaSeleccionada();

    if (!fechaSeleccionada) {
      this.dataAgendamientos = [];
      return;
    }

    const { dia, mes, anio } = fechaSeleccionada;
    const resultado: any[] = [];

    this.asesores1.filter(a => a.value !== '').forEach(asesor => {
      const registrosAsesor = this.dataOriginal.filter(item => {
        return (
          item['ASESOR CONTACT']?.toUpperCase().trim() === asesor.viewValue.toUpperCase().trim() &&
          this.esMismaFecha(item['Marca temporal'], dia, mes, anio) &&
          item['MOTIVO INTERÉS'] === 'CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)'
        );
      });

      const totalAgendamientos = registrosAsesor.length;
      const porcentajeMeta = this.agendamientoIndividual > 0
        ? Math.min((totalAgendamientos / this.agendamientoIndividual), 1)
        : 0;

      resultado.push({
        'ASESOR ID': asesor.value,
        'ASESOR CONTACT': asesor.viewValue,
        'AGENDAMIENTO': totalAgendamientos,
        'META': porcentajeMeta
      });
    });

    this.dataAgendamientos = resultado;

    const totalAgendamientos = this.dataAgendamientos.reduce((acc, item) => acc + (item.AGENDAMIENTO || 0), 0);
    this.porcentajeMetaAgendamiento = Math.min(Math.round((totalAgendamientos / this.metaAgendamientoEquipo) * 100), 100);
  }

  totalDerivacionesContact() {
    const fechaSeleccionada = this.obtenerFechaSeleccionada();

    if (!fechaSeleccionada) {
      this.dataDerivaciones = [];
      return;
    }

    const { dia, mes, anio } = fechaSeleccionada;
    const motivosValidos = [
      'VENTA DERIVADA PARA CIERRE A SEDE',
      'VISITARÁ TIENDA',
      'SE ENVIÓ A ASESOR VISITA A DOMICILIO'
    ];

    const resultado: any[] = [];

    this.asesores1.filter(a => a.value !== '').forEach(asesor => {
      const registrosAsesor = this.dataOriginal.filter(item => {
        const esAsesor = item['ASESOR CONTACT']?.toUpperCase().trim() === asesor.viewValue.toUpperCase().trim();
        const esFecha = this.esMismaFecha(item['Marca temporal'], dia, mes, anio);
        const esMotivoValido = motivosValidos.includes(item['MOTIVO INTERÉS']);

        return esAsesor && esFecha && esMotivoValido;
      });

      const totalDerivaciones = registrosAsesor.length;
      const porcentajeMeta = this.derivacionesIndividual > 0
        ? Math.min((totalDerivaciones / this.derivacionesIndividual), 1)
        : 0;

      resultado.push({
        'ASESOR ID': asesor.value,
        'ASESOR CONTACT': asesor.viewValue,
        'DERIVACION': totalDerivaciones,
        'META': porcentajeMeta
      });
    });

    this.dataDerivaciones = resultado;

    const totalDerivaciones = this.dataDerivaciones.reduce((acc, item) => acc + (item.DERIVACION || 0), 0);
    this.porcentajeMetaDerivacion = this.metaDerivacionEquipo > 0
      ? Math.min(Math.round((totalDerivaciones / this.metaDerivacionEquipo) * 100), 100)
      : 0;
  }

  // totalGestionesPorSede() {
  //   const fechaSeleccionada = this.obtenerFechaSeleccionada();

  //   if (!fechaSeleccionada) {
  //     this.dataGestionPorAsesor = [];
  //     return;
  //   }

  //   const { dia, mes, anio } = fechaSeleccionada;
  //   const resultado: any[] = [];

  //   // obtener sedes únicas
  //   const sedesUnicas = Array.from(new Set(this.dataOriginal.map(item => item['SEDE'])));

  //   sedesUnicas.forEach(sede => {
  //     const registrosSede = this.dataOriginal.filter(item => {
  //       return (
  //         item['SEDE']?.toUpperCase().trim() === sede?.toUpperCase().trim() &&
  //         this.esMismaFecha(item['Marca temporal'], dia, mes, anio)
  //       );
  //     });

  //     const totalGestiones = registrosSede.length;

  //     // 👇 solo agregar si tiene gestiones
  //     if (totalGestiones > 0) {
  //       resultado.push({
  //         SEDE: sede,
  //         GESTION: totalGestiones
  //       });
  //     }
  //   });

  //   this.dataGestionPorAsesor = resultado;
  // }

  // 🔹 Nuevo método: obtener gestiones por SEDE y TIPO DE CLIENTE
  totalGestionesPorSedeYTipoCliente() {
    const fechaSeleccionada = this.obtenerFechaSeleccionada();

    if (!fechaSeleccionada) {
      this.dataGestionPorSedeYCliente = [];
      return;
    }

    const { dia, mes, anio } = fechaSeleccionada;
    const resultado: any[] = [];

    // obtener sedes únicas
    const sedesUnicas = Array.from(
      new Set(this.dataOriginal.map(item => item['SEDE']?.toUpperCase().trim()))
    );

    sedesUnicas.forEach(sede => {
      // filtrar registros por sede y fecha
      const registrosSede = this.dataOriginal.filter(item =>
        item['SEDE']?.toUpperCase().trim() === sede &&
        this.esMismaFecha(item['Marca temporal'], dia, mes, anio)
      );

      if (registrosSede.length > 0) {
        const fila: any = {
          SEDE: sede,
          VIGENTE: 0,
          "NO VIGENTE": 0,
          BRILLA: 0,
          EFECTIVA: 0,
          DORMIDO: 0,
          NUEVO: 0,
          CANCELADO: 0,
          "LOVER A": 0,
          "LOVER B": 0,
          REENGANCHE: 0,
          TOTAL: 0
        };

        // contar gestiones por cada tipo de cliente en esa sede
        registrosSede.forEach(item => {
          const tipo = item['TIPO DE CLIENTE']?.toUpperCase().trim();
          if (fila.hasOwnProperty(tipo)) {
            fila[tipo]++;
          }
          fila.TOTAL++;
        });

        resultado.push(fila);
      }
    });

    this.dataGestionPorSedeYCliente = resultado;

    console.log("Resultado final:", resultado);
  }

  totalGestionesPorAsesorYTipoCliente() {
    const fechaSeleccionada = this.obtenerFechaSeleccionada();
    if (!fechaSeleccionada) {
      this.dataGestionPorAsesorYCliente = [];
      return;
    }

    const { dia, mes, anio } = fechaSeleccionada;
    const resultado: any[] = [];

    // 👉 obtener asesores únicos de los datos originales
    const asesoresUnicos = Array.from(
      new Set(this.dataOriginal.map(item => item['ASESOR CONTACT']?.toUpperCase().trim()))
    ).filter(a => a); // quitar null/undefined

    asesoresUnicos.forEach(asesor => {
      // 👉 filtrar registros por asesor y fecha
      const registrosAsesor = this.dataOriginal.filter(item =>
        item['ASESOR CONTACT']?.toUpperCase().trim() === asesor &&
        this.esMismaFecha(item['Marca temporal'], dia, mes, anio)
      );

      if (registrosAsesor.length > 0) {
        const fila: any = {
          ASESOR: asesor,
          VIGENTE: 0,
          "NO VIGENTE": 0,
          BRILLA: 0,
          EFECTIVA: 0,
          DORMIDO: 0,
          NUEVO: 0,
          CANCELADO: 0,
          "LOVER A": 0,
          "LOVER B": 0,
          REENGANCHE: 0,
          TOTAL: 0
        };

        // 👉 contar gestiones por cada tipo de cliente en ese asesor
        registrosAsesor.forEach(item => {
          const tipo = item['TIPO DE CLIENTE']?.toUpperCase().trim();
          if (fila.hasOwnProperty(tipo)) {
            fila[tipo]++;
          }
          fila.TOTAL++;
        });

        resultado.push(fila);
      }
    });

    this.dataGestionPorAsesorYCliente = resultado;
    console.log("Resultado por asesor y tipo de cliente:", resultado);
  }


  graficoData() {
    this.totalContactados = this.dataContactabilidad.reduce((acc, val) => acc + (val.CONTACTO || 0), 0);
    const totalAgendamientos = this.dataAgendamientos.reduce((acc, val) => acc + (val.AGENDAMIENTO || 0), 0);
    const totalDerivaciones = this.dataDerivaciones.reduce((acc, val) => acc + (val.DERIVACION || 0), 0);

    this.totalInteresados = totalAgendamientos + totalDerivaciones;
    this.totalDerivaciones = totalDerivaciones;

    this.dataGrafico = [
      { categoria: 'CONTACTADOS', valor: this.totalContactados, color: '#76d945' },
      { categoria: 'INTERESADOS', valor: this.totalInteresados, color: '#c6ce00' },
      { categoria: 'DERIVADOS', valor: this.totalDerivaciones, color: '#734222' }
    ];
  }

  onChartInit(e: any) {
    const chartInstance = e.component;

    chartInstance.option('customizePoint', function (pointInfo: any) {
      return {
        color: pointInfo.data.color
      };
    });

    chartInstance.refresh(); // aplicar los cambios
  }

  get tituloGrafico(): string {
    const opciones = { day: '2-digit', month: '2-digit', year: 'numeric' };
    const fechaSelecionada = this.formCierreGestion.controls['fechaGestion'].value;
    const fechaFormateada = fechaSelecionada.toLocaleDateString('es-ES', opciones);
    return `GESTIÓN DIARIA CONTACT CENTER LEONCITO - ${fechaFormateada}`;
  }

  get tituloGraficoVentasDiarias(): string {
    return `VENTA DIARIA - SEMANAL`;
  }

  async actualizar() {
    this.isLoading = true;

    try {
      // 🔄 Volver a obtener los datos desde Google Sheets
      this.dataOriginal = await lastValueFrom(this.service.getSheetData());

      // Luego procesar los nuevos datos
      this.totalContactabilidadContact();
      this.totalAgendamientosContact();
      this.totalDerivacionesContact();
      this.totalGestionesPorSedeYTipoCliente();
      this.totalGestionesPorAsesorYTipoCliente();
      this.graficoData();
    } catch (error) {
      console.error('Error al actualizar datos:', error);
    } finally {
      this.isLoading = false;
    }
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
        EstadoVenta: row['EstadoVenta']
      }));

      this.filtroVentas = [...this.dataVentas];
      this.generarChartData();
      this.calculosProyeccion();
      this.generarChartMontoPorDia();
    };

    reader.readAsArrayBuffer(file);
  }

  calculosProyeccion(): void {
    const hoy = new Date();
    const diaHoy = hoy.getDate();
    const mesHoy = hoy.getMonth();
    const anioHoy = hoy.getFullYear();
    const diasMesActual = new Date(anioHoy, mesHoy + 1, 0).getDate();
    const diasTranscurridos = diaHoy - 1;

    this.totalVentas = this.filtroVentas.length;
    this.totalMontoVentas = Math.round(this.filtroVentas.reduce((sum, v) => sum + v.MontoConsolidado, 0));
    this.ticket = this.totalVentas ? Math.round(this.totalMontoVentas / this.totalVentas) : 0;
    const ticketDiario = diasTranscurridos > 0 ? this.totalMontoVentas / diasTranscurridos : 0;
    this.proyeccion = Math.round(ticketDiario * diasMesActual);
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

  generarChartData(): void {
    const agrupado = new Map<string, number>();

    for (const venta of this.filtroVentas) {
      const asesor = (venta.AsesorVenta || '').toString().trim();
      const monto = venta.MontoConsolidado || 0;

      if (agrupado.has(asesor)) {
        agrupado.set(asesor, agrupado.get(asesor)! + monto);
      } else {
        agrupado.set(asesor, monto);
      }
    }

    this.chartData = Array.from(agrupado, ([id, MontoTotal]) => {
      return { AsesorVenta: id, MontoTotal: Math.round(MontoTotal) };
    }).sort((a, b) => b.MontoTotal - a.MontoTotal);
  }

  generarChartMontoPorDia(): void {
    const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const agrupado = new Map<string, Map<string, number>>();
    const semanasSet = new Set<string>();

    for (const venta of this.filtroVentas) {
      const fecha = new Date(venta.FECHAVENTA);
      const diaTexto = diasSemana[fecha.getDay()];
      const semanaIso = this.getSemanaISO(fecha);
      const monto = venta.MontoConsolidado || 0;

      semanasSet.add(semanaIso);

      if (!agrupado.has(diaTexto)) {
        agrupado.set(diaTexto, new Map());
      }

      const semanaMap = agrupado.get(diaTexto)!;
      semanaMap.set(semanaIso, Math.round((semanaMap.get(semanaIso) || 0) + monto));
    }

    // Ordenar semanas y generar alias: Semana 1, Semana 2, ...
    const semanasOrdenadas = Array.from(semanasSet).sort();
    this.semanas = semanasOrdenadas.map((semanaIso, index) => {
      const nombre = `Semana ${index + 1}`;
      this.semanaMap.set(semanaIso, nombre);
      return nombre;
    });

    // Construir chartPorDia con nombres amigables
    this.chartPorDia = diasSemana.map(dia => {
      const semanaMap = agrupado.get(dia) || new Map();
      const result: any = { Dia: dia };

      for (const [semanaIso, monto] of semanaMap.entries()) {
        const semanaNombre = this.semanaMap.get(semanaIso);
        if (monto !== undefined && monto !== 0 && semanaNombre) {
          result[semanaNombre] = monto;
        }
      }

      return result;
    });
  }

  getSemanaISO(date: Date): string {
    const tmp = new Date(date.getTime());
    tmp.setHours(0, 0, 0, 0);

    tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));

    const firstThursday = new Date(tmp.getFullYear(), 0, 4);
    firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));

    const weekNumber = 1 + Math.round(((tmp.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getDay() + 6) % 7)) / 7);

    return `${tmp.getFullYear()}-W${weekNumber.toString().padStart(2, '0')}`;
  }

  onCellPrepared(e: any) {
    if (e.rowType === 'header') {
      e.cellElement.style.padding = '8px';
      e.cellElement.style.backgroundColor = '#293964';
      e.cellElement.style.color = 'white';
      e.cellElement.style.textAlign = 'center';
      e.cellElement.style.fontWeight = 'bold';
      e.cellElement.style.whiteSpace = 'normal';
      e.cellElement.style.height = 'auto';
      e.cellElement.style.border = '1.5px solid black';
    }

    if (e.rowType === 'data') {
      e.cellElement.style.border = '1px solid #ccc';
      e.cellElement.style.textAlign = 'center';
      e.cellElement.style.fontWeight = 'bold';

      if (e.column?.dataField === 'PORCENTAJE') {
        const valor = e.value * 100
        if (valor > 85) {
          e.cellElement.style.backgroundColor = '#4CAF50'; // verde
          e.cellElement.style.color = 'black';
        } else if (valor >= 50 && valor <= 85) {
          e.cellElement.style.backgroundColor = '#FFEB3B'; // amarillo
          e.cellElement.style.color = 'black';
        } else if (valor < 50) {
          e.cellElement.style.backgroundColor = '#d68e3bff'; // marrón
          e.cellElement.style.color = 'black';
        }
      }
    }

    if (e.column?.dataField === 'META') {
      const valor = e.value * 100;
      if (valor > 85) {
        e.cellElement.style.backgroundColor = '#4CAF50';
        e.cellElement.style.color = 'black';
      } else if (valor >= 50 && valor <= 85) {
        e.cellElement.style.backgroundColor = '#FFEB3B';
        e.cellElement.style.color = 'black';
      } else if (valor < 50) {
        e.cellElement.style.backgroundColor = '#d68e3bff';
        e.cellElement.style.color = 'black';
      }
    }
  }

}
