import { Component, inject, OnInit } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { lastValueFrom } from 'rxjs';
import * as XLSX from 'xlsx';
import { Workbook } from 'exceljs';
import * as FileSaver from 'file-saver';
import { SheetsService } from '../../services/service-google.service';
import { SedeConfigService } from '../../services/sede-config.service';
import { AuthService } from '../../services/auth.service';
import { CargaVentasService } from '../../services/carga-ventas.service';

/** Columnas de teléfono a considerar de la cartera importada. */
const COLUMNAS_TELEFONO = [
  'CEL actual', 'Telefono', 'Fax', 'Movil', 'Nextel',
  'ProvedorExterno1', 'ProvedorExterno2', 'ProvedorExterno3',
];

// Candidatos de cabecera para DNI, asesor y sede/zona en el Excel de cartera.
const CANDIDATOS_DNI = [
  'DNI', 'Dni', 'DNI CLIENTE', 'DNICLIENTE', 'DNI_CLIENTE', 'NRO DNI', 'N° DNI', 'NUM DNI',
  'DOCUMENTO', 'NRO DOCUMENTO', 'N° DOCUMENTO', 'DOC', 'DOC IDENTIDAD', 'DOCUMENTO IDENTIDAD',
  'DOCUMENTO DE IDENTIDAD', 'DOCIDENTIDAD', 'NRO DOC',
];
const CANDIDATOS_ASESOR = [
  'ASIGNACION FINAL', 'ASIGNACIONFINAL', 'ASESOR FINAL', 'ASESORFINAL',
  'ASESOR CONTACT', 'ASESORCONTACT', 'ASESOR CONTACTO', 'ASESORCONTACTO',
  'ASIGNACION CONTACT', 'ASIGNACIONCONTACT', 'ASIGNACION CONTACTO', 'ASIGNACIONCONTACTO',
  'ASESOR REALZZA', 'ASIGNACION REALZZA',
];
const CANDIDATOS_ZONA = ['ZONA', 'ZONAS', 'SEDE', 'TIENDA', 'TIENDA SEDE'];
const CANDIDATOS_TIPO_CLIENTE = [
  'TIPO CLIENTE', 'TIPO DE CLIENTE', 'TIPOCLIENTE', 'TIPO_CLIENTE', 'TIPO DE CLIENTES',
  'CLIENTE TIPO', 'TIPO CLIENTES', 'SEGMENTO', 'SEGMENTO CLIENTE',
];

// Columnas de la gestión Call / Realzza (form).
const G_DNI = 'DNI CLIENTE';
const G_CELULAR = 'CELULAR GESTIONADO';
const G_ESTADO = 'ESTADO DE GESTIÓN';
const G_FECHA = 'Marca temporal';

// Columnas de la gestión SEDES (tabla `gestion` de BD vía getGestionSedesDB; mismas cabeceras que la hoja).
const GS_SEDE = 'TIENDA SEDE';
const GS_DNI = 'DNI CLIENTE';
const GS_CELULAR = 'N° CELULAR ACTUALIZADO';
const GS_ESTADO = 'RESULTADO DE GESTION';
const GS_FECHA = 'Marca temporal';

type Modo = 'call' | 'realzza' | 'piso';
type EstadoCliente = 'CONTACTO' | 'NO CONTACTO' | 'PENDIENTE';

interface ClienteCartera {
  dni: string;
  asesor: string;
  telefonos: string[];
  estado: EstadoCliente;
  fechaGestion: Date | null;
  diaGestion: number | null;
  sedeKey: string;
  sedeNombre: string;
  tipoCliente: string;   // Piso: tipo de cliente (columna del Excel) para separar el consolidado
  raw: Record<string, any>;
}

interface ResumenAsesor {
  asesor: string;
  asignados: number; gestionados: number;
  contacto: number; noContacto: number; pendientes: number; avance: number;
}

interface ResumenSede {
  sedeKey: string; sede: string;
  asignados: number; gestionados: number;
  contacto: number; noContacto: number; pendientes: number; avance: number;
  // Consolidado "Gestión de Base de Datos" (Piso): ventas (BD) + metas + derivados.
  gestionesTotal: number;   // # de gestiones registradas (con repeticiones) de la sede
  intensidad: number;       // gestiones ÷ clientes gestionados
  nVentas: number;          // # de ventas (tabla ventas) de la sede
  monto: number;            // monto neto vendido de la sede
  ticket: number;           // monto ÷ nVentas
  meta: number;             // meta editable por sede (y grupo de tipo)
  proyeccion: number;       // monto proyectado a fin de mes
  avanceMeta: number;       // % monto ÷ meta
  metaKey: string;          // clave de persistencia de la meta (cartera:[grupo:]<sede>)
}

interface RegGestion { fecha: Date; estado: EstadoCliente; }
interface IndiceGestion { porDni: Map<string, RegGestion>; porTel: Map<string, RegGestion>; }

import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';

@Component({
  selector: 'app-avance-cartera',
  standalone: true,
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES, LoadingOverlayComponent],
  templateUrl: './avance-cartera.component.html',
  styleUrls: ['./avance-cartera.component.css'],
})
export class AvanceCarteraComponent implements OnInit {
  private sheets = inject(SheetsService);
  private sedeCfg = inject(SedeConfigService);
  private auth = inject(AuthService);
  private ventasSrv = inject(CargaVentasService);

  // Consolidado Piso: ventas de la BASE (por DNI del cliente en la cartera) + metas.
  private ventasPorDni = new Map<string, { ops: number; monto: number }>();
  private gestionesTotalPorSede = new Map<string, number>();
  private metasCartera: Record<string, number> = {};
  // Consolidado (Todos) + un cuadro separado por cada grupo de tipo de cliente.
  consolidado: ResumenSede[] = [];
  consolidadoGrupos: { grupo: string; filas: ResumenSede[] }[] = [];

  // ── Modo / estado UI ──
  modo: Modo | null = null;
  modosPermitidos: Modo[] = ['call', 'realzza', 'piso'];
  modoFijo = false;  // true cuando el usuario tiene un único modo permitido

  ngOnInit(): void {
    const u = this.auth.getUsuario();
    const sede = this.sedeCfg.normalizar(u?.sede ?? '');
    const esAdmin = !u || u.rol === 'admin' || sede === 'todas' || sede === 'call';

    if (esAdmin) {
      this.modosPermitidos = ['call', 'realzza', 'piso'];
      return;
    }
    // Realzza → solo su cartera; cualquier otra sede (Call sedes) → solo Piso.
    this.modosPermitidos = sede === 'realzza' ? ['realzza'] : ['piso'];
    if (this.modosPermitidos.length === 1) {
      this.modoFijo = true;
      this.seleccionarModo(this.modosPermitidos[0]);
    }
  }

  puedeVer(m: Modo): boolean { return this.modosPermitidos.includes(m); }
  arrastrando = false;
  procesando = false;
  error = '';
  nombreArchivo = '';
  listo = false;

  fecha: Date = new Date();

  // ── Datos calculados ──
  private headersOriginales: string[] = [];
  clientes: ClienteCartera[] = [];
  resumenAsesores: ResumenAsesor[] = [];      // modo call/realzza
  resumenSedes: ResumenSede[] = [];           // modo piso
  porDia: { dia: string; Contacto: number; 'No Contacto': number; Total: number }[] = [];
  distribucion: { tipo: string; valor: number; color: string }[] = [];

  // Piso: selector de sede para enfocar toda la vista en una sede
  sedeDetalle = '';
  sedesDisponiblesDetalle: { key: string; nombre: string }[] = [];

  // KPIs globales
  totalCartera = 0;
  totalGestionados = 0;
  totalContacto = 0;
  totalNoContacto = 0;
  totalPendientes = 0;
  avanceGlobal = 0;
  gestionesMes = 0;

  diasTranscurridos = 0;
  diasMes = 0;
  ritmoDiario = 0;
  diasParaTerminar = 0;

  get nombreCartera(): string {
    return this.modo === 'realzza' ? 'Realzza' : this.modo === 'piso' ? 'Piso' : 'Call';
  }
  get esPiso(): boolean { return this.modo === 'piso'; }

  // ── Selección de modo ──
  seleccionarModo(m: Modo): void { this.modo = m; this.reiniciar(); }
  volverModos(): void { this.modo = null; this.reiniciar(); }

  // ── Carga de archivo ──
  onDragOver(e: DragEvent): void { e.preventDefault(); this.arrastrando = true; }
  onDragLeave(e: DragEvent): void { e.preventDefault(); this.arrastrando = false; }
  onDrop(e: DragEvent): void {
    e.preventDefault(); this.arrastrando = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) this.procesarArchivo(file);
  }
  onFileChange(e: Event): void {
    const t = e.target as HTMLInputElement;
    const file = t.files?.[0];
    if (file) this.procesarArchivo(file);
    t.value = '';
  }

  reiniciar(): void {
    this.listo = false; this.error = ''; this.nombreArchivo = '';
    this.headersOriginales = [];
    this.clientes = []; this.resumenAsesores = []; this.resumenSedes = [];
    this.porDia = []; this.distribucion = [];
    this.sedeDetalle = ''; this.sedesDisponiblesDetalle = [];
    this.totalCartera = this.totalGestionados = this.totalContacto = 0;
    this.totalNoContacto = this.totalPendientes = this.avanceGlobal = this.gestionesMes = 0;
    this.diasTranscurridos = this.diasMes = this.ritmoDiario = this.diasParaTerminar = 0;
  }

  private procesarArchivo(file: File): void {
    this.reiniciar();
    this.nombreArchivo = file.name;
    this.procesando = true;

    const reader = new FileReader();
    reader.onload = async (e: any) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const filas = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '', raw: false });
        if (!filas.length) throw new Error('El archivo no contiene filas de datos.');
        await this.calcularAvance(filas);
        this.listo = true;
      } catch (err: any) {
        this.error = err?.message ?? 'No se pudo procesar el archivo.';
      } finally {
        this.procesando = false;
      }
    };
    reader.onerror = () => { this.error = 'Error al leer el archivo.'; this.procesando = false; };
    reader.readAsArrayBuffer(file);
  }

  // ── Núcleo: cruzar cartera con la gestión ──
  private async calcularAvance(filas: Record<string, any>[]): Promise<void> {
    this.headersOriginales = Object.keys(filas[0]);
    const dniHeader = this.buscarHeader(this.headersOriginales, CANDIDATOS_DNI)
      ?? this.buscarHeaderIncluye(this.headersOriginales, ['dni', 'documento', 'docidentidad']);
    const asesorHeader = this.buscarHeader(this.headersOriginales, CANDIDATOS_ASESOR)
      ?? this.buscarHeaderIncluye(this.headersOriginales, ['asesorcontact', 'asignacioncontact', 'asesorrealzza', 'asesor', 'asignacion']);
    const telHeaders = COLUMNAS_TELEFONO
      .map(c => this.buscarHeaderExacto(this.headersOriginales, c))
      .filter((h): h is string => !!h);

    if (!dniHeader) throw new Error('No se encontró la columna de DNI en el archivo.');

    // Modo Piso: la columna ZONA/SEDE indica a qué sede pertenece cada cartera.
    let zonaHeader: string | undefined;
    let tipoHeader: string | undefined;
    if (this.modo === 'piso') {
      zonaHeader = this.buscarHeader(this.headersOriginales, CANDIDATOS_ZONA)
        ?? this.buscarHeaderIncluye(this.headersOriginales, ['zona', 'sede', 'tienda']);
      if (!zonaHeader) throw new Error('No se encontró la columna ZONA/SEDE en el archivo (necesaria para separar por sede).');
      // Opcional: columna de tipo de cliente para separar el consolidado (si no existe, todo = "SIN TIPO").
      tipoHeader = this.buscarHeader(this.headersOriginales, CANDIDATOS_TIPO_CLIENTE)
        ?? this.buscarHeaderIncluye(this.headersOriginales, ['tipocliente', 'tipodecliente', 'segmento']);
    }

    // Índices de gestión del mes seleccionado.
    const idxGlobal = this.modo === 'piso' ? null : await this.cargarGestion();
    const idxPorSede = this.modo === 'piso' ? await this.cargarGestionSedes() : null;
    // Piso: ventas (BD) + metas por sede para el cuadro consolidado.
    if (this.modo === 'piso') await this.cargarVentasYMetasSede();

    const clientes: ClienteCartera[] = filas.map(fila => {
      const dni = this.soloDigitos(String(fila[dniHeader] ?? ''));
      const asesor = (fila[asesorHeader ?? ''] || 'SIN ASESOR').toString().trim().toUpperCase();
      const telefonos = telHeaders
        .flatMap(h => this.extraerNumeros(fila[h]))
        .filter((v, i, arr) => arr.indexOf(v) === i);

      let sedeKey = '', sedeNombre = '';
      let idx: IndiceGestion | null = idxGlobal;
      if (this.modo === 'piso') {
        const raw = (fila[zonaHeader!] || '').toString().trim();
        sedeKey = this.sedeCfg.normalizar(raw);
        sedeNombre = this.sedeCfg.getConfig(sedeKey)?.nombre ?? (raw || 'SIN SEDE');
        idx = idxPorSede!.get(sedeKey) ?? null;
      }

      const candidatos: RegGestion[] = [];
      if (idx) {
        const g = idx.porDni.get(dni); if (g) candidatos.push(g);
        telefonos.forEach(t => {
          const gt = idx!.porTel.get(t.slice(-9));
          if (gt) candidatos.push(gt);
        });
      }

      let estado: EstadoCliente = 'PENDIENTE';
      let fechaGestion: Date | null = null;
      if (candidatos.length) {
        const ultima = candidatos.reduce((a, b) => (b.fecha > a.fecha ? b : a));
        estado = ultima.estado;
        fechaGestion = ultima.fecha;
      }

      const tipoCliente = tipoHeader
        ? ((fila[tipoHeader] ?? '').toString().trim().toUpperCase() || 'SIN TIPO')
        : 'SIN TIPO';
      return {
        dni, asesor, telefonos, estado, fechaGestion,
        diaGestion: fechaGestion ? fechaGestion.getDate() : null,
        sedeKey, sedeNombre, tipoCliente, raw: fila,
      };
    });

    // Deduplicar por DNI (un cliente cuenta una sola vez, igual que Embudos).
    const unicos = this.dedupPorDni(clientes);
    this.clientes = unicos;
    this.calcularGlobales(unicos);
    if (this.modo === 'piso') {
      this.construirResumenSedes(unicos);
      this.resumenAsesores = [];
    } else {
      this.resumenAsesores = this.agregarPorAsesor(unicos);
      this.resumenSedes = [];
    }
    this.construirPorDia(unicos);
    this.construirDistribucion();
    this.construirProyeccion();
  }

  /** Deduplica la cartera por DNI (por sede+DNI en modo Piso). Si un DNI repetido
   *  quedó gestionado en alguna fila, se conserva esa (gana el "gestionado"). Las
   *  filas sin DNI se mantienen individuales. */
  private dedupPorDni(clientes: ClienteCartera[]): ClienteCartera[] {
    const map = new Map<string, ClienteCartera>();
    const sinDni: ClienteCartera[] = [];
    for (const c of clientes) {
      if (!c.dni) { sinDni.push(c); continue; }
      const key = this.modo === 'piso' ? `${c.sedeKey}|${c.dni}` : c.dni;
      const prev = map.get(key);
      if (!prev) map.set(key, c);
      else if (prev.estado === 'PENDIENTE' && c.estado !== 'PENDIENTE') map.set(key, c);
    }
    return [...map.values(), ...sinDni];
  }

  /** Gestión Call/Realzza → índice por DNI y por teléfono del mes seleccionado. */
  private async cargarGestion(): Promise<IndiceGestion> {
    const mes = this.fecha.getMonth(), anio = this.fecha.getFullYear();
    // Solo el mes seleccionado (la BD filtra por marca_temporal) → payload mínimo.
    const desde = new Date(anio, mes, 1), hasta = new Date(anio, mes + 1, 0);
    let data: any[] = [];
    try {
      data = this.modo === 'realzza'
        ? await lastValueFrom(this.sheets.getSheetDataCampoRango({ desde, hasta }))   // BD gestion_realzza (mes)
        : await lastValueFrom(this.sheets.getSheetDataCallRango({ desde, hasta }));    // BD gestion_call (mes)
    } catch {
      throw new Error('No se pudo cargar la gestión (revisa la conexión al servidor).');
    }

    const porDni = new Map<string, RegGestion>();
    const porTel = new Map<string, RegGestion>();
    let count = 0;
    for (const item of data) {
      const fecha = this.parseMarcaTemporal(item[G_FECHA]);
      if (!fecha || fecha.getMonth() !== mes || fecha.getFullYear() !== anio) continue;
      const estado = this.mapEstado(item[G_ESTADO]);
      count++;
      const dni = this.soloDigitos(String(item[G_DNI] ?? ''));
      if (dni) this.guardarUltima(porDni, dni, { fecha, estado });
      const tel = this.soloDigitos(String(item[G_CELULAR] ?? '')).slice(-9);
      if (tel.length >= 9) this.guardarUltima(porTel, tel, { fecha, estado });
    }
    this.gestionesMes = count;
    return { porDni, porTel };
  }

  /** Gestión SEDES → un índice (DNI/teléfono) POR CADA sede (TIENDA SEDE).
   *  Fuente = tabla `gestion` de BD (lo migrado al "Sincronizar" en Control Gestión Sede
   *  + lo registrado directo por plataforma), NO el Google Sheet. */
  private async cargarGestionSedes(): Promise<Map<string, IndiceGestion>> {
    const mes = this.fecha.getMonth(), anio = this.fecha.getFullYear();
    // Solo el mes seleccionado (la BD filtra por marca_temporal) → payload mínimo.
    const desde = new Date(anio, mes, 1);
    const hasta = new Date(anio, mes + 1, 0);
    let data: any[] = [];
    try {
      data = await lastValueFrom(this.sheets.getGestionSedesDB({ desde, hasta }));
    } catch {
      throw new Error('No se pudo cargar la gestión SEDES (revisa la conexión al servidor).');
    }

    const porSede = new Map<string, IndiceGestion>();
    this.gestionesTotalPorSede = new Map();
    let count = 0;
    for (const item of data) {
      const fecha = this.parseMarcaTemporal(item[GS_FECHA]);
      if (!fecha || fecha.getMonth() !== mes || fecha.getFullYear() !== anio) continue;
      const sedeKey = this.sedeCfg.normalizar(item[GS_SEDE] ?? '');
      if (!sedeKey) continue;
      const estado = this.mapEstado(item[GS_ESTADO]);
      count++;
      this.gestionesTotalPorSede.set(sedeKey, (this.gestionesTotalPorSede.get(sedeKey) || 0) + 1);
      if (!porSede.has(sedeKey)) porSede.set(sedeKey, { porDni: new Map(), porTel: new Map() });
      const idx = porSede.get(sedeKey)!;
      const dni = this.soloDigitos(String(item[GS_DNI] ?? ''));
      if (dni) this.guardarUltima(idx.porDni, dni, { fecha, estado });
      const tel = this.soloDigitos(String(item[GS_CELULAR] ?? '')).slice(-9);
      if (tel.length >= 9) this.guardarUltima(idx.porTel, tel, { fecha, estado });
    }
    this.gestionesMes = count;
    return porSede;
  }

  /** Piso: ventas de la BASE = ventas (tabla `ventas`) de los DNIs de la cartera. Se
   *  indexa por DNI y luego se atribuye a la sede a la que la cartera asignó ese cliente.
   *  Además trae las metas por sede del mes. */
  private async cargarVentasYMetasSede(): Promise<void> {
    const anio = this.fecha.getFullYear(), mes = this.fecha.getMonth() + 1;
    this.ventasPorDni = new Map();
    try {
      const rows = await lastValueFrom(this.ventasSrv.obtenerVentas(anio, { mes }));
      for (const r of (rows || [])) {
        const est = (r.estado_venta || '').toString().toUpperCase();
        if (/NOTA DE/.test(est) || /INCAUTAC/.test(est)) continue;   // solo ventas efectivas
        const monto = Number(r.monto_consolidado) || 0;
        if (monto <= 0) continue;
        const dni = this.soloDigitos(String(r.doc_identidad ?? ''));
        if (!dni) continue;
        const cur = this.ventasPorDni.get(dni) || { ops: 0, monto: 0 };
        cur.ops += 1; cur.monto += monto;
        this.ventasPorDni.set(dni, cur);
      }
    } catch { /* sin ventas → el cuadro muestra 0 */ }
    try {
      this.metasCartera = (await lastValueFrom(this.ventasSrv.obtenerMetasAvance())) || {};
    } catch { this.metasCartera = {}; }
  }

  private mapEstado(raw: any): EstadoCliente {
    return (raw || '').toString().trim().toUpperCase() === 'CONTACTO' ? 'CONTACTO' : 'NO CONTACTO';
  }

  private guardarUltima(map: Map<string, RegGestion>, key: string, reg: RegGestion): void {
    const actual = map.get(key);
    if (!actual || reg.fecha > actual.fecha) map.set(key, reg);
  }

  // ── Agregados ──
  private agregarPorAsesor(clientes: ClienteCartera[]): ResumenAsesor[] {
    const map = new Map<string, ResumenAsesor>();
    for (const c of clientes) {
      let r = map.get(c.asesor);
      if (!r) { r = { asesor: c.asesor, asignados: 0, gestionados: 0, contacto: 0, noContacto: 0, pendientes: 0, avance: 0 }; map.set(c.asesor, r); }
      r.asignados++;
      if (c.estado === 'PENDIENTE') r.pendientes++;
      else { r.gestionados++; if (c.estado === 'CONTACTO') r.contacto++; else r.noContacto++; }
    }
    map.forEach(r => { r.avance = r.asignados > 0 ? Math.round((r.gestionados / r.asignados) * 100) : 0; });
    return Array.from(map.values()).sort((a, b) => b.avance - a.avance || b.asignados - a.asignados);
  }

  /** Arma el resumen por sede (asignados/gestionados + ventas de la base + metas/derivados).
   *  `metaPrefix` = prefijo de la clave de meta (por mes y grupo); `legacyPrefix` = clave
   *  anterior (sin mes) usada como respaldo para no perder lo ya cargado. */
  private buildSedes(clientes: ClienteCartera[], metaPrefix: string, legacyPrefix: string): ResumenSede[] {
    const map = new Map<string, ResumenSede>();
    for (const c of clientes) {
      const key = c.sedeKey || 'sin-sede';
      let r = map.get(key);
      if (!r) { r = { sedeKey: c.sedeKey, sede: c.sedeNombre || 'SIN SEDE', asignados: 0, gestionados: 0, contacto: 0, noContacto: 0, pendientes: 0, avance: 0, gestionesTotal: 0, intensidad: 0, nVentas: 0, monto: 0, ticket: 0, meta: 0, proyeccion: 0, avanceMeta: 0, metaKey: '' }; map.set(key, r); }
      r.asignados++;
      if (c.estado === 'PENDIENTE') r.pendientes++;
      else { r.gestionados++; if (c.estado === 'CONTACTO') r.contacto++; else r.noContacto++; }
      // Ventas de la BASE: si este cliente (por DNI) compró, suma a la sede a la que fue asignado.
      const s = c.dni ? this.ventasPorDni.get(c.dni) : null;
      if (s) { r.nVentas += s.ops; r.monto += s.monto; }
    }
    const hoy = new Date();
    const esMesActual = hoy.getMonth() === this.fecha.getMonth() && hoy.getFullYear() === this.fecha.getFullYear();
    const diasMes = new Date(this.fecha.getFullYear(), this.fecha.getMonth() + 1, 0).getDate();
    const diasTrans = esMesActual ? Math.max(1, hoy.getDate()) : diasMes;
    map.forEach(r => {
      r.avance = r.asignados > 0 ? Math.round((r.gestionados / r.asignados) * 100) : 0;
      r.gestionesTotal = this.gestionesTotalPorSede.get(r.sedeKey) || 0;
      r.intensidad = r.gestionados > 0 ? Math.round((r.gestionesTotal / r.gestionados) * 100) / 100 : 0;
      r.ticket = r.nVentas > 0 ? Math.round(r.monto / r.nVentas) : 0;
      const sk = r.sedeKey || 'sin-sede';
      r.metaKey = metaPrefix + sk;   // se guarda por mes
      r.meta = this.metasCartera[r.metaKey] || (legacyPrefix ? this.metasCartera[legacyPrefix + sk] : 0) || 0;   // respaldo: clave anterior
      r.proyeccion = Math.round(r.monto / diasTrans * diasMes);
      r.avanceMeta = r.meta > 0 ? Math.round((r.monto / r.meta) * 100) : 0;
    });
    return Array.from(map.values()).sort((a, b) => b.avance - a.avance || b.asignados - a.asignados);
  }

  private construirResumenSedes(clientes: ClienteCartera[]): void {
    // Prefijo por MES seleccionado → las metas se guardan por mes (cada mes independiente).
    const ym = `${this.fecha.getFullYear()}-${String(this.fecha.getMonth() + 1).padStart(2, '0')}`;
    // Respaldo de las metas ya cargadas (clave sin mes): solo se usa en el mes en curso,
    // para no perder lo puesto; los demás meses arrancan limpios.
    const hoy = new Date();
    const esMesActual = hoy.getMonth() === this.fecha.getMonth() && hoy.getFullYear() === this.fecha.getFullYear();
    const legacy = esMesActual ? 'cartera:' : '';
    const legacyG = (g: string) => esMesActual ? 'cartera:' + g + ':' : '';
    this.resumenSedes = this.buildSedes(clientes, `cartera:${ym}:`, legacy);
    this.sedesDisponiblesDetalle = this.resumenSedes.map(s => ({ key: s.sedeKey || 'sin-sede', nombre: s.sede }));
    // Cuadro consolidado general (Todos) + un cuadro separado por cada grupo de tipo de cliente.
    this.consolidado = this.buildSedes(this.clientes, `cartera:${ym}:`, legacy);
    const grupos = [...new Set(this.clientes.map(c => this.grupoTipo(c.tipoCliente)))].sort();
    this.consolidadoGrupos = (grupos.length > 1 || (grupos.length === 1 && grupos[0] !== 'SIN TIPO'))
      ? grupos.map(g => ({
          grupo: g,
          filas: this.buildSedes(this.clientes.filter(c => this.grupoTipo(c.tipoCliente) === g), `cartera:${ym}:${g}:`, legacyG(g)),
        }))
      : [];   // si no hay tipos reales, no muestra cuadros por grupo
  }

  /** Agrupa el valor crudo de TipoCliente en el nombre de cuadro (como el Excel):
   *  NUEVO → Afiliaciones · Reenganche/Cancelado → Lover A · Dormidos/No Vigentes → Lover B. */
  private grupoTipo(tipo: string): string {
    const t = (tipo || '').toString().toUpperCase();
    if (!t || t === 'SIN TIPO') return 'SIN TIPO';
    if (/NUEVO|AFILIAC/.test(t)) return 'AFILIACIONES (Nuevos)';
    if (/LOVER\s*A|REENGANCHE|CANCELAD/.test(t)) return 'LOVER A — Reenganche / Cancelado';
    if (/LOVER\s*B|DORMIDO|NO\s*VIGENTE/.test(t)) return 'LOVER B — Dormidos / No Vigentes';
    return t;   // cualquier otro valor se muestra tal cual
  }

  /** Fila "Total general" de un cuadro (se recalcula al vuelo; datos pequeños). */
  tot(s: ResumenSede[]) {
    const asignados = s.reduce((a, r) => a + r.asignados, 0);
    const gestionados = s.reduce((a, r) => a + r.gestionados, 0);
    const gestionesTotal = s.reduce((a, r) => a + r.gestionesTotal, 0);
    const nVentas = s.reduce((a, r) => a + r.nVentas, 0);
    const monto = s.reduce((a, r) => a + r.monto, 0);
    const meta = s.reduce((a, r) => a + r.meta, 0);
    const proyeccion = s.reduce((a, r) => a + r.proyeccion, 0);
    const pendientes = s.reduce((a, r) => a + r.pendientes, 0);
    return {
      asignados, gestionados, gestionesTotal, nVentas, monto, meta, proyeccion, pendientes,
      intensidad: gestionados > 0 ? Math.round((gestionesTotal / gestionados) * 100) / 100 : 0,
      ticket: nVentas > 0 ? Math.round(monto / nVentas) : 0,
      avanceMeta: meta > 0 ? Math.round((monto / meta) * 100) : 0,
    };
  }

  /** Edita la meta de una sede (persiste con la clave del cuadro: cartera:[grupo:]<sede>). */
  onMetaCartera(r: ResumenSede, valor: any): void {
    r.meta = Number(String(valor).replace(/[^0-9.]/g, '')) || 0;
    r.avanceMeta = r.meta > 0 ? Math.round((r.monto / r.meta) * 100) : 0;
    this.metasCartera[r.metaKey] = r.meta;
    this.ventasSrv.guardarMetaAvance(r.metaKey, r.meta).subscribe({ error: () => {} });
  }
  claseMeta(pct: number): string { return pct >= 80 ? 'av-ok' : pct >= 40 ? 'av-medio' : 'av-bajo'; }
  soles(n: number): string { return 'S/ ' + Math.round(n || 0).toLocaleString('es-PE'); }

  private calcularGlobales(clientes: ClienteCartera[]): void {
    this.totalCartera = clientes.length;
    this.totalContacto = clientes.filter(c => c.estado === 'CONTACTO').length;
    this.totalNoContacto = clientes.filter(c => c.estado === 'NO CONTACTO').length;
    this.totalGestionados = this.totalContacto + this.totalNoContacto;
    this.totalPendientes = clientes.filter(c => c.estado === 'PENDIENTE').length;
    this.avanceGlobal = this.totalCartera > 0 ? Math.round((this.totalGestionados / this.totalCartera) * 100) : 0;
  }

  // Piso: al elegir/limpiar una sede, TODA la vista (KPIs, gráficos, tabla por
  // asesor y export) se enfoca en esa sede; sin sede vuelve a la vista global.
  onSedeDetalleChanged(): void {
    this.recomputarVista();
  }

  get nombreSedeDetalle(): string {
    return this.sedesDisponiblesDetalle.find(x => x.key === this.sedeDetalle)?.nombre ?? '';
  }

  /** Subconjunto de clientes según el scope actual (sede seleccionada en Piso). */
  private subsetActual(): ClienteCartera[] {
    return (this.modo === 'piso' && this.sedeDetalle)
      ? this.clientes.filter(c => (c.sedeKey || 'sin-sede') === this.sedeDetalle)
      : this.clientes;
  }

  /** Recalcula KPIs, gráficos y tabla por asesor para el scope actual. */
  private recomputarVista(): void {
    const subset = this.subsetActual();
    this.calcularGlobales(subset);
    this.construirPorDia(subset);
    this.construirDistribucion();
    this.construirProyeccion();
    // En Piso global (sin sede) la tabla principal es "por sede"; con sede, "por asesor".
    this.resumenAsesores = (this.esPiso && !this.sedeDetalle) ? [] : this.agregarPorAsesor(subset);
  }

  private construirPorDia(clientes: ClienteCartera[]): void {
    this.diasMes = new Date(this.fecha.getFullYear(), this.fecha.getMonth() + 1, 0).getDate();
    const filas: { dia: string; Contacto: number; 'No Contacto': number; Total: number }[] = [];
    for (let d = 1; d <= this.diasMes; d++) filas.push({ dia: String(d), Contacto: 0, 'No Contacto': 0, Total: 0 });
    clientes.forEach(c => {
      if (c.estado === 'PENDIENTE' || !c.diaGestion) return;
      const f = filas[c.diaGestion - 1];
      if (!f) return;
      if (c.estado === 'CONTACTO') f.Contacto++; else f['No Contacto']++;
      f.Total++;
    });
    this.porDia = filas;
  }

  private construirDistribucion(): void {
    this.distribucion = [
      { tipo: 'Contacto', valor: this.totalContacto, color: '#2E9E5B' },
      { tipo: 'No Contacto', valor: this.totalNoContacto, color: '#E0603A' },
      { tipo: 'Pendiente', valor: this.totalPendientes, color: '#9AA7BB' },
    ];
  }

  private construirProyeccion(): void {
    const hoy = new Date();
    const esMesActual = hoy.getMonth() === this.fecha.getMonth() && hoy.getFullYear() === this.fecha.getFullYear();
    this.diasTranscurridos = esMesActual ? hoy.getDate() : this.diasMes;
    this.ritmoDiario = this.diasTranscurridos > 0 ? Math.round(this.totalGestionados / this.diasTranscurridos) : 0;
    this.diasParaTerminar = this.ritmoDiario > 0 ? Math.ceil(this.totalPendientes / this.ritmoDiario) : 0;
  }

  claseAvance(pct: number): string {
    if (pct >= 80) return 'av-ok';
    if (pct >= 50) return 'av-medio';
    return 'av-bajo';
  }

  // ── Exportaciones ──
  async exportarPendientes(): Promise<void> {
    const subset = this.subsetActual();
    const pendientes = subset.filter(c => c.estado === 'PENDIENTE');
    if (!pendientes.length) { this.error = 'No hay clientes pendientes para exportar.'; return; }
    const suf = this.esPiso && this.sedeDetalle ? `_${this.nombreSedeDetalle}_PENDIENTES` : '_PENDIENTES';
    await this.exportarClientes(pendientes, 'Pendientes', suf, false);
  }

  async exportarDetalle(): Promise<void> {
    const subset = this.subsetActual();
    if (!subset.length) return;
    const suf = this.esPiso && this.sedeDetalle ? `_${this.nombreSedeDetalle}_DETALLE` : '_DETALLE';
    await this.exportarClientes(subset, 'Detalle', suf, true);
  }

  private async exportarClientes(lista: ClienteCartera[], hoja: string, sufijo: string, conEstado: boolean): Promise<void> {
    const wb = new Workbook();
    const ws = wb.addWorksheet(hoja);
    const headers = conEstado
      ? [...this.headersOriginales, 'ESTADO AVANCE', 'FECHA GESTIÓN']
      : [...this.headersOriginales];

    const hr = ws.addRow(headers);
    hr.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A5FAD' } };
      cell.alignment = { horizontal: 'left', vertical: 'middle' };
    });

    for (const c of lista) {
      const base = this.headersOriginales.map(h => c.raw[h] ?? '');
      const extra = conEstado ? [c.estado, c.fechaGestion ? c.fechaGestion.toLocaleDateString('es-PE') : ''] : [];
      const row = ws.addRow([...base, ...extra]);
      if (conEstado) {
        const argb = c.estado === 'CONTACTO' ? 'FFD6F5DD' : c.estado === 'NO CONTACTO' ? 'FFFAD9CE' : 'FFECEFF3';
        row.getCell(headers.length - 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
      }
    }

    ws.columns.forEach(col => { col.width = 16; });
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const nombre = this.nombreArchivo.replace(/\.[^/.]+$/, '') || 'cartera';
    FileSaver.saveAs(blob, `${nombre}${sufijo}.xlsx`);
  }

  // ── Helpers ──
  private buscarHeader(headers: string[], candidatos: string[]): string | undefined {
    for (const c of candidatos) {
      const h = this.buscarHeaderExacto(headers, c);
      if (h) return h;
    }
    return undefined;
  }

  private buscarHeaderExacto(headers: string[], objetivo: string): string | undefined {
    const o = this.normHeader(objetivo);
    return headers.find(h => this.normHeader(h) === o);
  }

  private buscarHeaderIncluye(headers: string[], fragmentos: string[]): string | undefined {
    return headers.find(h => {
      const n = this.normHeader(h);
      return fragmentos.some(f => n.includes(f));
    });
  }

  private normHeader(s: string): string {
    return s.toString().toLowerCase().trim().normalize('NFD')
      .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  }

  private extraerNumeros(valor: any): string[] {
    if (valor === null || valor === undefined) return [];
    const t = String(valor).trim();
    if (!t) return [];
    return t.split(/[\/,;\n\r|]+/).map(p => p.replace(/\D/g, '')).filter(p => p.length > 0);
  }

  private soloDigitos(v: string): string { return (v || '').toString().replace(/\D/g, ''); }

  private parseMarcaTemporal(texto: any): Date | null {
    if (!texto || typeof texto !== 'string') return null;
    const m = texto.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?/);
    if (!m) return null;
    const day = +m[1], month = +m[2] - 1, year = +m[3];
    let hour = m[4] ? +m[4] : 0; const min = m[5] ? +m[5] : 0; const sec = m[6] ? +m[6] : 0;
    const ap = m[7]?.toUpperCase();
    if (ap === 'PM' && hour < 12) hour += 12;
    if (ap === 'AM' && hour === 12) hour = 0;
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    const d = new Date(year, month, day, hour, min, sec);
    return isNaN(d.getTime()) ? null : d;
  }

  customizeTooltipPie = (arg: any) => ({ text: `${arg.argumentText}: ${arg.value} (${arg.percentText})` });
  customizeLabelPie = (arg: any) => `${arg.argumentText}: ${arg.valueText} (${arg.percentText})`;
  customizePointPie = (p: any) => ({ color: p.data?.color });
}
