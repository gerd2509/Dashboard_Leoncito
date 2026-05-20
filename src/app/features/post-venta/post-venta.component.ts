import { Component, inject, OnInit } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { SheetsService } from '../../services/service-google.service';

@Component({
  selector: 'app-post-venta',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './post-venta.component.html',
  styleUrl: './post-venta.component.css'
})
export class PostVentaComponent implements OnInit {
  protected service = inject(SheetsService);
  formPostVentas: UntypedFormGroup;
  protected showFilterRow: boolean = true;
  protected currentFilter: string = 'auto';

  dataPostVenta: any[] = [];
  dataResumen: any[] = [];

  // --- Gráficos Originales ---
  chartAreas: any[] = [];
  chartEstadoGestion: any[] = [];
  chartSatisfaccion: any[] = [];
  chartConformidad: any[] = [];

  // --- Gráficos Detalle ---
  dataMensual: any[] = [];
  dataMotivosNoContacto: any[] = [];
  dataAreasNoConforme: any[] = [];
  dataDistribucionSatisfaccion: any[] = [];

  // 👇 NUEVO: Variable para el gráfico de Áreas No Conforme por Mes (Formato Plano) 👇
  dataNCMensualFlat: any[] = [];

  // --- Popup ---
  popupGraficoVisible: boolean = false;
  graficoSeleccionado: string = '';
  tituloPopup: string = '';
  isLoading = false;

  dataFiltradaGrid: any[] = [];

  constructor(private fb: UntypedFormBuilder) {
    this.formPostVentas = this.fb.group({
      fechaInicio: [null, Validators.required],
      fechaFin: [null, Validators.required],
    });
  }

  async ngOnInit() {
    this.isLoading = true;
    try {
      await this.cargarDataSheet();
      this.actualizarFiltros(); // Carga inicial
    } catch (error) {
      console.error(error);
    } finally {
      this.isLoading = false;
    }
  }

  async cargarDataSheet() {
    try {
      this.dataPostVenta = await lastValueFrom(this.service.getSheetDataPostVenta());
    } catch (error) {
      console.error(error);
    }
  }

  actualizarFiltros() {
    if (!this.dataPostVenta || this.dataPostVenta.length === 0) return;

    // 2. Ejecutamos el filtro
    const dataFiltrada = this.filtrarPorFecha(this.dataPostVenta);

    // 3. ASIGNAMOS la data filtrada al Grid y a los demás procesos
    this.dataFiltradaGrid = dataFiltrada; // <--- Esta es la clave para el HTML
    this.dataResumen = this.procesarDatosPostVentaFiltrada(dataFiltrada);
    this.chartAreas = this.generarGraficoAreasFiltrado(dataFiltrada);
    this.chartEstadoGestion = this.generarGraficoEstadoGestionFiltrado(dataFiltrada);
    this.chartSatisfaccion = this.generarGraficoSatisfaccionFiltrado(dataFiltrada);
    this.chartConformidad = this.generarGraficoConformidadFiltrado(dataFiltrada);

    // Análisis Avanzado (Detalle mensual y popups)
    this.procesarDetalleAvanzado(dataFiltrada);
  }

  private filtrarPorFecha(data: any[]): any[] {
    const { fechaInicio, fechaFin } = this.formPostVentas.value;

    // Si no hay rango seleccionado, mostramos toda la data (o podrías dejar tu lógica de 'hoy')
    if (!fechaInicio || !fechaFin) {
      return data;
    }

    // Normalizamos las fechas de búsqueda para comparar solo días
    const inicio = new Date(fechaInicio);
    inicio.setHours(0, 0, 0, 0);

    const fin = new Date(fechaFin);
    fin.setHours(23, 59, 59, 999);

    return data.filter(item => {
      const marca = item['Timestamp'];
      if (!marca) return false;

      // Convertimos el string del Excel/Sheet a objeto Date
      // Si tu formato es MM/DD/YYYY:
      const [fechaParte] = marca.split(' ');
      const [mes, dia, anio] = fechaParte.split('/');
      const fechaItem = new Date(+anio, +mes - 1, +dia);

      return fechaItem >= inicio && fechaItem <= fin;
    });
  }

  private esMismaFecha(marcaTemporal: string, dia: number, mes: number, anio: number): boolean {
    if (!marcaTemporal) return false;
    const [mesStr, diaStr, anioStr] = marcaTemporal.split(' ')[0].split('/');
    return parseInt(diaStr) === dia && parseInt(mesStr) === mes && parseInt(anioStr) === anio;
  }

  procesarDatosPostVentaFiltrada(data: any[]): any[] {
    if (!data || data.length === 0) return [];
    let contacto = 0, noContacto = 0, conforme = 0, noConforme = 0;
    const areasMap = new Map<string, number>();
    const satisfacciones: number[] = [];

    data.forEach((item: any) => {
      const estado = (item["ESTADO DE GESTIÓN"] || "").toString().trim().toUpperCase();
      if (estado === "CONTACTO") contacto++; else if (estado === "NO CONTACTO") noContacto++;

      const conformidad = (item["CONFORMIDAD CLIENTE"] || "").toString().trim().toUpperCase();
      if (conformidad === "CONFORME") conforme++; else if (conformidad === "NO CONFORME") noConforme++;

      const area = (item["AREA CORRESPONDIENTE"] || "").toString().trim();
      if (area) areasMap.set(area, (areasMap.get(area) || 0) + 1);

      const satisf = parseFloat(item["NIVEL SATISFACCIÓN"]);
      if (!isNaN(satisf)) satisfacciones.push(satisf);
    });

    const totalAreasValidas = Array.from(areasMap.values()).reduce((a, b) => a + b, 0);
    const areaPrincipal = Array.from(areasMap.entries()).sort((a, b) => b[1] - a[1])[0] || ["-", 0];
    const promedioSatisf = satisfacciones.length > 0 ? (satisfacciones.reduce((a, b) => a + b, 0) / satisfacciones.length).toFixed(1) : "0";

    return [{
      contacto, noContacto, conforme, noConforme,
      area: areaPrincipal[0],
      porcentajeArea: totalAreasValidas > 0 ? ((areaPrincipal[1] / totalAreasValidas) * 100).toFixed(0) : "0",
      satisfaccion: promedioSatisf
    }];
  }

  // --- Generadores de Gráficos Simples ---
  generarGraficoAreasFiltrado(data: any[]): any[] {
    const dataFiltrada = this.filtrarPorFecha(data);
    const areasMap = new Map<string, number>();
    dataFiltrada.forEach((item: any) => {
      const area = (item["AREA CORRESPONDIENTE"] || "").toString().trim();
      if (area) areasMap.set(area, (areasMap.get(area) || 0) + 1);
    });
    return Array.from(areasMap, ([area, cantidad]) => ({ area, cantidad }));
  }
  generarGraficoEstadoGestionFiltrado(data: any[]): any[] {
    const dataFiltrada = this.filtrarPorFecha(data);
    let contacto = 0, noContacto = 0;
    dataFiltrada.forEach((item: any) => {
      const estado = (item["ESTADO DE GESTIÓN"] || "").toString().trim().toUpperCase();
      if (estado === "CONTACTO") contacto++; else if (estado === "NO CONTACTO") noContacto++;
    });
    return [{ tipo: "CONTACTO", cantidad: contacto }, { tipo: "NO CONTACTO", cantidad: noContacto }];
  }
  generarGraficoConformidadFiltrado(data: any[]): any[] {
    const dataFiltrada = this.filtrarPorFecha(data);
    let conforme = 0, noConforme = 0;
    dataFiltrada.forEach((item: any) => {
      const conformidad = (item["CONFORMIDAD CLIENTE"] || "").toString().trim().toUpperCase();
      if (conformidad === "CONFORME") conforme++; else if (conformidad === "NO CONFORME") noConforme++;
    });
    return [{ tipo: "CONFORME", cantidad: conforme }, { tipo: "NO CONFORME", cantidad: noConforme }];
  }
  generarGraficoSatisfaccionFiltrado(data: any[]): any[] {
    const dataFiltrada = this.filtrarPorFecha(data);
    const datos: any[] = [];
    dataFiltrada.forEach((item: any, index: number) => {
      const nivel = parseFloat(item["NIVEL SATISFACCIÓN"]);
      if (!isNaN(nivel)) datos.push({ indice: index + 1, nivel });
    });
    return datos;
  }

  // --- Lógica Avanzada ---
  procesarDetalleAvanzado(data: any[]) {
    const mapMensual = new Map<string, any>();
    const mapMotivos = new Map<string, number>();
    const mapAreasNC = new Map<string, number>();
    const mapSat = new Map<string, number>();

    // 👇 Mapa para el NUEVO GRÁFICO (Evolución Areas No Conforme)
    // Clave: "Mes_Area", Valor: Cantidad
    const mapEvolucionAreas = new Map<string, any>();

    const mesesNombres = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

    data.forEach(item => {
      const timestamp = item['Timestamp'];
      if (!timestamp) return;
      const partes = timestamp.split(' ')[0].split('/');
      if (partes.length < 3) return;

      const mesIndex = parseInt(partes[0]) - 1;
      const anio = partes[2];
      const keyMes = `${anio}-${mesIndex.toString().padStart(2, '0')}`; // Orden
      const labelMes = `${mesesNombres[mesIndex]} ${anio}`; // Visual

      // 1. Mensual General
      if (!mapMensual.has(keyMes)) mapMensual.set(keyMes, { orden: keyMes, mes: labelMes, contacto: 0, noContacto: 0, conforme: 0, noConforme: 0 });
      const statMes = mapMensual.get(keyMes);

      // --- Gestión ---
      const gestion = (item["ESTADO DE GESTIÓN"] || "").toString().trim().toUpperCase();
      if (gestion === "CONTACTO") statMes.contacto++;
      else if (gestion === "NO CONTACTO") {
        statMes.noContacto++;
        const motivo = (item["MOTIVO NO CONTACTO"] || "Sin Motivo").toString().trim();
        mapMotivos.set(motivo, (mapMotivos.get(motivo) || 0) + 1);
      }

      // --- Conformidad ---
      const conformidad = (item["CONFORMIDAD CLIENTE"] || "").toString().trim().toUpperCase();
      if (conformidad === "CONFORME") statMes.conforme++;
      else if (conformidad === "NO CONFORME") {
        statMes.noConforme++;

        // Área General
        const area = (item["AREA CORRESPONDIENTE"] || "Sin Área").toString().trim();
        mapAreasNC.set(area, (mapAreasNC.get(area) || 0) + 1);

        // 👇 Lógica para el gráfico NUEVO: Áreas por Mes (Plano para SeriesTemplate)
        const keyEvolucion = `${keyMes}|${area}`;
        if (!mapEvolucionAreas.has(keyEvolucion)) {
          mapEvolucionAreas.set(keyEvolucion, {
            orden: keyMes,
            mes: labelMes,
            area: area,
            cantidad: 0
          });
        }
        mapEvolucionAreas.get(keyEvolucion).cantidad++;
      }

      // --- Satisfacción ---
      const nivel = item["NIVEL SATISFACCIÓN"];
      if (nivel) {
        const k = nivel.toString().trim();
        mapSat.set(k, (mapSat.get(k) || 0) + 1);
      }
    });

    this.dataMensual = Array.from(mapMensual.values()).sort((a, b) => a.orden.localeCompare(b.orden));
    this.dataMotivosNoContacto = Array.from(mapMotivos, ([motivo, cantidad]) => ({ motivo, cantidad })).sort((a, b) => b.cantidad - a.cantidad);
    this.dataAreasNoConforme = Array.from(mapAreasNC, ([area, cantidad]) => ({ area, cantidad })).sort((a, b) => b.cantidad - a.cantidad);
    this.dataDistribucionSatisfaccion = Array.from(mapSat, ([nivel, cantidad]) => ({ nivel, cantidad })).sort((a, b) => parseFloat(a.nivel) - parseFloat(b.nivel));

    // 👇 Generar Data para el NUEVO GRÁFICO (Ordenada por fecha)
    this.dataNCMensualFlat = Array.from(mapEvolucionAreas.values())
      .sort((a, b) => a.orden.localeCompare(b.orden));
  }

  // --- Helpers ---
  customizeTooltip = (arg: any) => { return { text: `${arg.argumentText}: (${arg.percentText})` }; };
  customizeText = (point: any) => { return `${point.argument} (${point.value})`; };
  customizeLabelValue = (point: any) => { return `${point.value}`; }

  onCellPrepared(e: any) {
    if (e.rowType != 'header' || e.cellElement.classList.contains('dx-editor-cell')) return;
    e.cellElement.style.padding = "8px";
    e.cellElement.style.backgroundColor = "#293964";
    e.cellElement.style.color = "white";
    e.cellElement.style.textAlign = "center";
  }

  abrirGraficoEnGrande(tipo: string, titulo: string) {
    this.graficoSeleccionado = tipo;
    this.tituloPopup = titulo;
    this.popupGraficoVisible = true;
  }
}