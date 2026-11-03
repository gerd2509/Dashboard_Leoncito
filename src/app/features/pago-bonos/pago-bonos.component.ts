import { Component, OnInit, inject } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { forkJoin, lastValueFrom, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Workbook } from 'exceljs';
import * as FileSaver from 'file-saver';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';
import { CargaVentasService } from '../../services/carga-ventas.service';
import { BonosManualesService, BonoManual } from '../../services/bonos-manuales.service';
import { AuthService } from '../../services/auth.service';
import { CapSedesService } from '../../services/cap-sedes.service';
import { ASESORES_CALL, ASESORES_CALL_CENTER_CARTERA } from '../../shared/asesores';
import { AsesoresPorTienda } from '../../shared/asesores-por-tienda';
import { esSedeRealzza, tiendaDeSedeRealzza } from '../../shared/canal-usuario';

type TiendaRealzza = 'REALZZA' | 'REALZZA PIURA' | 'REALZZA LIMA';
type Canal = 'CALL' | TiendaRealzza;

interface FilaBono {
  codigo: string;       // CC/RZ (Call) o el nombre tal cual (Realzza) — clave para agrupar
  asesor: string;        // nombre completo a mostrar
  ventaPropia: number;   // venta de ESTA sede (Call: toda su venta; Realzza: solo lo vendido en su tienda "dueña")
  otrasSedes: { tienda: string; monto: number }[];   // venta que hizo en OTRA tienda Realzza, nombrada
  totalOtrasSedes: number;
  neto: number;          // ventaPropia + totalOtrasSedes — lo que se usa para proyectar/calcular el bono
  proyeccion: number;
  bonoCalculado: number;
  manuales: BonoManual[];
  totalManual: number;
  totalPagar: number;
}
interface SeccionBono {
  canal: Canal;
  titulo: string;
  icono: string;
  color: string;
  filas: FilaBono[];
  totalVentaPropia: number;
  totalOtrasSedes: number;
  totalNeto: number;
  totalProyeccion: number;
  totalCalculado: number;
  totalManual: number;
  totalPagar: number;
}

const CANAL_LABEL: Record<Canal, string> = {
  CALL: 'CALL',
  REALZZA: 'REALZZA CHICLAYO',
  'REALZZA PIURA': 'REALZZA PIURA',
  'REALZZA LIMA': 'REALZZA LIMA',
};

/**
 * Pago de Bonos — consolida en un solo lugar el bono (calculado automáticamente,
 * misma escala/fórmula que Ventas Call y Ventas Realzza) de los 4 canales: Call
 * Center, Realzza Chiclayo, Piura y Lima. Permite agregar BONOS MANUALES (Bono
 * Logístico, Bono Efectiva, Bono Global Supervisor, o cualquier otro tipo que se
 * cree) para casos puntuales — monto fijo que se ingresa cada mes, no se calcula
 * ni se repite solo. Exportable a Excel (una hoja por canal).
 *
 * Realzza: igual que Ventas Campo — las 6 asesoras de Call Center que a veces
 * cierran venta en tienda (Patricia/Dexy/Karen/Maria/Judy/Juana) se agrupan como
 * una sola fila "CALL CENTER" por tienda (no por su nombre individual: su bono
 * real ya sale de la sección CALL). El resto de vendedores usa su tienda "dueña"
 * según el CAP; si vendió en otra tienda Realzza, esa venta se muestra aparte
 * (columna "Venta otra sede") pero SÍ cuenta para su proyección/bono — mismo
 * crédito cruzado que ya tiene Ventas Campo.
 */
@Component({
  selector: 'app-pago-bonos',
  standalone: true,
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES, LoadingOverlayComponent],
  templateUrl: './pago-bonos.component.html',
  styleUrl: './pago-bonos.component.css',
})
export class PagoBonosComponent implements OnInit {
  private ventasSrv = inject(CargaVentasService);
  private bonosSrv = inject(BonosManualesService);
  private auth = inject(AuthService);
  private cap = inject(CapSedesService);

  form: UntypedFormGroup;
  readonly anios = [2025, 2026];
  readonly meses = [
    { v: 1, t: 'Enero' }, { v: 2, t: 'Febrero' }, { v: 3, t: 'Marzo' },
    { v: 4, t: 'Abril' }, { v: 5, t: 'Mayo' }, { v: 6, t: 'Junio' }, { v: 7, t: 'Julio' },
    { v: 8, t: 'Agosto' }, { v: 9, t: 'Septiembre' }, { v: 10, t: 'Octubre' },
    { v: 11, t: 'Noviembre' }, { v: 12, t: 'Diciembre' },
  ];

  isLoading = false;
  error = '';
  secciones: SeccionBono[] = [];
  totalGeneralPagar = 0;

  private bonosManuales: BonoManual[] = [];

  // ── Tablas de bono (idénticas a Ventas Call / Ventas Realzza) ──
  private readonly tablaBonosCall = [
    { monto: 115000, bono: 1800 }, { monto: 110000, bono: 1700 }, { monto: 105000, bono: 1600 },
    { monto: 100000, bono: 1500 }, { monto:  95000, bono: 1400 }, { monto:  90000, bono: 1300 },
    { monto:  85000, bono: 1200 }, { monto:  80000, bono: 1100 }, { monto:  75000, bono: 1000 },
    { monto:  70000, bono:  900 }, { monto:  65000, bono:  800 }, { monto:  60000, bono:  700 },
    { monto:  55000, bono:  600 }, { monto:  50000, bono:  500 }, { monto:  45000, bono:  400 },
    { monto:  40000, bono:  300 }, { monto:  35000, bono:  200 }, { monto:  30000, bono:  150 },
    { monto:  25000, bono:  100 }, { monto:  20000, bono:   75 }, { monto:  15000, bono:   50 },
  ];
  private readonly tablaBonosChiclayo = [
    { monto: 150000, bono: 2500 }, { monto: 145000, bono: 2400 }, { monto: 140000, bono: 2300 },
    { monto: 135000, bono: 2200 }, { monto: 130000, bono: 2100 }, { monto: 125000, bono: 2000 },
    { monto: 120000, bono: 1900 }, { monto: 115000, bono: 1800 }, { monto: 110000, bono: 1700 },
    { monto: 105000, bono: 1600 }, { monto: 100000, bono: 1500 }, { monto:  95000, bono: 1400 },
    { monto:  90000, bono: 1300 }, { monto:  85000, bono: 1200 }, { monto:  80000, bono: 1000 },
    { monto:  75000, bono:  800 }, { monto:  70000, bono:  650 }, { monto:  65000, bono:  600 },
    { monto:  60000, bono:  550 }, { monto:  55000, bono:  500 }, { monto:  50000, bono:  450 },
    { monto:  45000, bono:  400 }, { monto:  40000, bono:  350 }, { monto:  35000, bono:  300 },
    { monto:  30000, bono:  250 }, { monto:  25000, bono:  200 }, { monto:  20000, bono:  150 },
    { monto:  15000, bono:  100 }, { monto:  10000, bono:   50 },
  ];
  private readonly tablaBonosPiuraLima = [
    { monto: 126000, bono: 1500 }, { monto: 120000, bono: 1400 }, { monto: 114000, bono: 1300 },
    { monto: 108000, bono: 1200 }, { monto: 102000, bono: 1100 }, { monto:  96000, bono: 1000 },
    { monto:  90000, bono:  900 }, { monto:  84000, bono:  700 }, { monto:  78000, bono:  600 },
    { monto:  72000, bono:  550 }, { monto:  66000, bono:  500 }, { monto:  60000, bono:  450 },
    { monto:  54000, bono:  400 }, { monto:  48000, bono:  350 }, { monto:  42000, bono:  300 },
    { monto:  36000, bono:  250 }, { monto:  30000, bono:  200 }, { monto:  24000, bono:  150 },
    { monto:  18000, bono:  100 }, { monto:  12000, bono:   50 },
  ];

  private calcularBonoCall(proyeccion: number): number {
    if (!proyeccion || proyeccion < 15000) return 0;
    for (const item of this.tablaBonosCall) if (proyeccion >= item.monto) return item.bono;
    return 0;
  }
  private calcularBonoRealzza(tienda: TiendaRealzza, proyeccion: number): number {
    const esTiendaNueva = tienda === 'REALZZA PIURA' || tienda === 'REALZZA LIMA';
    const tabla = esTiendaNueva ? this.tablaBonosPiuraLima : this.tablaBonosChiclayo;
    const minimo = esTiendaNueva ? 12000 : 10000;
    if (!proyeccion || proyeccion < minimo) return 0;
    for (const item of tabla) if (proyeccion >= item.monto) return item.bono;
    return 0;
  }

  constructor(private fb: UntypedFormBuilder) {
    const hoy = new Date();
    this.form = this.fb.group({ anio: [hoy.getFullYear()], mes: [hoy.getMonth() + 1] });
  }

  ngOnInit(): void { this.cargar(); }

  /** ¿El mes elegido es el mes en curso? → bono se PROYECTA (como en Ventas Call/Realzza).
   *  Si es un mes ya cerrado, se usa la venta real tal cual (sin proyectar). */
  private get esMesEnCurso(): boolean {
    const hoy = new Date();
    return this.form.value.anio === hoy.getFullYear() && this.form.value.mes === hoy.getMonth() + 1;
  }

  async cargar(): Promise<void> {
    this.isLoading = true; this.error = '';
    const { anio, mes } = this.form.value;
    try {
      const tiendas = new AsesoresPorTienda(this.cap);
      const [manuales, ventasCall, ventasRealzza] = await Promise.all([
        lastValueFrom(this.bonosSrv.listar(anio, mes).pipe(catchError(() => of([] as BonoManual[])))),
        lastValueFrom(this.ventasSrv.obtenerVentasCanal('call', { anio }).pipe(catchError(() => of([] as any[])))),
        lastValueFrom(this.ventasSrv.obtenerVentasRealzzaModulo(anio).pipe(catchError(() => of([] as any[])))),
        tiendas.cargar(),
      ]);
      this.bonosManuales = manuales || [];
      this.secciones = [
        this.armarSeccionCall(ventasCall || [], anio, mes),
        ...this.armarSeccionesRealzza(ventasRealzza || [], anio, mes, tiendas),
      ];
      this.totalGeneralPagar = this.secciones.reduce((s, sec) => s + sec.totalPagar, 0);
    } catch (e) {
      console.error('Error al cargar Pago de Bonos:', e);
      this.error = 'No se pudo cargar la información (revisa la conexión al servidor).';
      this.secciones = [];
    } finally {
      this.isLoading = false;
    }
  }

  /** Proyección del mes a partir del NETO acumulado — misma fórmula que Ventas Call/
   *  Ventas Realzza: mes cerrado → el neto tal cual; mes en curso → se proyecta según
   *  los días ya transcurridos. */
  private proyectar(neto: number, anio: number, mes: number): number {
    if (!this.esMesEnCurso) return Math.max(0, Math.round(neto));
    const hoy = new Date();
    const diasTranscurridos = Math.max(1, hoy.getDate() - 1);
    const diasMes = new Date(anio, mes, 0).getDate();
    const netoParaProyeccion = Math.max(0, neto);
    const ticketDiario = netoParaProyeccion / diasTranscurridos;
    return Math.round(ticketDiario * diasMes);
  }

  private manualesDe(canal: Canal, asesor: string): BonoManual[] {
    const label = CANAL_LABEL[canal];
    return this.bonosManuales.filter(b => b.canal === label && this.norm(b.asesor) === this.norm(asesor));
  }
  private norm(s: string): string {
    return (s ?? '').toString().trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  private armarFila(canal: Canal, codigo: string, asesor: string, ventaPropia: number,
                     otrasSedes: { tienda: string; monto: number }[], anio: number, mes: number, bonoCalculado: number): FilaBono {
    const manuales = this.manualesDe(canal, asesor);
    const totalManual = manuales.reduce((s, b) => s + (Number(b.monto) || 0), 0);
    const totalOtrasSedes = otrasSedes.reduce((s, o) => s + o.monto, 0);
    const neto = ventaPropia + totalOtrasSedes;
    return {
      codigo, asesor,
      ventaPropia: Math.round(ventaPropia),
      otrasSedes: otrasSedes.map(o => ({ tienda: o.tienda, monto: Math.round(o.monto) })),
      totalOtrasSedes: Math.round(totalOtrasSedes),
      neto: Math.round(neto),
      proyeccion: this.proyectar(neto, anio, mes),
      bonoCalculado, manuales, totalManual,
      totalPagar: bonoCalculado + totalManual,
    };
  }

  /** CALL: mismo filtro que Ventas Call (excluye NC, NAS, montos <=0; Brenda CC12 solo
   *  hasta ago-2026 porque pasó a Realzza). Agrupa por AsesorVenta (código CC). */
  private armarSeccionCall(rows: any[], anio: number, mes: number): SeccionBono {
    const mapVentas = new Map<string, number>();
    for (const r of rows) {
      const rMes = r.mes_cv, rAnio = r.anio_cv;
      if (rAnio !== anio || rMes !== mes) continue;
      const codigo = (r.vendedor || '').toString().trim().toUpperCase();
      if (!codigo || codigo === 'NAS') continue;
      if (codigo === 'CC12' && (anio > 2026 || (anio === 2026 && mes >= 9))) continue;   // Brenda → Realzza desde sep-2026
      const estado = (r.estado_venta || '').toString().trim().toUpperCase();
      if (estado === 'NOTA DE CRÉDITO' || estado === 'NOTA DE CREDITO') continue;
      const monto = Number(r.monto_consolidado) || 0;
      if (monto <= 0) continue;
      mapVentas.set(codigo, (mapVentas.get(codigo) || 0) + monto);
    }
    const filas = Array.from(mapVentas.entries())
      .map(([codigo, neto]) => {
        const asesor = ASESORES_CALL.find(a => a.value === codigo)?.nombre ?? codigo;
        const proyeccion = this.proyectar(neto, anio, mes);
        return this.armarFila('CALL', codigo, asesor, neto, [], anio, mes, this.calcularBonoCall(proyeccion));
      })
      .sort((a, b) => b.neto - a.neto);
    return this.totalizarSeccion({ canal: 'CALL', titulo: 'CALL CENTER', icono: 'call', color: '#1A5FAD', filas, totalVentaPropia: 0, totalOtrasSedes: 0, totalNeto: 0, totalProyeccion: 0, totalCalculado: 0, totalManual: 0, totalPagar: 0 });
  }

  private readonly infoTienda: Record<TiendaRealzza, { titulo: string; icono: string; color: string }> = {
    REALZZA: { titulo: 'REALZZA CHICLAYO', icono: 'storefront', color: '#2E7D32' },
    'REALZZA PIURA': { titulo: 'REALZZA PIURA', icono: 'store', color: '#6A1B9A' },
    'REALZZA LIMA': { titulo: 'REALZZA LIMA', icono: 'local_mall', color: '#E65100' },
  };

  /** REALZZA (×3 tiendas a la vez — hace falta ver TODAS juntas para el crédito
   *  cruzado): venta cuenta en su mes de VENTA a valor pleno (incl. estados NC, para
   *  no borrarla de su mes); la NC resta en su propio mes de AFECTACIÓN.
   *
   *  Primera pasada: neto (bruto − NC) por (vendedor, tienda FÍSICA donde se hizo la
   *  venta) — sin resolver todavía a qué tienda pertenece cada quien.
   *  Segunda pasada: las 6 asesoras de Call Center se agrupan en una fila "CALL
   *  CENTER" por tienda física (no tienen tienda "dueña" en el CAP de Realzza — su
   *  bono real ya sale de la sección CALL). El resto usa su tienda del CAP (o, si no
   *  está, la tienda donde más vendió) como tienda "dueña"; lo vendido en otra tienda
   *  Realzza se guarda aparte (columna "Venta otra sede") pero SÍ suma al neto que se
   *  usa para proyectar/calcular su bono — mismo crédito cruzado de Ventas Campo. */
  private armarSeccionesRealzza(rows: any[], anio: number, mes: number, tiendas: AsesoresPorTienda): SeccionBono[] {
    const esReductora = (estado: string) => {
      const e = (estado || '').toString().trim().toUpperCase();
      return e === 'NOTA DE CRÉDITO' || e === 'NOTA DE CREDITO' || e.includes('INCAUTAC');
    };
    const netoPorVendedorTienda = new Map<string, Map<TiendaRealzza, number>>();
    const sumar = (vendedor: string, tienda: TiendaRealzza, delta: number) => {
      let m = netoPorVendedorTienda.get(vendedor);
      if (!m) { m = new Map(); netoPorVendedorTienda.set(vendedor, m); }
      m.set(tienda, (m.get(tienda) || 0) + delta);
    };
    for (const r of rows) {
      const sede = (r.sede || '').toString().trim();
      if (!esSedeRealzza(sede)) continue;
      const tiendaFisica = tiendaDeSedeRealzza(sede);
      const asesor = (r.vendedor || '').toString().trim().toUpperCase();
      if (!asesor) continue;
      const monto = Number(r.monto_consolidado) || 0;
      if (monto <= 0) continue;
      if (+r.mes_cv === mes && +r.anio_cv === anio) sumar(asesor, tiendaFisica, monto);
      if (esReductora(r.estado_venta) && +r.mes_af === mes && +r.anio_af === anio) sumar(asesor, tiendaFisica, -monto);
    }

    const porTienda: Record<TiendaRealzza, Map<string, FilaBono>> = { REALZZA: new Map(), 'REALZZA PIURA': new Map(), 'REALZZA LIMA': new Map() };
    const callCenterPorTienda: Record<TiendaRealzza, number> = { REALZZA: 0, 'REALZZA PIURA': 0, 'REALZZA LIMA': 0 };

    netoPorVendedorTienda.forEach((porTiendaFisica, vendedor) => {
      if (ASESORES_CALL_CENTER_CARTERA.has(vendedor)) {
        porTiendaFisica.forEach((monto, tienda) => { callCenterPorTienda[tienda] += monto; });
        return;
      }
      // Tienda "dueña" (CAP); si no está en el CAP de ninguna tienda Realzza, se usa
      // como respaldo la tienda donde tiene el mayor monto (no hay otra forma de saberlo).
      let fallback: TiendaRealzza = 'REALZZA';
      let max = -Infinity;
      porTiendaFisica.forEach((monto, tienda) => { if (monto > max) { max = monto; fallback = tienda; } });
      const home = tiendas.tiendaDeVendedor(vendedor, fallback) as TiendaRealzza;

      let ventaPropia = 0;
      const otrasSedes: { tienda: string; monto: number }[] = [];
      porTiendaFisica.forEach((monto, tienda) => {
        if (tienda === home) ventaPropia += monto;
        else otrasSedes.push({ tienda: this.infoTienda[tienda].titulo, monto });
      });
      if (ventaPropia === 0 && !otrasSedes.length) return;

      const neto = ventaPropia + otrasSedes.reduce((s, o) => s + o.monto, 0);
      const proyeccion = this.proyectar(neto, anio, mes);
      const fila = this.armarFila(home, vendedor, vendedor, ventaPropia, otrasSedes, anio, mes, this.calcularBonoRealzza(home, proyeccion));
      porTienda[home].set(vendedor, fila);
    });

    return (['REALZZA', 'REALZZA PIURA', 'REALZZA LIMA'] as TiendaRealzza[]).map(tienda => {
      const filas = Array.from(porTienda[tienda].values());
      const netoCallCenter = callCenterPorTienda[tienda];
      if (netoCallCenter !== 0) {
        const proyeccion = this.proyectar(netoCallCenter, anio, mes);
        filas.push(this.armarFila(tienda, 'CALL CENTER', 'CALL CENTER', netoCallCenter, [], anio, mes, this.calcularBonoRealzza(tienda, proyeccion)));
      }
      filas.sort((a, b) => b.neto - a.neto);
      return this.totalizarSeccion({ canal: tienda, ...this.infoTienda[tienda], filas, totalVentaPropia: 0, totalOtrasSedes: 0, totalNeto: 0, totalProyeccion: 0, totalCalculado: 0, totalManual: 0, totalPagar: 0 });
    });
  }

  private totalizarSeccion(sec: SeccionBono): SeccionBono {
    sec.totalVentaPropia = sec.filas.reduce((s, f) => s + f.ventaPropia, 0);
    sec.totalOtrasSedes = sec.filas.reduce((s, f) => s + f.totalOtrasSedes, 0);
    sec.totalNeto = sec.filas.reduce((s, f) => s + f.neto, 0);
    sec.totalProyeccion = sec.filas.reduce((s, f) => s + f.proyeccion, 0);
    sec.totalCalculado = sec.filas.reduce((s, f) => s + f.bonoCalculado, 0);
    sec.totalManual = sec.filas.reduce((s, f) => s + f.totalManual, 0);
    sec.totalPagar = sec.filas.reduce((s, f) => s + f.totalPagar, 0);
    return sec;
  }

  // ── Acceso (solo admin/gerente ven/editan este módulo — datos de pago) ──
  get puedeGestionar(): boolean {
    const rol = (this.auth.getUsuario()?.rol || '').toLowerCase();
    return rol === 'admin' || rol === 'gerente';
  }

  // ── Popup: agregar/editar bono manual ──
  popupVisible = false;
  guardando = false;
  editando: BonoManual | null = null;
  // dx-number-box tiene tipos asimétricos ([value]: number, valueChange: number|null) —
  // por eso en el template va [value]+(valueChange) por separado (no [(value)] de dos
  // vías) y acá el modelo se queda en `number` a secas (el handler cubre el null).
  modeloPopup: { canal: Canal; asesor: string; tipo: string; monto: number; comentario: string } =
    { canal: 'CALL', asesor: '', tipo: '', monto: 0, comentario: '' };
  readonly tiposSugeridos = ['Bono Logístico', 'Bono Efectiva', 'Bono Global Supervisor'];

  abrirAgregar(canal: Canal, asesor: string): void {
    this.editando = null;
    this.error = '';
    this.modeloPopup = { canal, asesor, tipo: '', monto: 0, comentario: '' };
    this.popupVisible = true;
  }
  abrirEditar(canal: Canal, asesor: string, bono: BonoManual): void {
    this.editando = bono;
    this.error = '';
    this.modeloPopup = { canal, asesor, tipo: bono.tipo, monto: bono.monto, comentario: bono.comentario || '' };
    this.popupVisible = true;
  }
  cerrarPopup(): void { this.popupVisible = false; this.editando = null; }

  get popupValido(): boolean {
    return !!this.modeloPopup.tipo?.trim() && this.modeloPopup.monto >= 0;
  }

  async guardarPopup(): Promise<void> {
    if (!this.popupValido || this.guardando) return;
    this.guardando = true;
    const { anio, mes } = this.form.value;
    try {
      if (this.editando) {
        await lastValueFrom(this.bonosSrv.actualizar(this.editando.id, {
          tipo: this.modeloPopup.tipo.trim(), monto: Number(this.modeloPopup.monto), comentario: this.modeloPopup.comentario.trim(),
        }));
      } else {
        await lastValueFrom(this.bonosSrv.crear({
          asesor: this.modeloPopup.asesor, canal: CANAL_LABEL[this.modeloPopup.canal], anio, mes,
          tipo: this.modeloPopup.tipo.trim(), monto: Number(this.modeloPopup.monto),
          comentario: this.modeloPopup.comentario.trim() || undefined,
          creado_por: this.auth.getUsuario()?.nombre || undefined,
        }));
      }
      this.cerrarPopup();
      await this.cargar();
    } catch (e) {
      console.error('Error al guardar el bono manual:', e);
      this.error = 'No se pudo guardar el bono manual.';
    } finally {
      this.guardando = false;
    }
  }

  async eliminarManual(bono: BonoManual, ev: Event): Promise<void> {
    ev.stopPropagation();
    try {
      await lastValueFrom(this.bonosSrv.eliminar(bono.id));
      await this.cargar();
    } catch (e) { console.error('Error al eliminar el bono manual:', e); }
  }

  // ── Export a Excel: una hoja por canal + resumen ──
  async exportar(): Promise<void> {
    if (!this.secciones.length) return;
    const wb = new Workbook();
    const { anio, mes } = this.form.value;
    const periodo = `${this.meses.find(m => m.v === mes)?.t} ${anio}`;

    const wsResumen = wb.addWorksheet('Resumen');
    wsResumen.addRow([`PAGO DE BONOS — ${periodo}`]).font = { bold: true, size: 13 };
    wsResumen.addRow([]);
    wsResumen.addRow(['CANAL', 'BONO CALCULADO', 'BONOS MANUALES', 'TOTAL A PAGAR']).font = { bold: true };
    for (const sec of this.secciones) wsResumen.addRow([sec.titulo, sec.totalCalculado, sec.totalManual, sec.totalPagar]);
    wsResumen.addRow(['TOTAL GENERAL', '', '', this.totalGeneralPagar]).font = { bold: true };
    wsResumen.columns.forEach(c => c.width = 22);

    for (const sec of this.secciones) {
      const ws = wb.addWorksheet(sec.titulo.substring(0, 31));
      ws.addRow(['ASESOR', 'VENTA', 'VENTA OTRA SEDE (detalle)', 'VENTA NETA', 'PROYECCIÓN', 'BONO CALCULADO', 'BONOS MANUALES (detalle)', 'TOTAL MANUAL', 'TOTAL A PAGAR']).font = { bold: true };
      for (const f of sec.filas) {
        ws.addRow([
          f.asesor, f.ventaPropia,
          f.otrasSedes.map(o => `${o.tienda}: S/ ${o.monto}`).join(' · '),
          f.neto, f.proyeccion, f.bonoCalculado,
          f.manuales.map(b => `${b.tipo}: S/ ${b.monto}`).join(' · '),
          f.totalManual, f.totalPagar,
        ]);
      }
      ws.addRow(['TOTAL', '', '', '', '', sec.totalCalculado, '', sec.totalManual, sec.totalPagar]).font = { bold: true };
      ws.columns.forEach((c, i) => c.width = i === 2 || i === 6 ? 46 : 18);
    }

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    FileSaver.saveAs(blob, `Pago de Bonos - ${periodo}.xlsx`);
  }
}
