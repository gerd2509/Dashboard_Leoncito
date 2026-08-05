import { Component, OnInit, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CargaVentasService } from '../../services/carga-ventas.service';
import { ASESORES_CALL, nombreCorto } from '../../shared/asesores';

type Estado = 'DERIVACION' | 'MANUAL' | 'PENDIENTE';
type Canal = 'call' | 'realzza' | 'sedes';

/**
 * Atribución de Ventas (un solo módulo, con selector Call / Realzza).
 *  - Call:    tabla `ventas` × gestion_call — asigna AsesorVenta (CC) + TipoCliente/TipoBase
 *             desde la última derivación (≤31 días). Editables: AsesorVenta/CONTACTO/
 *             TipoCliente/TipoBase. Se consolida a `ventas_call`.
 *  - Realzza: tabla `ventas_realzza` × gestion_realzza — TipoBase desde la última
 *             derivación (respeta el del import, solo llena vacíos) + margen/valor de
 *             `margen_ventas`. Editables: TipoBase / AsesorVenta.
 */
@Component({
  selector: 'app-atribucion-call',
  standalone: true,
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './atribucion-call.component.html',
  styleUrl: './atribucion-call.component.css',
})
export class AtribucionCallComponent implements OnInit {
  private svc = inject(CargaVentasService);
  private snack = inject(MatSnackBar);

  readonly meses = [
    { v: 0, t: 'Todo el año' }, { v: 1, t: 'Enero' }, { v: 2, t: 'Febrero' }, { v: 3, t: 'Marzo' },
    { v: 4, t: 'Abril' }, { v: 5, t: 'Mayo' }, { v: 6, t: 'Junio' }, { v: 7, t: 'Julio' }, { v: 8, t: 'Agosto' },
    { v: 9, t: 'Septiembre' }, { v: 10, t: 'Octubre' }, { v: 11, t: 'Noviembre' }, { v: 12, t: 'Diciembre' },
  ];
  anio = new Date().getFullYear();
  mes: number = new Date().getMonth() + 1;

  canal: Canal = 'call';
  get esRealzza(): boolean { return this.canal === 'realzza'; }
  get esSedes(): boolean { return this.canal === 'sedes'; }
  // Sub-selector de sede (solo en modo Sedes): Lambayeque / Ferreñafe.
  sede: 'LAMBAYEQUE' | 'FERREÑAFE' = 'LAMBAYEQUE';
  // Fuente generadora (Sedes) = TIPO DE BASE de la derivación.
  readonly fuenteOpciones = [
    'BBDD', 'REFERIDOS', 'TIENDA', 'CASERIOS', 'RECURRENTES NO ASIGNADOS', 'KOMMO', 'BBDD KOMMO',
    'MARKET PLACE', 'BRILLA', 'EFECTIVA', 'REDES SSENDA',
  ];

  cargando = false;
  consolidando = false;
  ventas: any[] = [];

  filtro: 'todos' | 'DERIVACION' | 'MANUAL' | 'PENDIENTE' = 'todos';

  // Búsqueda server-side por DNI sobre las ventas del mes.
  dni = '';
  buscando = false;
  yaBusco = false;
  resultados: any[] = [];

  // ── Opciones de los campos editables ──
  // AsesorVenta: los CC de Call + NAS (Call y Realzza comparten, porque las ventas
  // Realzza en tienda se atribuyen al asesor Call que derivó).
  readonly ccOpciones = [
    ...ASESORES_CALL.map(a => ({ cc: a.value, label: `${a.value} · ${nombreCorto(a.nombre)}` })),
    { cc: 'NAS', label: 'NAS' },
  ];
  // CONTACTO (Call): lista fija (origen del contacto).
  readonly contactoOpciones = ['BD', 'MARKET PLACE', 'KOMMO', 'BD KOMMO LEONCITO', 'NUEVO'];
  // TipoCliente / TipoBase (Call): los tipos que maneja la gestión Call.
  readonly tipoOpciones = [
    'DORMIDO', 'NUEVO', 'NO VIGENTE', 'VIGENTE', 'AFILIACIONES', 'LOVER A', 'LOVER B',
    'REENGANCHE', 'CANCELADO', 'BRILLA', 'SORTEO - LA VICTORIA', 'EFECTIVA',
  ];
  // TipoBase (Realzza): los que maneja la gestión Realzza.
  readonly tipoBaseRzOpciones = [
    'BBDD', 'CALL', 'KOMMO', 'BBDD KOMMO', 'TIENDA', 'REFERIDOS', 'BRILLA', 'EFECTIVA',
    'MARKET PLACE', 'RECURRENTES NO ASIGNADOS', 'REDES SSENDA',
  ];

  // ── Popup de edición ──
  editVisible = false;
  editando: any = null;
  modelo = { vendedor: '', contacto: '', tipo_cliente: '', tipo_base: '', asesor_venta: '', extranjero: false, fuente: '' };
  guardandoEdicion = false;

  ngOnInit(): void { this.cargar(); }

  /** Cambia de canal Call/Realzza: limpia la tabla al instante y recarga. */
  setCanal(c: Canal): void {
    if (this.canal === c) return;
    this.canal = c;
    this.filtro = 'todos';
    this.dni = ''; this.resultados = []; this.yaBusco = false;
    this.ventas = [];            // limpia de inmediato (cambié de sección)
    this.refrescarFilas();       // filas = [] hasta que llegue la data del nuevo canal
    this.cargar();
  }
  /** Cambia la sede (modo Sedes) y recarga. */
  setSede(s: 'LAMBAYEQUE' | 'FERREÑAFE'): void {
    if (this.sede === s) return;
    this.sede = s;
    this.filtro = 'todos'; this.dni = ''; this.resultados = []; this.yaBusco = false;
    this.ventas = []; this.refrescarFilas();
    this.cargar();
  }

  // Dinero como "S/ 2,076.92" (S/ con 2 decimales), igual que antes.
  montoTexto = (info: any): string => {
    const v = info?.value;
    if (v === null || v === undefined || v === '') return '';
    return 'S/ ' + Number(v).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  // Dinero SIN decimales (montos enteros), p. ej. la Cuota Inicial: "S/ 3,000".
  montoEnteroTexto = (info: any): string => {
    const v = info?.value;
    if (v === null || v === undefined || v === '') return '';
    return 'S/ ' + Number(v).toLocaleString('es-PE', { maximumFractionDigits: 0 });
  };

  /** Prepara una fila para el grid: montos numéricos + fecha/AF/estado ya calculados. */
  private mapRow = (r: any): any => ({
    ...r,
    monto_consolidado: +r.monto_consolidado || 0,
    cuota_inicial: +r.cuota_inicial || 0,
    valor_venta: r.valor_venta == null ? null : +r.valor_venta,
    margen_total: r.margen_total == null ? null : +r.margen_total,
    _fecha: this.fecha(r),
    _af: this.af(r),
    _estado: this.estado(r),
    _estadoTxt: this.estadoTxt(r),
  });

  /** Resalta las filas editadas a mano en el grid. */
  onRowPrepared = (e: any): void => {
    if (e.rowType === 'data' && e.data?._estado === 'MANUAL') e.rowElement.classList.add('row-manual');
    if (e.rowType === 'data' && e.data?.sin_derivacion) e.rowElement.classList.add('row-sinderiv');
  };

  cargar(): void {
    this.cargando = true;
    const obs = this.esSedes
      ? this.svc.listarAtribucionSede(this.sede, this.anio || undefined, this.mes || undefined)
      : this.svc.listarAtribucion(this.canal as 'call' | 'realzza', this.anio || undefined, this.mes || undefined);
    obs.subscribe({
      // Solo ventas con MontoConsolidado > 0 (misma regla que el módulo de ventas).
      next: rows => { this.ventas = (rows || []).filter(r => (+r.monto_consolidado || 0) > 0).map(this.mapRow); this.refrescarFilas(); this.cargando = false; },
      error: () => { this.cargando = false; this.ventas = []; this.refrescarFilas(); this.toast('❌ No se pudo cargar la lista.', true); },
    });
  }

  // Filas que muestra el grid: resultados de la búsqueda por DNI, o la lista filtrada.
  // Es un campo ESTABLE (no getter) para que el grid no se recargue en cada tecla del
  // filtro de columna (perdería el foco). Se recalcula solo al cambiar data/filtro.
  filas: any[] = [];
  // Alto del grid: se adapta a la cantidad de filas (crece hasta un máximo; ahí recién scroll).
  gridHeight = 240;
  private refrescarFilas(): void {
    this.filas = this.resultados.length ? this.resultados : this.ventas.filter(v => this.filtro === 'todos' || this.estado(v) === this.filtro);
    const n = this.filas.length;
    // Encabezado + fila de filtro + barra horizontal (~112) + filas + un respiro al final (~26).
    const alto = n ? 112 + n * 42 + 26 : 230;
    const max = Math.max(320, (typeof window !== 'undefined' ? window.innerHeight : 900) - 290);
    this.gridHeight = Math.min(alto, max);
  }
  /** Edita desde el botón del grid. */
  onEditClick = (e: any): void => this.abrirEdicion(e.row.data);

  /** Consolida el mes a la tabla histórica del canal (Call: ventas_call; Realzza: ventas_realzza). */
  consolidar(): void {
    this.consolidando = true;
    // Sedes: no hay tabla consolidada; el botón PERSISTE la fuente generadora (cruzar).
    if (this.esSedes) {
      this.svc.cruzarSede(this.sede, this.anio || undefined, this.mes || undefined).subscribe({
        next: r => { this.consolidando = false; this.toast(`✔ Atribuidas ${r.actualizados} ventas de ${this.sede} (fuente generadora).`); this.cargar(); },
        error: () => { this.consolidando = false; this.toast('❌ No se pudo atribuir.', true); },
      });
      return;
    }
    this.svc.consolidarVentas(this.canal as 'call' | 'realzza', this.anio || undefined, this.mes || undefined).subscribe({
      next: r => {
        this.consolidando = false;
        const destino = this.esRealzza ? 'Ventas Realzza' : 'Ventas Call';
        const detalle = this.esRealzza
          ? `${r.insertados} nuevas`
          : `${r.total} (${r.insertados} nuevas, ${r.actualizados} actualizadas)`;
        this.toast(`✔ Consolidado a ${destino}: ${detalle}.`);
        this.cargar();
      },
      error: () => { this.consolidando = false; this.toast('❌ No se pudo consolidar.', true); },
    });
  }

  // ── Estado / conteos ──
  /** ¿La venta tiene derivación? Call: hay CC sugerido. Realzza: flag `derivado`. */
  esDerivado(v: any): boolean { return (this.esRealzza || this.esSedes) ? !!v.derivado : !!v.cc_sugerido; }
  estado(v: any): Estado {
    const manual = this.esSedes ? v.manual : v.asesor_manual;
    if (manual) return 'MANUAL';
    if (this.esDerivado(v)) return 'DERIVACION';
    return 'PENDIENTE';
  }
  estadoTxt(v: any): string {
    const e = this.estado(v);
    const base = e === 'DERIVACION' ? 'Derivación' : e === 'MANUAL' ? 'Manual' : (this.esRealzza ? 'Sin derivación' : 'Pendiente');
    // Origen "sin derivación" (ago-2026+): se conserva la marca aunque ya se haya
    // editado a Manual, porque esa venta suma al global pero no al avance del asesor.
    return (v.sin_derivacion && e === 'MANUAL') ? `${base} · sin deriv.` : base;
  }
  estadoIcon(v: any): string {
    const e = this.estado(v);
    return e === 'MANUAL' ? 'edit' : e === 'DERIVACION' ? 'call_split' : 'help_outline';
  }
  get nDeriv(): number { return this.ventas.filter(v => this.estado(v) === 'DERIVACION').length; }
  get nManual(): number { return this.ventas.filter(v => this.estado(v) === 'MANUAL').length; }

  setFiltro(f: 'todos' | 'DERIVACION' | 'MANUAL' | 'PENDIENTE'): void { this.filtro = f; this.refrescarFilas(); }

  /** Busca el DNI en el backend, sobre las ventas del mes seleccionado. */
  buscar(): void {
    const d = (this.dni || '').replace(/\D/g, '');
    if (!d) { this.toast('Escribe un DNI para buscar.', true); return; }
    this.buscando = true; this.yaBusco = true;
    const obs = this.esSedes
      ? this.svc.buscarVentaSede(this.sede, d, this.anio || undefined, this.mes || undefined)
      : this.svc.buscarVenta(this.canal as 'call' | 'realzza', d, this.anio || undefined, this.mes || undefined);
    obs.subscribe({
      next: rows => { this.resultados = (rows || []).map(this.mapRow); this.refrescarFilas(); this.buscando = false; },
      error: () => { this.buscando = false; this.resultados = []; this.toast('❌ No se pudo buscar.', true); },
    });
  }
  limpiarBusqueda(): void { this.dni = ''; this.resultados = []; this.yaBusco = false; this.refrescarFilas(); }

  // ── Edición (popup) ──
  abrirEdicion(v: any): void {
    this.editando = v;
    const vacio = { vendedor: '', contacto: '', tipo_cliente: '', tipo_base: '', asesor_venta: '', extranjero: false, fuente: '' };
    if (this.esSedes) {
      this.modelo = { ...vacio, fuente: v.fuente || v.fuente_sugerida || '' };
    } else if (this.esRealzza) {
      this.modelo = { ...vacio,
        tipo_base: v.tipo_base || v.tb_sugerido || '',
        asesor_venta: v.asesor_venta || '',
        extranjero: !!v.extranjero,
      };
    } else {
      this.modelo = { ...vacio,
        vendedor: v.vendedor || v.cc_sugerido || '',
        contacto: v.contacto || '',
        tipo_cliente: v.tipo_cliente || v.tc_sugerido || '',
        tipo_base: v.tipo_base || v.tipo_cliente || v.tc_sugerido || '',
        extranjero: !!v.extranjero,
      };
    }
    this.editVisible = true;
  }
  /** TipoBase sigue a TipoCliente automáticamente (Call). */
  onTipoClienteChange(val: string): void { this.modelo.tipo_base = val; }

  guardarEdicion(): void {
    const v = this.editando; if (!v) return;
    // ── Sedes: solo se edita la fuente generadora ──
    if (this.esSedes) {
      const fuente = (this.modelo.fuente || '').trim();
      this.guardandoEdicion = true;
      this.svc.guardarFuenteSede(v.codigo_cv, fuente).subscribe({
        next: () => {
          Object.assign(v, { fuente: fuente || null, manual: true });
          const gemelo = [...this.ventas, ...this.resultados].find(x => x !== v && x.codigo_cv === v.codigo_cv);
          if (gemelo) Object.assign(gemelo, { fuente: v.fuente, manual: true });
          this.guardandoEdicion = false; this.editVisible = false;
          this.toast('✔ Fuente generadora actualizada.');
        },
        error: () => { this.guardandoEdicion = false; this.toast('❌ No se pudo guardar.', true); },
      });
      return;
    }
    let payload: any;
    if (this.esRealzza) {
      payload = { tipo_base: this.modelo.tipo_base || '', asesor_venta: this.modelo.asesor_venta || '', extranjero: !!this.modelo.extranjero };
    } else {
      const cc = (this.modelo.vendedor || '').trim();
      if (!cc) { this.toast('Selecciona el AsesorVenta (CC).', true); return; }
      payload = {
        vendedor: cc, contacto: this.modelo.contacto || '',
        tipo_cliente: this.modelo.tipo_cliente || '', tipo_base: this.modelo.tipo_base || '',
        extranjero: !!this.modelo.extranjero,
      };
    }
    this.guardandoEdicion = true;
    this.svc.guardarAtribucion(this.canal as 'call' | 'realzza', v.codigo_cv, payload).subscribe({
      next: () => {
        if (this.esRealzza) {
          Object.assign(v, { tipo_base: this.modelo.tipo_base || null, asesor_venta: this.modelo.asesor_venta || null, extranjero: this.modelo.extranjero, asesor_manual: true });
        } else {
          Object.assign(v, {
            vendedor: this.modelo.vendedor, contacto: this.modelo.contacto || null,
            tipo_cliente: this.modelo.tipo_cliente || null, tipo_base: this.modelo.tipo_base || null, extranjero: this.modelo.extranjero, asesor_manual: true,
          });
        }
        // refleja el cambio en la otra tabla (lista ↔ resultados) si está en ambas
        const gemelo = [...this.ventas, ...this.resultados].find(x => x !== v && x.codigo_cv === v.codigo_cv);
        if (gemelo) Object.assign(gemelo, { tipo_base: v.tipo_base, asesor_venta: v.asesor_venta, vendedor: v.vendedor, contacto: v.contacto, tipo_cliente: v.tipo_cliente, extranjero: v.extranjero, asesor_manual: true });
        this.guardandoEdicion = false; this.editVisible = false;
        this.toast('✔ Atribución actualizada.');
      },
      error: () => { this.guardandoEdicion = false; this.toast('❌ No se pudo guardar.', true); },
    });
  }

  fecha(v: any): string { return `${String(v.dia_cv).padStart(2, '0')}/${String(v.mes_cv).padStart(2, '0')}/${v.anio_cv}`; }
  af(v: any): string {
    if (!v.dia_af && !v.mes_af && !v.anio_af) return '—';
    return `${String(v.dia_af || 0).padStart(2, '0')}/${String(v.mes_af || 0).padStart(2, '0')}/${v.anio_af || ''}`;
  }

  private toast(msg: string, error = false): void {
    this.snack.open(msg, 'OK', {
      duration: error ? 5000 : 3500, horizontalPosition: 'end', verticalPosition: 'top',
      panelClass: error ? 'toast-error' : 'toast-ok',
    });
  }
}
