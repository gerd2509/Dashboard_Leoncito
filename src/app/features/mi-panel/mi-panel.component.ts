import { Component, OnInit, inject } from '@angular/core';
import { forkJoin } from 'rxjs';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { CargaVentasService } from '../../services/carga-ventas.service';
import { SedeConfigService } from '../../services/sede-config.service';
import { SheetsService } from '../../services/service-google.service';
import { ASESORES_CALL } from '../../shared/asesores';

interface Agrupado { clave: string; monto: number; n: number; }
interface HistMes {
  mes: string;        // 'YYYY-MM' (clave para ordenar)
  mesLabel: string;   // 'Jul - 2026' (eje)
  monto: number;
  n: number;
  crecimiento: number;        // % vs mes anterior
  proyeccion: number | null;  // solo el mes en curso
}

@Component({
  selector: 'app-mi-panel',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './mi-panel.component.html',
  styleUrl: './mi-panel.component.css',
})
export class MiPanelComponent implements OnInit {
  private auth = inject(AuthService);
  private ventasSvc = inject(CargaVentasService);
  private fb = inject(UntypedFormBuilder);
  private sedeCfg = inject(SedeConfigService);
  private sheets = inject(SheetsService);

  nombre = '';
  vendedor = '';
  canal = '';
  sedeNombre = '';   // sede a la que pertenece (para la cabecera)
  sinVendedor = false;
  cargando = false;
  error = '';

  form!: UntypedFormGroup;      // rango opcional { desde, hasta }

  // Paneles colapsables (acordeón). Abiertos por defecto: gestiones + resumen.
  abiertos: Record<string, boolean> = { gestiones: true, resumen: true, graficos: false, evolucion: false, detalle: false };
  togglePanel(k: string): void {
    this.abiertos[k] = !this.abiertos[k];
    // Los gráficos DevExtreme se dibujan a 0px si el panel nace colapsado; al
    // abrirlo forzamos un redraw tras la animación de expansión.
    if (this.abiertos[k]) setTimeout(() => window.dispatchEvent(new Event('resize')), 420);
  }

  private todas: any[] = [];    // todas las ventas del vendedor
  ventas: any[] = [];           // filtradas por el rango (para el detalle)

  // KPIs
  montoTotal = 0;
  numVentas = 0;
  ticket = 0;
  montoMes = 0;

  porEntidad: Agrupado[] = [];
  porTipo: Agrupado[] = [];
  historial: HistMes[] = [];

  // ── Mis gestiones del DÍA EN CURSO (Call / Realzza) ──
  gestAplica = false;    // solo canal call/realzza
  gestCargando = false;
  gestHoyLabel = '';     // fecha de hoy (dd/mm/yyyy) para mostrar
  // Generales (llamadas) del día
  gestReales = 0;        // gestiones reales = 1 por DNI
  gestContacto = 0;
  gestCorta = 0;
  gestNoContacto = 0;
  gestPct = 0;           // % de contactabilidad
  gestChart: { clave: string; valor: number; color: string }[] = [];
  // KOMMO del día
  kommoTotal = 0; kommoContacto = 0; kommoNoContacto = 0;
  // Market Place del día
  mpTotal = 0; mpContacto = 0; mpNoContacto = 0;

  ngOnInit(): void {
    const u = this.auth.getUsuario();
    this.nombre = u?.nombre || '';
    this.vendedor = (u?.vendedor || '').trim();
    this.canal = u?.canal || '';
    const sede = (u?.sede || '').trim();
    this.sedeNombre = this.sedeCfg.getConfig(sede)?.nombre
      ?? (sede ? sede.charAt(0).toUpperCase() + sede.slice(1) : '');
    this.form = this.fb.group({ desde: [null], hasta: [null] });
    if (!this.vendedor) { this.sinVendedor = true; return; }
    this.cargar();
    this.cargarGestiones();
  }

  /**
   * Avance de gestiones del asesor del DÍA EN CURSO (Call / Realzza). Trae la hoja
   * de gestión general del canal (Call: getSheetData; Realzza: getSheetDataCampo,
   * que es un formulario/conexión distinta) y la hoja KOMMO, y filtra por el NOMBRE
   * del asesor y la fecha de hoy. Muestra gestiones generales + KOMMO + Market Place.
   */
  cargarGestiones(): void {
    const canal = (this.canal || '').toLowerCase();
    if (canal !== 'call' && canal !== 'realzza') { this.gestAplica = false; return; }
    this.gestAplica = true;
    this.gestCargando = true;

    // Columnas según canal. OJO: la hoja general usa 'ESTADO DE GESTIÓN' para ambos
    // canales; la hoja KOMMO usa 'ESTADO DE GESTIÓN REALZZA' para Realzza (columnas
    // separadas porque combina Call y Realzza). El asesor sí cambia por canal.
    const colAsesor = canal === 'call' ? 'ASESOR CONTACT' : 'ASESOR REALZZA';
    const colEstadoGeneral = 'ESTADO DE GESTIÓN';
    const colEstadoKommo = canal === 'call' ? 'ESTADO DE GESTIÓN' : 'ESTADO DE GESTIÓN REALZZA';
    const colMarket = canal === 'call' ? 'MARKET PLACE L' : 'MARKET PLACE R';

    const hoy = new Date();
    this.gestHoyLabel = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`;
    const rango = { desde: hoy, hasta: hoy };   // solo el día en curso (filtra en el backend)

    // Respuestas del SHEET, igual que en los componentes Gestión Call / Realzza /
    // KOMMO. Cada canal es su propia hoja (Realzza = /campo, distinta a Call = /call);
    // en KOMMO se distingue KOMMO vs Market Place por la columna MARKET PLACE L/R.
    const general = canal === 'call'
      ? this.sheets.getSheetDataCallRango(rango)
      : this.sheets.getSheetDataCampoRango(rango);

    forkJoin({ general, kommo: this.sheets.getSheetKOMMORango(rango) }).subscribe({
      next: ({ general, kommo }) => {
        this.procesarGeneral(general || [], colAsesor, colEstadoGeneral, hoy);
        this.procesarKommo(kommo || [], colAsesor, colEstadoKommo, colMarket, hoy);
        this.gestCargando = false;
      },
      error: () => { this.gestCargando = false; },
    });
  }

  /** ¿La marca temporal cae en la fecha dada? Tolera 'dd/mm/yyyy hh:mm' e ISO 'yyyy-mm-dd'. */
  private esFecha(marca: any, d: Date): boolean {
    const s = (marca ?? '').toString().trim();
    if (!s) return false;
    const fecha = s.split(/[ T]/)[0];
    let dd: number, mm: number, yy: number;
    if (fecha.includes('/')) { const p = fecha.split('/'); dd = +p[0]; mm = +p[1]; yy = +p[2]; }
    else if (fecha.includes('-')) { const p = fecha.split('-'); yy = +p[0]; mm = +p[1]; dd = +p[2]; }
    else return false;
    return dd === d.getDate() && mm === (d.getMonth() + 1) && yy === d.getFullYear();
  }
  private mios(rows: any[], colAsesor: string, d: Date): any[] {
    const nombre = this.vendedor.toUpperCase().trim();
    return rows.filter(r =>
      (r[colAsesor] ?? '').toString().toUpperCase().trim() === nombre && this.esFecha(r['Marca temporal'], d));
  }
  /** Categoriza una gestión: CONTACTO > CORTA > NOCONTACTO (o null). */
  private categoria(r: any, colEstado: string): 'CONTACTO' | 'CORTA' | 'NOCONTACTO' | null {
    const est = (r[colEstado] ?? '').toString().toUpperCase().trim();
    if (est === 'CONTACTO') return r['MOTIVO NO INTERÉS'] === 'CORTA LLAMADA' ? 'CORTA' : 'CONTACTO';
    if (est === 'NO CONTACTO') return 'NOCONTACTO';
    return null;
  }

  /** Gestiones GENERALES (llamadas) del día: 1 por DNI, con el mejor resultado. */
  private procesarGeneral(rows: any[], colAsesor: string, colEstado: string, d: Date): void {
    const rank = (c: string) => (c === 'CONTACTO' ? 3 : c === 'CORTA' ? 2 : 1);
    const porDni = new Map<string, string>();
    this.mios(rows, colAsesor, d).forEach((r, i) => {
      const cat = this.categoria(r, colEstado);
      if (!cat) return;
      const dni = (r['DNI CLIENTE'] ?? '').toString().replace(/\D/g, '').replace(/^0+/, '');
      const clave = dni ? `dni:${dni}` : `row:${i}`;
      const prev = porDni.get(clave);
      if (!prev || rank(cat) > rank(prev)) porDni.set(clave, cat);
    });
    let contacto = 0, corta = 0, nocont = 0;
    porDni.forEach(c => { if (c === 'CONTACTO') contacto++; else if (c === 'CORTA') corta++; else nocont++; });
    this.gestReales = porDni.size;
    this.gestContacto = contacto;
    this.gestCorta = corta;
    this.gestNoContacto = nocont;
    this.gestPct = this.gestReales ? Math.round((contacto / this.gestReales) * 100) : 0;
    this.gestChart = [
      { clave: 'Contacto', valor: contacto, color: '#2E7D32' },
      { clave: 'Corta llamada', valor: corta, color: '#F9A825' },
      { clave: 'No contacto', valor: nocont, color: '#C62828' },
    ];
  }

  /** KOMMO y Market Place del día (hoja KOMMO). SI en la col. Market Place = market. */
  private procesarKommo(rows: any[], colAsesor: string, colEstado: string, colMarket: string, d: Date): void {
    const esMp = (r: any) => {
      const v = (r[colMarket] ?? '').toString().toUpperCase().trim();
      return v === 'SI' || v === 'SÍ';
    };
    const cuenta = (registros: any[]) => {
      let contacto = 0, corta = 0, nocont = 0;
      registros.forEach(r => {
        const cat = this.categoria(r, colEstado);
        if (cat === 'CONTACTO') contacto++; else if (cat === 'CORTA') corta++; else if (cat === 'NOCONTACTO') nocont++;
      });
      return { total: contacto + corta + nocont, contacto, nocont };
    };
    const mios = this.mios(rows, colAsesor, d);
    const k = cuenta(mios.filter(r => !esMp(r)));   // KOMMO = NO market place
    const m = cuenta(mios.filter(r => esMp(r)));    // Market Place = SI
    this.kommoTotal = k.total; this.kommoContacto = k.contacto; this.kommoNoContacto = k.nocont;
    this.mpTotal = m.total; this.mpContacto = m.contacto; this.mpNoContacto = m.nocont;
  }

  cargar(): void {
    this.cargando = true; this.error = '';
    // Fuente según canal:
    //  · Call    → tabla ventas_call    (evolutivo propio: mes actual + meses anteriores).
    //  · Realzza → tabla ventas_realzza (el "vendedor" es la sede; NC/refact por mes de afectación).
    //  · Sedes   → tabla ventas (afectaciones), como hasta ahora.
    const canal = (this.canal || '').toLowerCase();
    // En Ventas Call cada asesor se identifica por su CÓDIGO (CC1, CC5, …); la
    // tabla ventas_call guarda el código en `vendedor`, así que mapeamos el
    // nombre del usuario a su código antes de filtrar.
    const obs = canal === 'call'
      ? this.ventasSvc.obtenerVentasCanal('call', { vendedor: this.codigoCall(this.vendedor) })
      : canal === 'realzza'
        ? this.ventasSvc.obtenerVentasCanal('realzza', { vendedor: this.vendedor })
        : this.ventasSvc.obtenerVentasPorVendedor(this.vendedor);
    obs.subscribe({
      next: (rows) => { this.todas = rows || []; this.aplicar(); this.cargando = false; },
      error: () => { this.error = 'No se pudieron cargar tus ventas.'; this.cargando = false; },
    });
  }

  /**
   * Código del asesor Call (CC1, CC5…) a partir del nombre guardado en el usuario.
   * En Ventas Call la identidad es el código, no el nombre. Si el valor ya es un
   * código o no se encuentra, se devuelve tal cual para no romper el filtro.
   */
  private codigoCall(valor: string): string {
    const v = (valor || '').trim().toUpperCase();
    const a = ASESORES_CALL.find(x => x.nombre.toUpperCase() === v || x.value.toUpperCase() === v);
    return a ? a.value : (valor || '').trim();
  }

  /**
   * ¿La fila es una afectación que RESTA del monto real? (nota de crédito,
   * refacturación o incautación). Es la misma venta re-estampada con su fecha de
   * afectación (mes_af/anio_af): suma en su mes de venta y revierte en el de afectación.
   * PRONTO PAGO / CANCELADO / ACTIVO son ventas válidas y NO restan.
   */
  private esReductor(r: any): boolean {
    const e = (r?.estado_venta || '').toString().toUpperCase();
    return e.includes('NOTA DE CR') || e.includes('INCAUTAC') || e.includes('REFACTUR');
  }

  /** Aplica el rango de fechas (si hay) y recalcula KPIs, agrupaciones e historial. */
  aplicar(): void {
    const desde = this.form.value.desde ? this.ymd(this.form.value.desde) : null;
    const hasta = this.form.value.hasta ? this.ymd(this.form.value.hasta) : null;
    let rows = this.todas;
    if (desde || hasta) {
      rows = rows.filter(r => {
        const f = (r.fecha_cv || '').toString().slice(0, 10);
        if (!f) return false;
        if (desde && f < desde) return false;
        if (hasta && f > hasta) return false;
        return true;
      });
    }
    this.ventas = rows;

    // Monto real = ventas − (NC / refacturaciones / incautaciones). Como cada
    // afectación es la misma venta revertida, su aporte neto total es 0.
    this.montoTotal = rows.reduce((s, r) => s + (this.esReductor(r) ? 0 : Number(r.monto_consolidado || 0)), 0);
    this.numVentas = rows.filter(r => !this.esReductor(r)).length;
    this.ticket = this.numVentas ? this.montoTotal / this.numVentas : 0;

    // Mes en curso: suma ventas cuyo mes de VENTA es el actual y resta las
    // afectaciones cuyo mes de AFECTACIÓN es el actual (así cuadra el monto real).
    const hoy = new Date(), ay = hoy.getFullYear(), am = hoy.getMonth() + 1;
    this.montoMes = rows.reduce((s, r) => {
      let v = 0;
      const m = Number(r.monto_consolidado || 0);
      if (Number(r.anio_cv) === ay && Number(r.mes_cv) === am) v += m;
      if (this.esReductor(r) && Number(r.anio_af) === ay && Number(r.mes_af) === am) v -= m;
      return s + v;
    }, 0);

    this.porEntidad = this.agrupar(rows, 'entidad');
    this.porTipo = this.agrupar(rows, 'tipo_credito');

    // Historial estilo "Evolución de Ventas Mensual": área de monto + % de
    // crecimiento vs mes anterior + proyección del mes en curso.
    const base = this.porMes(rows);
    const hoyKey = `${ay}-${String(am).padStart(2, '0')}`;
    const diaHoy = hoy.getDate();
    const diasMes = new Date(ay, am, 0).getDate();
    let prev: number | null = null;
    this.historial = base.map(b => {
      let crecimiento = 0;
      if (prev !== null) crecimiento = prev > 0 ? Math.round(((b.monto - prev) / prev) * 100) : 0;
      prev = b.monto;
      let proyeccion: number | null = null;
      if (b.mes === hoyKey && diaHoy > 0 && b.monto > 0) proyeccion = Math.round((b.monto / diaHoy) * diasMes);
      return { mes: b.mes, mesLabel: this.formatMes(b.mes), monto: b.monto, n: b.n, crecimiento, proyeccion };
    });
  }

  /** Agrupa por un campo sumando el monto real (las afectaciones netean a 0). */
  private agrupar(rows: any[], campo: string): Agrupado[] {
    const m = new Map<string, Agrupado>();
    for (const r of rows) {
      if (this.esReductor(r)) continue;   // la venta se revierte → no aporta al neto
      const k = (r[campo] ?? '').toString().trim() || '—';
      if (!m.has(k)) m.set(k, { clave: k, monto: 0, n: 0 });
      const o = m.get(k)!; o.monto += Number(r.monto_consolidado || 0); o.n++;
    }
    return [...m.values()].sort((a, b) => b.monto - a.monto);
  }

  /**
   * Historial mensual del monto real: cada venta suma en su mes de VENTA (CV) y
   * las afectaciones restan en su mes de AFECTACIÓN (AF). Así una venta anulada
   * un mes posterior mantiene su mes original y descuenta en el mes de la NC.
   */
  private porMes(rows: any[]): { mes: string; monto: number; n: number }[] {
    const m = new Map<string, { mes: string; monto: number; n: number }>();
    const add = (a: number, me: number, monto: number, dn: number) => {
      if (!a || !me) return;
      const k = `${a}-${String(me).padStart(2, '0')}`;
      if (!m.has(k)) m.set(k, { mes: k, monto: 0, n: 0 });
      const o = m.get(k)!; o.monto += monto; o.n += dn;
    };
    for (const r of rows) {
      const monto = Number(r.monto_consolidado || 0);
      add(Number(r.anio_cv), Number(r.mes_cv), monto, 1);                 // venta en su mes CV
      if (this.esReductor(r)) add(Number(r.anio_af), Number(r.mes_af), -monto, -1); // reversa en su mes AF
    }
    return [...m.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  }

  private ymd(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  limpiarRango(): void { this.form.patchValue({ desde: null, hasta: null }); this.aplicar(); }

  soles(v: number): string { return 'S/ ' + Math.round(v || 0).toLocaleString('es-PE'); }
  formatoSoles = (arg: any) => this.soles(arg.value);

  // 'YYYY-MM' → 'Jul - 2026'
  private readonly MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Set', 'Oct', 'Nov', 'Dic'];
  formatMes(ym: string): string {
    const m = (ym || '').toString().match(/^(\d{4})-(\d{2})/);
    return m ? `${this.MESES[+m[2] - 1] || m[2]} - ${m[1]}` : ym;
  }
  mesAxisLabel = (arg: any) => this.formatMes(arg.value);

  /** Colorea cada barra del gráfico de gestiones con su color. */
  gestPoint = (info: any) => ({ color: info.data?.color });

  // ── Historial "Evolución de Ventas Mensual" (estilo Comparativo) ──
  /** Colorea los puntos de la línea de crecimiento: verde +, rojo −, gris 0. */
  histPoint = (info: any) => {
    if (info.seriesName === 'Crecimiento (%)') {
      const v = info.data?.crecimiento ?? 0;
      return {
        color: v > 0 ? '#4CAF50' : v < 0 ? '#F44336' : '#9E9E9E',
        hoverStyle: { color: v > 0 ? '#66BB6A' : v < 0 ? '#E57373' : '#BDBDBD' },
      };
    }
    return {};
  };
  histMonto = (info: any): string => {
    const v = Number(info.value);
    return v ? `S/ ${v.toLocaleString('es-PE', { maximumFractionDigits: 0 })}` : '';
  };
  histCrec = (info: any): string => {
    const v = info.value as number;
    if (v === 0 || v == null) return '0%';
    return `${v > 0 ? '+' : ''}${v}%`;
  };
  histProy = (info: any): string => {
    const v = Number(info.value);
    return v ? `Proy: S/ ${v.toLocaleString('es-PE', { maximumFractionDigits: 0 })}` : '';
  };
  histTooltip = (p: any) => {
    if (p.seriesName === 'Crecimiento (%)') return { text: `Crecimiento: ${Math.round(p.value)}%` };
    if (p.seriesName === 'Proyección Mes Actual') return { text: `Proyección mes: ${this.soles(p.value)}` };
    return { text: `Monto: ${this.soles(p.value)}` };
  };
}
