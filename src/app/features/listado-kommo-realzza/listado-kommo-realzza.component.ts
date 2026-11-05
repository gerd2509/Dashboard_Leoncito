import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { DxDataGridComponent } from 'devextreme-angular';
import { custom } from 'devextreme/ui/dialog';
import { Workbook } from 'exceljs';
import * as FileSaver from 'file-saver';
import html2canvas from 'html2canvas';
import { CargaVentasService } from '../../services/carga-ventas.service';
import { ExcelExportService } from '../../services/excel/excel.service';
import { SheetsService } from '../../services/service-google.service';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';
import { AuditoriaKommoService, LoteAuditoria, LeadAuditoria, ResultadoAuditoria } from '../../services/auditoria-kommo.service';
import { tiendaDeSedeRealzza } from '../../shared/canal-usuario';

type TiendaRealzza = 'REALZZA' | 'REALZZA PIURA' | 'REALZZA LIMA';

interface FilaLead {
  id: number; nombre_cliente: string; embudo: string; estado: string; responsable: string; etiquetas: string;
  fecha_creacion: string; ultima_modificacion: string; modificado_por: string; respondido: boolean;
}

interface ResumenEmbudo {
  embudo: string; total: number; respondidos: number; noRespondidos: number; pctRespondidos: number;
}

interface ColDia { key: string; dia: number; }
interface FilaPivotEmbudo { embudo: string; valores: Record<string, number>; total: number; }
interface PivotLeadsDia { cols: ColDia[]; filas: FilaPivotEmbudo[]; totales: Record<string, number>; totalGeneral: number; }

// Mismo formato que el embudo de "Embudos de Gestión" (ASIGNADOS → CONTACTADOS →
// GESTIONADOS → INTERESADOS → DERIVADOS → TOTAL VENTAS), para mostrarlo acá también.
interface EtapaFunnel { nombre: string; op: number; ratio: number; codigo: string; }
interface EmbudoKommo { titulo: string; etapas: EtapaFunnel[]; }

interface DatosReporteTienda {
  tienda: TiendaRealzza; nombre: string; totalLeads: number; sinResponder: number;
  embudo: EmbudoKommo | null; pivot: PivotLeadsDia | null;
}

/**
 * "Listado Kommo Realzza": trae los leads del mes directo de la API de Kommo (botón
 * Sincronizar) y los lista con su embudo/estado/fechas/quién los modificó — para ver
 * de un vistazo quién está respondido y quién no. Solo Realzza (Chiclayo/Piura/Lima):
 * la cuenta de Kommo conectada es únicamente de Realzza, Call sigue con su Excel.
 */
@Component({
  selector: 'app-listado-kommo-realzza',
  standalone: true,
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES, LoadingOverlayComponent],
  templateUrl: './listado-kommo-realzza.component.html',
  styleUrl: './listado-kommo-realzza.component.css',
})
export class ListadoKommoRealzzaComponent implements OnInit, OnDestroy {
  private ventasSrv = inject(CargaVentasService);
  private excelSrv = inject(ExcelExportService);
  private auditSrv = inject(AuditoriaKommoService);
  private sheets = inject(SheetsService);

  @ViewChild('grid', { static: false }) grid!: DxDataGridComponent;
  @ViewChild('reporteModal', { static: false }) reporteModal?: ElementRef<HTMLElement>;

  form: UntypedFormGroup;
  tienda: TiendaRealzza = 'REALZZA';
  verTodo = false;
  isLoading = false;
  sincronizando = false;
  error = '';
  mensajeSync = '';

  filas: FilaLead[] = [];

  // Embudos que ya no deben salir en este listado (Ana Rut/Anyela/Nataly ya no gestionan
  // y "Embudo de ventas" es un embudo genérico, no de un asesor) — se filtran apenas
  // llega la data, así tampoco cuentan en los resúmenes por embudo/día de abajo.
  private readonly EMBUDOS_EXCLUIDOS = new Set(['ANA RUT', 'EMBUDO DE VENTAS', 'ANYELA I AV7', 'NATALY AV2']);

  readonly anios = [2025, 2026];
  readonly meses = [
    { v: 1, t: 'Enero' }, { v: 2, t: 'Febrero' }, { v: 3, t: 'Marzo' },
    { v: 4, t: 'Abril' }, { v: 5, t: 'Mayo' }, { v: 6, t: 'Junio' }, { v: 7, t: 'Julio' },
    { v: 8, t: 'Agosto' }, { v: 9, t: 'Septiembre' }, { v: 10, t: 'Octubre' },
    { v: 11, t: 'Noviembre' }, { v: 12, t: 'Diciembre' },
  ];

  constructor(private fb: UntypedFormBuilder) {
    const hoy = new Date();
    this.form = this.fb.group({ anio: [hoy.getFullYear()], mes: [hoy.getMonth() + 1] });
  }

  ngOnInit(): void { this.cargar(); }

  setTienda(t: TiendaRealzza): void {
    if (this.tienda === t) return;
    this.tienda = t;
    this.refrescarVistaActual();
  }

  /** Recarga lo que corresponda según la vista activa: el listado normal, o (si está
   *  en Auditoría) el histórico de lotes de la tienda/tabla elegida — cambiar de tienda
   *  o de mes mientras se está en Auditoría debe reflejarse ahí, no en el listado. */
  async refrescarVistaActual(): Promise<void> {
    if (this.mostrarAuditoria) {
      this.cerrarLote();
      await this.cargarLotes();
    } else {
      await this.cargar();
    }
  }

  setVerTodo(v: boolean): void {
    if (this.verTodo === v) return;
    this.verTodo = v;
    this.cargar();
  }

  async cargar(): Promise<void> {
    this.isLoading = true; this.error = '';
    try {
      const { anio, mes } = this.form.value;
      const filas = await lastValueFrom(this.verTodo
        ? this.ventasSrv.obtenerListadoLeadsKommo(undefined, undefined, this.tienda)
        : this.ventasSrv.obtenerListadoLeadsKommo(anio, mes, this.tienda));
      this.filas = filas.filter(f => !this.EMBUDOS_EXCLUIDOS.has((f.embudo || '').toString().trim().toUpperCase()));
    } catch (e) {
      console.error('Error al cargar el listado de Kommo:', e);
      this.error = 'No se pudo cargar el listado.';
      this.filas = [];
    } finally {
      this.isLoading = false;
    }
    await this.cargarEmbudoKommo();
  }

  // ═══════════════════ Embudo KOMMO (LEADS) — mismo formato que Embudos de Gestión ═══════════════════
  cargandoEmbudo = false;
  embudoKommo: EmbudoKommo | null = null;

  /** Arma el mismo embudo KOMMO (LEADS) que "Embudos de Gestión", para esta tienda/mes:
   *  ASIGNADOS/CONTACTADOS salen de los leads ya cargados (this.filas, sin el filtro de
   *  la grilla); GESTIONADOS/INTERESADOS de la gestión Kommo del mes; TOTAL VENTAS de las
   *  ventas Realzza con TipoBase=KOMMO, netas de NC en su mes de afectación (mismo
   *  criterio que el resto del dashboard). No aplica en "Ver todo" (no hay un solo mes). */
  private async cargarEmbudoKommo(): Promise<void> {
    this.embudoKommo = null;
    if (this.verTodo) return;
    const { anio, mes } = this.form.value;
    if (!anio || !mes) return;
    this.cargandoEmbudo = true;
    try {
      const [dataVentas, dataKommo] = await Promise.all([
        lastValueFrom(this.ventasSrv.obtenerVentasRealzzaModulo(anio)),
        lastValueFrom(this.sheets.getGestionKommo({ leadMes: mes, leadAnio: anio, canal: 'REALZZA', sede: this.tienda })),
      ]);
      const ventasTienda = (dataVentas || []).filter(v => tiendaDeSedeRealzza(v.sede) === this.tienda);
      this.embudoKommo = this.armarEmbudoKommo(this.filas, mes, anio, ventasTienda, dataKommo || []);
    } catch (e) {
      console.error('Error al cargar el embudo KOMMO:', e);
      this.embudoKommo = null;
    } finally {
      this.cargandoEmbudo = false;
    }
  }

  private armarEmbudoKommo(filas: FilaLead[], mes: number, anio: number, dataVentas: any[], dataKommo: any[]): EmbudoKommo {
    const esVentaKommo = (v: any) =>
      this.normTxt(v.tipo_base) === 'kommo' && (Number(v.monto_consolidado) || 0) > 0;
    const bruto = (dataVentas || []).filter(v => esVentaKommo(v) && +v.mes_cv === mes && +v.anio_cv === anio).length;
    const nc = (dataVentas || []).filter(v =>
      esVentaKommo(v) && this.esVentaReductora(v) && +v.mes_af === mes && +v.anio_af === anio).length;
    const ventasKommo = bruto - nc;

    const kommoMes = (dataKommo || [])
      .filter(r => this.fechaEnMes(r['FECHA DE LEAD ASIGNADO'], mes, anio))
      .filter(r => this.normTxt(r['MARKET PLACE R']) !== 'si');

    const asignados = filas.length;
    const contactados = filas.filter(f => (f.modificado_por ?? '').toString().trim() !== '').length;
    const gestionados = kommoMes.length;
    const interesados = kommoMes.filter(r => (r['RESULTADO DE GESTIÓN'] || '').toString().trim().toUpperCase() === 'INTERESADO').length;

    const ratio = (n: number) => (asignados > 0 ? Math.round((n / asignados) * 1000) / 10 : 0);
    const etapas: EtapaFunnel[] = [
      { nombre: 'ASIGNADOS', op: asignados, ratio: 100, codigo: '' },
      { nombre: 'CONTACTADOS', op: contactados, ratio: ratio(contactados), codigo: 'RCT/A' },
      { nombre: 'GESTIONADOS', op: gestionados, ratio: ratio(gestionados), codigo: 'RG/A' },
      { nombre: 'INTERESADOS', op: interesados, ratio: ratio(interesados), codigo: 'RI/A' },
      { nombre: 'DERIVADOS', op: ventasKommo, ratio: ratio(ventasKommo), codigo: 'RD/A' },
      { nombre: 'TOTAL VENTAS', op: ventasKommo, ratio: ratio(ventasKommo), codigo: 'RV/A' },
    ];
    return { titulo: 'KOMMO (LEADS)', etapas };
  }

  /** ¿Es una venta NOTA DE CRÉDITO/INCAUTACIÓN (resta en su mes de AFECTACIÓN, no en el
   *  de venta)? Mismo criterio que el resto del dashboard (Ventas Campo / Embudos). */
  private esVentaReductora(v: any): boolean {
    const est = (v.estado_venta || '').toString().toUpperCase();
    return est.includes('NOTA DE') || est.includes('INCAUTAC');
  }
  private normTxt(s: any): string {
    return (s ?? '').toString().toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  }
  /** ¿La fecha (d/m/yyyy | d.m.yyyy | yyyy-m-d) cae en el mes/año dados (ambos 1-based)? */
  private fechaEnMes(valor: any, mes: number, anio: number): boolean {
    if (!valor) return false;
    const s = valor.toString().trim().split(' ')[0];
    const p = s.split(/[\/.\-]/).map((x: string) => x.trim());
    if (p.length < 3) return false;
    let m: number, y: number;
    if (p[0].length === 4) { y = +p[0]; m = +p[1]; } else { m = +p[1]; y = +p[2]; }
    if (isNaN(m) || isNaN(y)) return false;
    return m === mes && y === anio;
  }

  anchoBarra(e: EtapaFunnel): number {
    return Math.min(100, Math.max(e.ratio, 4));
  }

  /** Igual que anchoBarra, pero con un mínimo mucho más generoso — para el embudo del
   *  Reporte, donde el nombre de la etapa va ADENTRO del bloque y debe caber siempre,
   *  incluso en los tramos más angostos (Gestionados/Interesados/Derivados/Ventas). */
  anchoBarraReporte(e: EtapaFunnel): number {
    return Math.min(100, Math.max(e.ratio, 55));
  }

  // Rampa ordinal de un solo tono (azul, claro→oscuro) para las 6 etapas del embudo:
  // además del largo, el color se va oscureciendo a medida que el embudo se angosta.
  private readonly RAMPA_ETAPAS = ['#86b6ef', '#6da7ec', '#5598e7', '#2a78d6', '#256abf', '#184f95'];
  colorEtapa(i: number): string {
    return this.RAMPA_ETAPAS[i] ?? this.RAMPA_ETAPAS[this.RAMPA_ETAPAS.length - 1];
  }

  private pollSyncTimeoutId: ReturnType<typeof setTimeout> | null = null;

  ngOnDestroy(): void {
    if (this.pollSyncTimeoutId) clearTimeout(this.pollSyncTimeoutId);
  }

  /** La sincronización corre en segundo plano en el servidor (una cuenta grande
   *  puede tardar varios minutos — demasiado para que la esperemos colgados de una
   *  sola petición HTTP). Acá solo la disparamos y luego consultamos su avance cada
   *  pocos segundos hasta que termine, sin bloquear la pantalla mientras tanto. */
  async sincronizar(): Promise<void> {
    this.sincronizando = true; this.error = ''; this.mensajeSync = 'Sincronización iniciada en segundo plano…';
    try {
      const { anio, mes } = this.form.value;
      await lastValueFrom(this.ventasSrv.sincronizarLeadsKommo(anio, mes));
      this.consultarAvanceSync();
    } catch (e: any) {
      console.error('Error al iniciar la sincronización con Kommo:', e);
      this.error = e?.error?.message || 'No se pudo iniciar la sincronización con Kommo.';
      this.sincronizando = false;
    }
  }

  private consultarAvanceSync(): void {
    this.ventasSrv.estadoSyncLeadsKommo().subscribe({
      next: async (st) => {
        if (st.enProgreso) {
          this.pollSyncTimeoutId = setTimeout(() => this.consultarAvanceSync(), 4000);
          return;
        }
        this.sincronizando = false;
        if (st.error) {
          this.error = st.error;
        } else if (st.resultado) {
          const r = st.resultado;
          this.mensajeSync = `Listo: ${r.filas} leads de Kommo (${r.insertados} nuevos, ${r.actualizados} actualizados).`;
        }
        await this.cargar();
      },
      error: (e) => {
        console.error('Error al consultar el avance de la sincronización:', e);
        this.sincronizando = false;
        this.error = 'No se pudo consultar el avance de la sincronización.';
      },
    });
  }

  /** Nombre base del archivo: tienda + (mes/año o "Todo"). */
  private nombreBase(prefijo: string): string {
    const { anio, mes } = this.form.value;
    const tiendaTxt = this.tienda === 'REALZZA PIURA' ? 'Piura' : this.tienda === 'REALZZA LIMA' ? 'Lima' : 'Chiclayo';
    const periodo = this.verTodo ? 'Todo' : `${this.meses.find(m => m.v === mes)?.t || mes} ${anio}`;
    return `${prefijo} ${tiendaTxt} - ${periodo}`.replace(/[\\/:*?"<>|]/g, '');
  }

  /** Exporta a Excel lo que se ve AHORA en la grilla — respeta la tienda (Chiclayo/
   *  Piura/Lima), el mes/año y cualquier filtro/búsqueda que tenga escrito en la grilla. */
  async exportar(): Promise<void> {
    if (!this.grid || !this.filas.length) return;
    await this.excelSrv.exportarDesdeGrid(this.nombreBase('Listado Kommo Realzza'), this.grid);
  }

  /** Exporta a Excel SEPARADO POR EMBUDO (asesor): un archivo .xlsx distinto por cada
   *  embudo, nombrado con el embudo, así se puede mandar el detalle de cada uno por
   *  separado. Respeta el mismo filtro/búsqueda activo en la grilla que el export general. */
  async exportarPorEmbudo(): Promise<void> {
    if (!this.grid || !this.filas.length) return;
    const store = this.grid.instance.getDataSource().store();
    const resultado: any = await store.load({ filter: this.grid.instance.getCombinedFilter() });
    const datos: FilaLead[] = Array.isArray(resultado) ? resultado : (resultado?.data || []);
    if (!datos.length) return;

    const porEmbudo = new Map<string, FilaLead[]>();
    for (const f of datos) {
      const clave = f.embudo || 'SIN EMBUDO';
      let lista = porEmbudo.get(clave);
      if (!lista) { lista = []; porEmbudo.set(clave, lista); }
      lista.push(f);
    }

    const columnas: { header: string; key: keyof FilaLead }[] = [
      { header: 'ID', key: 'id' },
      { header: 'Nombre del Cliente', key: 'nombre_cliente' },
      { header: 'Estado del Lead', key: 'estado' },
      { header: 'Etiquetas', key: 'etiquetas' },
      { header: 'Fecha Creación', key: 'fecha_creacion' },
      { header: 'Fecha Modificación', key: 'ultima_modificacion' },
      { header: 'Usuario que Modificó', key: 'modificado_por' },
      { header: 'Respondido', key: 'respondido' },
    ];

    const nombresUsados = new Set<string>();
    for (const [embudo, lista] of [...porEmbudo.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const wb = new Workbook();
      const ws = wb.addWorksheet('Leads');
      const hr = ws.addRow(columnas.map(c => c.header));
      hr.font = { bold: true };
      for (const f of lista) {
        ws.addRow(columnas.map(c => (c.key === 'respondido' ? (f.respondido ? 'Sí' : 'No') : (f as any)[c.key])));
      }
      ws.columns.forEach(col => { col.width = 20; });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      FileSaver.saveAs(blob, `${this.nombreArchivoValido(embudo, nombresUsados)}.xlsx`);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  /** Nombre de archivo válido para un embudo: sin caracteres inválidos, sin repetir
   *  uno ya usado en la misma exportación. */
  private nombreArchivoValido(embudo: string, usados: Set<string>): string {
    const base = `${this.nombreBase('Leads')} - ${embudo || 'SIN EMBUDO'}`.replace(/[\\/:*?"<>|]/g, '').trim();
    let final = base, i = 2;
    while (usados.has(final)) final = `${base} (${i++})`;
    usados.add(final);
    return final;
  }

  // ═══════════════════ Reporte general (3 tiendas en un solo documento) ═══════════════════
  generandoReporte = false;
  private readonly NOMBRE_TIENDA: Record<TiendaRealzza, string> = {
    'REALZZA': 'Realzza Chiclayo', 'REALZZA PIURA': 'Realzza Piura', 'REALZZA LIMA': 'Realzza Lima',
  };

  /** Trae leads + ventas + gestión Kommo de UNA tienda/mes y arma su embudo y su pivot de
   *  día × embudo, sin tocar el estado del componente (this.filas/this.tienda) — así se
   *  pueden pedir las 3 tiendas en paralelo para el reporte general. */
  private async datosReporteTienda(tienda: TiendaRealzza, anio: number, mes: number): Promise<DatosReporteTienda> {
    const [filasRaw, dataVentas, dataKommo] = await Promise.all([
      lastValueFrom(this.ventasSrv.obtenerListadoLeadsKommo(anio, mes, tienda)),
      lastValueFrom(this.ventasSrv.obtenerVentasRealzzaModulo(anio)),
      lastValueFrom(this.sheets.getGestionKommo({ leadMes: mes, leadAnio: anio, canal: 'REALZZA', sede: tienda })),
    ]);
    const filas = (filasRaw || []).filter(f => !this.EMBUDOS_EXCLUIDOS.has((f.embudo || '').toString().trim().toUpperCase()));
    const ventasTienda = (dataVentas || []).filter(v => tiendaDeSedeRealzza(v.sede) === tienda);
    return {
      tienda, nombre: this.NOMBRE_TIENDA[tienda], totalLeads: filas.length,
      sinResponder: filas.filter(f => !f.respondido).length,
      embudo: this.armarEmbudoKommo(filas, mes, anio, ventasTienda, dataKommo || []),
      pivot: this.construirPivotPorDia(filas, anio, mes),
    };
  }

  // Estado del popup del reporte general (vive en la misma página, no en una pestaña nueva).
  mostrandoReporteGeneral = false;
  reporteGeneralDatos: DatosReporteTienda[] = [];
  reporteGeneralAnio = 0;
  reporteGeneralMes = 0;
  reporteGeneralPeriodo = '';
  reporteGeneralGeneradoEn = '';
  exportMenuAbierto = false;
  exportandoImagen = false;

  /** Texto legible de un error HTTP/Angular — para que el mensaje en pantalla y en consola
   *  diga algo concreto (status, mensaje del backend) en vez de "[object Object]". */
  private detalleError(e: any): string {
    if (e?.status != null) return `HTTP ${e.status} ${e.statusText || ''} — ${e?.error?.message || e?.message || ''}`.trim();
    return e?.message || String(e);
  }

  /** Igual que datosReporteTienda, pero nunca rechaza: si esa tienda falla, lo deja en
   *  consola con su nombre y detalle, y devuelve null — así una tienda caída no tumba el
   *  reporte completo de las otras 2. */
  private async datosReporteTiendaSeguro(tienda: TiendaRealzza, anio: number, mes: number): Promise<DatosReporteTienda | null> {
    try {
      return await this.datosReporteTienda(tienda, anio, mes);
    } catch (e) {
      console.error(`[Reporte Kommo] Falló ${this.NOMBRE_TIENDA[tienda]}: ${this.detalleError(e)}`, e);
      return null;
    }
  }

  /** Botón "Reporte": trae el detalle (día × embudo) y el embudo KOMMO de las 3 tiendas de
   *  Realzza del mes elegido arriba y abre el popup con todo junto, listo para exportar
   *  (PDF, imagen o Excel) desde el mismo popup. */
  async abrirReporteGeneral(): Promise<void> {
    const { anio, mes } = this.form.value;
    if (this.verTodo || !anio || !mes) {
      this.error = 'Elige un mes puntual (no "Ver todo") para generar el reporte general.';
      return;
    }
    this.generandoReporte = true; this.error = '';
    try {
      const tiendas: TiendaRealzza[] = ['REALZZA', 'REALZZA PIURA', 'REALZZA LIMA'];
      const resultados = await Promise.all(tiendas.map(t => this.datosReporteTiendaSeguro(t, anio, mes)));
      const datos = resultados.filter((d): d is DatosReporteTienda => d !== null);
      if (!datos.length) {
        this.error = 'No se pudo traer el reporte de ninguna tienda. Abre la consola (F12 → Console) y busca "[Reporte Kommo]" para ver el detalle.';
        return;
      }
      this.reporteGeneralDatos = datos;
      this.reporteGeneralAnio = anio;
      this.reporteGeneralMes = mes;
      this.reporteGeneralPeriodo = `${this.meses.find(m => m.v === mes)?.t || mes} ${anio}`;
      this.reporteGeneralGeneradoEn = new Date().toLocaleString('es-PE');
      this.exportMenuAbierto = false;
      this.mostrandoReporteGeneral = true;
      if (datos.length < tiendas.length) {
        const faltantes = tiendas.length - datos.length;
        this.error = `El reporte se abrió, pero ${faltantes === 1 ? 'a 1 tienda le' : `a ${faltantes} tiendas les`} falló la carga (revisa la consola, busca "[Reporte Kommo]").`;
      }
    } catch (e) {
      console.error('[Reporte Kommo] Error general:', this.detalleError(e), e);
      this.error = `No se pudo generar el reporte general: ${this.detalleError(e)}`;
    } finally {
      this.generandoReporte = false;
    }
  }

  toggleExportMenu(): void { this.exportMenuAbierto = !this.exportMenuAbierto; }

  /** Lleva el scroll del popup a la sección de esa tienda (las 3 están siempre ahí, una
   *  debajo de otra — las "pestañas" son solo un atajo para saltar entre ellas). */
  irASedeReporte(tienda: TiendaRealzza): void {
    const el = document.getElementById('rk-sede-' + tienda.replace(/\s+/g, '-'));
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** "Guardar como PDF": reusa los datos ya cargados del popup y abre la versión imprimible
   *  en una ventana nueva — el usuario elige "Guardar como PDF" en el diálogo de impresión
   *  del navegador (mismo truco que el reporte de Auditoría, sin librerías de PDF). */
  exportarReporteGeneralPdf(): void {
    this.exportMenuAbierto = false;
    this.imprimirReporteGeneral(this.reporteGeneralAnio, this.reporteGeneralMes, this.reporteGeneralDatos);
  }

  /** "Guardar como Imagen": capa el popup tal cual se ve (con html2canvas) y descarga un PNG. */
  async exportarReporteGeneralImagen(): Promise<void> {
    this.exportMenuAbierto = false;
    if (!this.reporteModal) return;
    this.exportandoImagen = true;
    try {
      const canvas = await html2canvas(this.reporteModal.nativeElement, { backgroundColor: '#ffffff', scale: 2, useCORS: true });
      await new Promise<void>(resolve => {
        canvas.toBlob(blob => {
          if (blob) FileSaver.saveAs(blob, `${this.nombreReporte()}.png`);
          resolve();
        });
      });
    } catch (e) {
      console.error('Error al exportar el reporte a imagen:', e);
      this.error = 'No se pudo exportar el reporte a imagen.';
    } finally {
      this.exportandoImagen = false;
    }
  }

  /** "Exportar a Excel": una hoja por tienda, con el embudo y el pivot de días de cada una. */
  async exportarReporteGeneralExcel(): Promise<void> {
    this.exportMenuAbierto = false;
    const wb = new Workbook();
    for (const d of this.reporteGeneralDatos) {
      const ws = wb.addWorksheet(d.nombre.replace('Realzza ', '').slice(0, 31));
      ws.addRow([d.nombre]).font = { bold: true, size: 14 };
      ws.addRow([`Leads del mes: ${d.totalLeads}`, `Sin responder: ${d.sinResponder}`]);
      ws.addRow([]);
      if (d.embudo) {
        ws.addRow(['Embudo KOMMO (LEADS)']).font = { bold: true };
        ws.addRow(['Etapa', 'Cantidad', '%']).font = { bold: true };
        for (const e of d.embudo.etapas) ws.addRow([e.nombre, e.op, e.nombre === 'ASIGNADOS' ? 100 : e.ratio]);
        ws.addRow([]);
      }
      if (d.pivot) {
        ws.addRow(['Leads por embudo y día']).font = { bold: true };
        ws.addRow(['Embudo', ...d.pivot.cols.map(c => c.dia), 'Total']).font = { bold: true };
        for (const f of d.pivot.filas) ws.addRow([f.embudo, ...d.pivot.cols.map(c => f.valores[c.key] || 0), f.total]);
        ws.addRow(['Total', ...d.pivot.cols.map(c => d.pivot!.totales[c.key] || 0), d.pivot.totalGeneral]).font = { bold: true };
      }
      ws.columns.forEach(c => c.width = 13);
      (ws.getColumn(1) as any).width = 26;
    }
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    FileSaver.saveAs(blob, `${this.nombreReporte()}.xlsx`);
  }

  private nombreReporte(): string {
    return `Reporte Kommo Realzza - ${this.reporteGeneralPeriodo}`.replace(/[\\/:*?"<>|]/g, '');
  }

  private imprimirReporteGeneral(anio: number, mes: number, datos: DatosReporteTienda[]): void {
    const periodo = `${this.meses.find(m => m.v === mes)?.t || mes} ${anio}`;
    const esc = (s: any) => (s ?? '').toString()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const seccionTienda = (d: DatosReporteTienda): string => {
      const pctSinResponder = d.totalLeads ? Math.round((d.sinResponder / d.totalLeads) * 1000) / 10 : 0;
      const filasEmbudo = d.embudo ? d.embudo.etapas.map((e, i) => `
        <div class="funnel-row">
          <div class="funnel-block" style="width:${this.anchoBarraReporte(e)}%;background:${this.colorEtapa(i)};${i < 2 ? 'color:#0e2a4d' : ''}">
            <span class="fb-nombre">${esc(e.nombre)}</span><span class="fb-valor">${e.op}</span>
          </div>
          <span class="fb-ratio">${e.nombre === 'ASIGNADOS' ? '100%' : e.ratio + '%'}</span>
        </div>`).join('') : '<p class="vacio">Sin datos de embudo para este mes.</p>';

      const pivot = d.pivot;
      const tablaPivot = pivot ? `
        <table class="pivot">
          <thead><tr><th>Embudo</th>${pivot.cols.map(c => `<th class="num">${c.dia}</th>`).join('')}<th class="num">Total</th></tr></thead>
          <tbody>
            ${pivot.filas.map(f => `<tr><td>${esc(f.embudo)}</td>${pivot.cols.map(c => `<td class="num">${f.valores[c.key] || ''}</td>`).join('')}<td class="num"><b>${f.total}</b></td></tr>`).join('')}
          </tbody>
          <tfoot><tr><td>Total</td>${pivot.cols.map(c => `<td class="num">${pivot.totales[c.key] || ''}</td>`).join('')}<td class="num">${pivot.totalGeneral}</td></tr></tfoot>
        </table>` : '<p class="vacio">Sin días transcurridos de este mes todavía.</p>';

      return `
        <section class="sede">
          <div class="sede-head">
            <h2>${esc(d.nombre)}</h2>
            <div class="kpis"><span>Leads del mes <b>${d.totalLeads}</b></span><span class="${d.sinResponder ? 'bad' : ''}">Sin responder <b>${d.sinResponder}</b> (${pctSinResponder}%)</span></div>
          </div>
          <div class="sede-grid">
            <div class="funnel">${filasEmbudo}</div>
            <div>${tablaPivot}</div>
          </div>
        </section>`;
    };

    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Reporte Kommo Realzza — ${esc(periodo)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2a44; margin: 24px; }
  h1 { font-size: 20px; color: #1E3A5F; margin: 0 0 2px; }
  .meta { color: #5b7188; font-size: 13px; margin-bottom: 20px; }
  section.sede { margin-bottom: 26px; page-break-inside: avoid; border: 1px solid #dde5f0; border-radius: 10px; padding: 14px 16px; }
  .sede-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
  .sede-head h2 { font-size: 15px; color: #1E3A5F; margin: 0; }
  .kpis { display: flex; gap: 18px; font-size: 11.5px; color: #44536a; }
  .kpis .bad { color: #c62828; font-weight: 700; }
  .sede-grid { display: grid; grid-template-columns: 300px 1fr; gap: 20px; align-items: start; }
  .funnel { display: flex; flex-direction: column; align-items: center; gap: 4px; }
  .funnel-row { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .funnel-block {
    height: 28px; border-radius: 7px; display: flex; align-items: center; justify-content: center; gap: 6px;
    color: #fff; margin: 0 auto; white-space: nowrap; padding: 0 10px;
  }
  .fb-nombre { font-size: 9px; font-weight: 700; letter-spacing: .03em; }
  .fb-valor { font-size: 11.5px; font-weight: 800; }
  .fb-ratio { font-size: 9px; color: #8a9bb0; font-weight: 600; }
  table.pivot { width: 100%; border-collapse: collapse; font-size: 9px; }
  table.pivot th { background: #293964; color: #fff; padding: 3px 4px; text-align: center; font-weight: 700; }
  table.pivot td { border: 1px solid #dde5f0; padding: 2px 4px; text-align: center; }
  table.pivot th:first-child, table.pivot td:first-child { text-align: left; }
  table.pivot tfoot td { font-weight: 700; background: #F4F6FA; }
  .vacio { font-size: 11.5px; color: #8a9bb0; font-style: italic; }
  footer { margin-top: 20px; font-size: 10.5px; color: #8a9bb0; text-align: center; }
  @media print {
    body { margin: 10mm; }
    section.sede { page-break-after: always; border-color: transparent; }
    section.sede:last-of-type { page-break-after: auto; }
  }
</style></head><body onload="window.print()">
  <h1>Reporte Kommo — Realzza</h1>
  <div class="meta"><b>Período:</b> ${esc(periodo)} &nbsp;·&nbsp; <b>Generado:</b> ${esc(new Date().toLocaleString('es-PE'))}</div>
  ${datos.map(seccionTienda).join('')}
  <footer>Dashboard Leoncito · Listado Kommo Realzza — documento generado automáticamente</footer>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) { this.error = 'Habilita las ventanas emergentes para generar el reporte.'; return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  get totalLeads(): number { return this.filas.length; }
  get totalSinResponder(): number { return this.filas.filter(f => !f.respondido).length; }
  get pctSinResponder(): number { return this.totalLeads ? (this.totalSinResponder / this.totalLeads) * 100 : 0; }

  resumenEmbudo: ResumenEmbudo[] = [];
  pivotLeadsPorDia: PivotLeadsDia | null = null;

  /** Extrae el día del mes directo del string "D/M/YYYY" que manda el backend
   *  (concatenación literal de dia_cr/mes_cr/anio_cr, sin pasar por Date). */
  private diaDeFechaCreacion(fechaStr: string): number {
    const dia = parseInt((fechaStr || '').split('/')[0], 10);
    return isNaN(dia) ? 0 : dia;
  }

  /** Recalcula el detalle por asesor/embudo y por día a partir de TODO lo que cumple el
   *  filtro/búsqueda activo en la grilla (no solo la página visible) — se dispara
   *  cada vez que la grilla re-renderiza por un filtro, búsqueda o carga nueva.
   *  Usa el mismo truco que los exports: lee del store con el filtro combinado,
   *  sin paginar, para no quedarse solo con las 10 filas de la página actual. */
  async recomputarResumen(): Promise<void> {
    let datos: FilaLead[] = this.filas;
    if (this.grid) {
      const store = this.grid.instance.getDataSource().store();
      const resultado: any = await store.load({ filter: this.grid.instance.getCombinedFilter() });
      datos = Array.isArray(resultado) ? resultado : (resultado?.data || []);
    }

    const porEmbudo = new Map<string, { total: number; respondidos: number }>();
    for (const f of datos) {
      const clave = f.embudo || 'SIN EMBUDO';
      const acc = porEmbudo.get(clave) || { total: 0, respondidos: 0 };
      acc.total++;
      if (f.respondido) acc.respondidos++;
      porEmbudo.set(clave, acc);
    }
    this.resumenEmbudo = [...porEmbudo.entries()]
      .map(([embudo, { total, respondidos }]) => ({
        embudo, total, respondidos, noRespondidos: total - respondidos,
        pctRespondidos: total ? (respondidos / total) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // Leads por día (columnas) × embudo (filas) del mes seleccionado — solo tiene sentido
    // con un mes puntual elegido (en "Ver Todo" se mezclarían leads de distintos meses en
    // el mismo número de día).
    const { anio, mes } = this.form.value;
    this.pivotLeadsPorDia = this.verTodo ? null : this.construirPivotPorDia(datos, anio, mes);
  }

  /** Arma el pivot "leads por embudo × día" a partir de una lista de leads ya cargada (sin
   *  depender de la grilla/estado del componente) — reusado por el resumen en pantalla y
   *  por el reporte general (una tienda a la vez). Solo columnas de días YA TRANSCURRIDOS:
   *  si es el mes en curso, hasta hoy; si es un mes pasado, todos sus días; si fuera un mes
   *  futuro, ninguna. */
  private construirPivotPorDia(datos: FilaLead[], anio: number, mes: number): PivotLeadsDia | null {
    if (!anio || !mes) return null;
    const hoy = new Date();
    const esMesActual = hoy.getFullYear() === anio && hoy.getMonth() + 1 === mes;
    const esMesFuturo = anio > hoy.getFullYear() || (anio === hoy.getFullYear() && mes > hoy.getMonth() + 1);
    const diasMes = new Date(anio, mes, 0).getDate();
    const diasTranscurridos = esMesFuturo ? 0 : (esMesActual ? hoy.getDate() : diasMes);
    if (!diasTranscurridos) return null;

    const cols: ColDia[] = Array.from({ length: diasTranscurridos }, (_, i) => ({ key: String(i + 1), dia: i + 1 }));
    const porEmbudoDia = new Map<string, Record<string, number>>();
    const totales: Record<string, number> = {};
    cols.forEach(c => (totales[c.key] = 0));
    for (const f of datos) {
      const dia = this.diaDeFechaCreacion(f.fecha_creacion);
      if (!dia || dia > diasTranscurridos) continue;
      const embudo = f.embudo || 'SIN EMBUDO';
      let fila = porEmbudoDia.get(embudo);
      if (!fila) { fila = {}; cols.forEach(c => (fila![c.key] = 0)); porEmbudoDia.set(embudo, fila); }
      fila[String(dia)] = (fila[String(dia)] || 0) + 1;
      totales[String(dia)] = (totales[String(dia)] || 0) + 1;
    }
    const filas: FilaPivotEmbudo[] = [...porEmbudoDia.entries()]
      .map(([embudo, valores]) => ({ embudo, valores, total: Object.values(valores).reduce((s, v) => s + v, 0) }))
      .sort((a, b) => b.total - a.total);
    const totalGeneral = filas.reduce((s, f) => s + f.total, 0);
    return { cols, filas, totales, totalGeneral };
  }

  get resumenTotal(): { total: number; respondidos: number; noRespondidos: number } {
    return this.resumenEmbudo.reduce(
      (acc, r) => ({ total: acc.total + r.total, respondidos: acc.respondidos + r.respondidos, noRespondidos: acc.noRespondidos + r.noRespondidos }),
      { total: 0, respondidos: 0, noRespondidos: 0 },
    );
  }

  onCellPrepared(e: any): void {
    if (e.rowType === 'header') {
      e.cellElement.style.backgroundColor = '#293964';
      e.cellElement.style.color = 'white';
      e.cellElement.style.fontWeight = 'bold';
    }
  }

  // ═══════════════════════ Auditoría Kommo ═══════════════════════
  // Sortea N leads YA RESPONDIDOS de cada embudo (del mes/tienda elegidos arriba) y
  // arma un lote para revisar a mano en Kommo: resultado (Bien/Por mejorar) +
  // comentario + fotos de evidencia por lead. Todo queda guardado en BD con fecha.
  mostrarAuditoria = false;
  cantidadPorEmbudo = 5;
  sorteando = false;
  errorAuditoria = '';
  auditLotes: LoteAuditoria[] = [];
  loteActivo: LoteAuditoria | null = null;
  leadsLote: LeadAuditoria[] = [];
  cargandoLote = false;

  revision: {
    lead: LeadAuditoria; resultado: ResultadoAuditoria; comentario: string;
    fotos: string[]; fotosUrl: string[]; nuevasFotos: string[]; guardando: boolean;
  } | null = null;
  /** Foto (URL) mostrada en grande al hacer clic en una miniatura. */
  fotoAmpliada: string | null = null;
  ampliarFoto(f: string, ev: Event): void { ev.stopPropagation(); this.fotoAmpliada = f; }

  async toggleAuditoria(): Promise<void> {
    this.mostrarAuditoria = !this.mostrarAuditoria;
    this.cerrarLote();
    if (this.mostrarAuditoria) await this.cargarLotes();
  }

  async cargarLotes(): Promise<void> {
    try { this.auditLotes = await lastValueFrom(this.auditSrv.obtenerLotes(this.tienda)); }
    catch (e) { console.error('Error al cargar lotes de auditoría:', e); }
  }

  async sortearAuditoria(): Promise<void> {
    this.sorteando = true; this.errorAuditoria = '';
    try {
      const { anio, mes } = this.form.value;
      const r = await lastValueFrom(this.auditSrv.sortear(this.tienda, anio, mes, this.cantidadPorEmbudo));
      await this.cargarLotes();
      const nuevo = this.auditLotes.find(l => l.id === r.loteId);
      if (nuevo) await this.abrirLote(nuevo);
    } catch (e: any) {
      console.error('Error al sortear auditoría:', e);
      this.errorAuditoria = e?.error?.message || 'No se pudo sortear la auditoría (revisa que haya leads respondidos en ese mes).';
    } finally { this.sorteando = false; }
  }

  async abrirLote(lote: LoteAuditoria): Promise<void> {
    this.loteActivo = lote;
    this.cargandoLote = true;
    try {
      const { leads } = await lastValueFrom(this.auditSrv.obtenerLoteDetalle(lote.id));
      this.leadsLote = leads;
    } catch (e) { console.error('Error al cargar el lote:', e); this.leadsLote = []; }
    finally { this.cargandoLote = false; this.recomputarReporte(); }
  }

  cerrarLote(): void { this.loteActivo = null; this.leadsLote = []; this.mostrandoReporte = false; }

  // ═══ Reporte del lote: resumen por asesor + comentarios de "Por mejorar" con fotos ═══
  // IMPORTANTE: estos 3 van como PROPIEDADES cacheadas (no getters) y se recalculan con
  // recomputarReporte() cada vez que cambia leadsLote. Un getter aquí crearía arrays/objetos
  // nuevos en cada detección de cambios de Angular, y como *ngFor no tiene trackBy, eso
  // destruye y recrea las <img> en cada ciclo — justo lo que rompía el clic para agrandarlas.
  mostrandoReporte = false;
  reportePorAsesor: { asesor: string; bien: number; mejorar: number; pctMejorar: number }[] = [];
  leadsPorMejorarAgrupados: { asesor: string; leads: LeadAuditoria[] }[] = [];
  leadsPorMejorar: LeadAuditoria[] = [];

  /** Recalcula el resumen por asesor y los puntos a mejorar a partir de leadsLote. Se
   *  llama cada vez que leadsLote cambia (al abrir el lote, guardar una revisión o
   *  quitar un lead) — nunca desde el template. */
  private recomputarReporte(): void {
    const mapResumen = new Map<string, { bien: number; mejorar: number }>();
    const mapMejorar = new Map<string, LeadAuditoria[]>();
    for (const l of this.leadsLote) {
      const key = l.responsable || 'SIN ASESOR';
      if (l.resultado !== 'pendiente') {
        const acc = mapResumen.get(key) || { bien: 0, mejorar: 0 };
        if (l.resultado === 'bien') acc.bien++; else acc.mejorar++;
        mapResumen.set(key, acc);
      }
      if (l.resultado === 'mejorar') {
        if (!mapMejorar.has(key)) mapMejorar.set(key, []);
        mapMejorar.get(key)!.push(l);
      }
    }
    this.reportePorAsesor = Array.from(mapResumen.entries())
      .map(([asesor, v]) => ({ asesor, ...v, pctMejorar: Math.round((v.mejorar / (v.bien + v.mejorar)) * 100) }))
      .sort((a, b) => b.pctMejorar - a.pctMejorar || a.asesor.localeCompare(b.asesor));
    this.leadsPorMejorarAgrupados = Array.from(mapMejorar.entries())
      .map(([asesor, leads]) => ({ asesor, leads }))
      .sort((a, b) => a.asesor.localeCompare(b.asesor));
    this.leadsPorMejorar = this.leadsLote.filter(l => l.resultado === 'mejorar');
  }

  /** Exporta el reporte (resumen por asesor + comentarios de "Por mejorar") a Excel. */
  async exportarReporte(): Promise<void> {
    if (!this.loteActivo) return;
    const wb = new Workbook();

    const wsResumen = wb.addWorksheet('Resumen por asesor');
    wsResumen.addRow(['Asesor', 'Bien', 'Por mejorar', '% Por mejorar']).font = { bold: true };
    for (const r of this.reportePorAsesor) wsResumen.addRow([r.asesor, r.bien, r.mejorar, r.pctMejorar + '%']);
    wsResumen.columns.forEach(c => c.width = 20);

    const wsMejorar = wb.addWorksheet('Puntos a mejorar');
    wsMejorar.addRow(['Asesor', 'Cliente', 'ID Lead', 'Embudo', 'Comentario', 'Fotos']).font = { bold: true };
    for (const l of this.leadsPorMejorar) wsMejorar.addRow([l.responsable, l.nombre_cliente, l.lead_id, l.embudo, l.comentario || '', l.fotos.length]);
    wsMejorar.columns.forEach(c => c.width = 24);
    (wsMejorar.getColumn(5) as any).width = 60;

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    FileSaver.saveAs(blob, `Reporte Auditoria Kommo - ${this.meses[this.loteActivo.mes - 1].t} ${this.loteActivo.anio}.xlsx`);
  }

  mostrarMenuExportar = false;

  /** Abre una ventana con el reporte ya maquetado para imprimir — el usuario elige
   *  "Guardar como PDF" en el diálogo de impresión del navegador (mismo truco que usa
   *  Control Supervisor, sin librerías de PDF). */
  imprimirReporte(): void {
    if (!this.loteActivo) return;
    const periodo = `${this.meses[this.loteActivo.mes - 1].t} ${this.loteActivo.anio}`;
    const esc = (s: any) => (s ?? '').toString()
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const filasResumen = this.reportePorAsesor.map(r =>
      `<tr><td>${esc(r.asesor)}</td><td class="ok">${r.bien}</td><td class="bad">${r.mejorar}</td>` +
      `<td class="${r.pctMejorar >= 50 ? 'bad' : ''}">${r.pctMejorar}%</td></tr>`).join('');

    const gruposMejorar = this.leadsPorMejorarAgrupados.map(g => `
      <h2>${esc(g.asesor)} (${g.leads.length})</h2>
      ${g.leads.map(l => `
        <div class="item">
          <div class="item-info"><b>${esc(l.nombre_cliente)}</b> · Lead #${l.lead_id} · ${esc(l.embudo)}<p>${esc(l.comentario || 'Sin comentario.')}</p></div>
          <div class="item-fotos">${l.fotosUrl.map(f => `<img src="${esc(f)}">`).join('')}</div>
        </div>`).join('')}
    `).join('');

    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Reporte Auditoría Kommo — ${esc(periodo)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2a44; margin: 24px; }
  h1 { font-size: 20px; color: #1E3A5F; margin: 0 0 2px; }
  .meta { color: #5b7188; font-size: 13px; margin-bottom: 18px; }
  h2 { font-size: 13.5px; color: #1E3A5F; border-left: 4px solid #1A5FAD; padding-left: 8px; margin: 18px 0 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 10px; }
  th { background: #293964; color: #fff; padding: 6px 8px; text-align: center; font-weight: 700; }
  td { border: 1px solid #dde5f0; padding: 5px 8px; text-align: center; }
  th:first-child, td:first-child { text-align: left; }
  td.ok { color: #2E7D32; font-weight: 700; }
  td.bad { color: #c62828; font-weight: 700; }
  .item { border: 1px solid #dde5f0; border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; display: flex; gap: 10px; page-break-inside: avoid; }
  .item-info { flex: 1; font-size: 12px; color: #444; }
  .item-info b { color: #1E3A5F; }
  .item-info p { margin: 4px 0 0; }
  .item-fotos { display: flex; gap: 4px; flex-shrink: 0; }
  .item-fotos img { width: 54px; height: 54px; object-fit: cover; border-radius: 6px; border: 1px solid #dde5f0; }
  footer { margin-top: 20px; font-size: 10.5px; color: #8a9bb0; text-align: center; }
  @media print { body { margin: 10mm; } h2 { page-break-after: avoid; } }
</style></head><body onload="window.print()">
  <h1>Reporte de Auditoría Kommo — Realzza</h1>
  <div class="meta"><b>Período:</b> ${esc(periodo)} &nbsp;·&nbsp; <b>Generado:</b> ${esc(new Date().toLocaleString('es-PE'))}</div>

  <h2>Resumen por asesor</h2>
  <table><thead><tr><th>Asesor</th><th>Bien</th><th>Por mejorar</th><th>% Por mejorar</th></tr></thead>
  <tbody>${filasResumen}</tbody></table>

  <h2 style="border:0;padding:0;margin-top:22px;">Puntos a mejorar (${this.leadsPorMejorar.length})</h2>
  ${gruposMejorar || '<p>Ningún lead marcado "Por mejorar" todavía.</p>'}

  <footer>Dashboard Leoncito · Auditoría Kommo — documento generado automáticamente</footer>
</body></html>`;

    const w = window.open('', '_blank');
    if (!w) { console.error('Habilita las ventanas emergentes para imprimir el reporte.'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  sincronizandoLote = false;
  /** Refresca embudo/asesor/cliente de los leads del lote contra Kommo (por si alguno
   *  se reasignó después del sorteo) sin perder lo ya revisado. */
  async sincronizarLote(): Promise<void> {
    if (!this.loteActivo) return;
    this.sincronizandoLote = true;
    try {
      await lastValueFrom(this.auditSrv.sincronizarLote(this.loteActivo.id));
      await this.abrirLote(this.loteActivo);
    } catch (e) { console.error('Error al sincronizar el lote:', e); }
    finally { this.sincronizandoLote = false; }
  }

  /** Quita un lead sorteado del lote (p.ej. quedó de más en su embudo tras sincronizar). */
  async quitarLead(lead: LeadAuditoria, ev: Event): Promise<void> {
    ev.stopPropagation();
    if (!this.loteActivo) return;
    const dialog = custom({
      title: 'Quitar de la auditoría',
      messageHtml: `<div style="padding:10px 6px;font-size:15px;color:#1E3A5F;">¿Quitar a <b>${lead.nombre_cliente}</b> de esta auditoría? Se borra su revisión si tenía.</div>`,
      buttons: [
        { text: 'Cancelar', type: 'danger', stylingMode: 'contained', onClick: () => false },
        { text: 'Quitar', type: 'success', stylingMode: 'contained', onClick: () => true },
      ],
    });
    const confirmado = await dialog.show();
    if (!confirmado) return;
    try {
      await lastValueFrom(this.auditSrv.quitarLead(lead.id));
      this.leadsLote = this.leadsLote.filter(l => l.id !== lead.id);
      this.recomputarReporte();
      await this.cargarLotes();
    } catch (e) { console.error('Error al quitar el lead:', e); }
  }

  abrirRevision(lead: LeadAuditoria): void {
    this.revision = {
      lead, resultado: lead.resultado === 'pendiente' ? 'bien' : lead.resultado,
      comentario: lead.comentario || '', fotos: [...lead.fotos], fotosUrl: [...lead.fotosUrl],
      nuevasFotos: [], guardando: false,
    };
    document.addEventListener('paste', this.onPegarFoto);
  }

  cerrarRevision(): void {
    document.removeEventListener('paste', this.onPegarFoto);
    this.revision = null;
  }

  /** Pegar (Ctrl+V) una captura mientras el popup de revisión está abierto — la agrega
   *  como foto, igual que si se hubiera elegido con "Subir archivo". Arrow function (no
   *  método normal) para poder sacarla de `document` en cerrarRevision() con la misma
   *  referencia con la que se agregó. */
  private onPegarFoto = (ev: ClipboardEvent): void => {
    if (!this.revision || !ev.clipboardData) return;
    let huboImagen = false;
    for (const item of Array.from(ev.clipboardData.items)) {
      if (!item.type.startsWith('image/')) continue;
      const file = item.getAsFile();
      if (!file) continue;
      huboImagen = true;
      const reader = new FileReader();
      reader.onload = () => {
        if (!this.revision) return;
        this.revision.nuevasFotos.push(reader.result as string);
        this.revision.fotosUrl.push(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
    if (huboImagen) ev.preventDefault();
  };

  onFotosSeleccionadas(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    if (!this.revision || !input.files) return;
    Array.from(input.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        if (!this.revision) return;
        this.revision.nuevasFotos.push(reader.result as string);
        this.revision.fotosUrl.push(reader.result as string); // vista previa local hasta guardar
      };
      reader.readAsDataURL(file);
    });
    input.value = '';
  }

  /** Quita una foto de la vista previa (índice sobre `fotosUrl`, que va existentes
   *  primero y nuevas después, en el mismo orden que `fotos`/`nuevasFotos`). */
  quitarFotoPreview(i: number): void {
    if (!this.revision) return;
    if (i < this.revision.fotos.length) this.revision.fotos.splice(i, 1);
    else this.revision.nuevasFotos.splice(i - this.revision.fotos.length, 1);
    this.revision.fotosUrl.splice(i, 1);
  }

  async guardarRevision(): Promise<void> {
    if (!this.revision || !this.loteActivo) return;
    this.revision.guardando = true;
    try {
      const fotosAEnviar = [...this.revision.fotos, ...this.revision.nuevasFotos];
      await lastValueFrom(this.auditSrv.guardarRevision(this.revision.lead.id, this.revision.resultado, this.revision.comentario, fotosAEnviar));
      this.cerrarRevision();
      await this.abrirLote(this.loteActivo);
      await this.cargarLotes();
    } catch (e) { console.error('Error al guardar revisión:', e); }
    finally { if (this.revision) this.revision.guardando = false; }
  }

  /** % de lo YA revisado (bien+mejorar, sin contar pendientes) que salió "Bien". */
  pctBienDe(l: LoteAuditoria): number {
    const revisados = l.bien + l.mejorar;
    return revisados ? (l.bien / revisados) * 100 : 0;
  }
}
