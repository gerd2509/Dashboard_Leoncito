import { Component, Input, OnChanges, inject } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { Workbook } from 'exceljs';
import * as FileSaver from 'file-saver';
import { SHARED_MATERIAL_IMPORTS } from '../../common_imports';
import { CargaVentasService } from '../../../services/carga-ventas.service';
import { CapSedesService } from '../../../services/cap-sedes.service';

type Entidad = 'GLOBAL GO' | 'EFECTIVA' | 'ALFIN';
type Canal = 'SEDES' | 'REALZZA';

interface MotoAliado {
  sede: string; vendedor: string; entidad: Entidad; fecha: string; cliente: string; dni: string;
  producto: string; maf: number; bono: number; nota: string;
}
interface FilaVendedor {
  vendedor: string;
  motos: Record<Entidad, number>;
  bono: Record<Entidad, number>;
  total: number;
  detalle: MotoAliado[];
}
/** Incentivo de la empresa (no del banco): asesor S/ 50 por producto Efectiva; gerente de
 *  tienda S/ 25 por producto Efectiva + S/ 50 por moto Global Go de su tienda. */
/** Una venta que genera incentivo (producto Efectiva o moto Global Go). */
interface VentaInc { mes: string; sede: string; vendedor: string; tipo: 'EFECTIVA' | 'MOTO GLOBAL GO'; fecha: string; cliente: string; dni: string; producto: string; monto: number; }
interface IncMes { key: string; label: string; asesores: IncAsesor[]; gerentes: IncGerente[]; productos: number; totAsesores: number; totGerentes: number; }
const MESES_NOMBRE = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MAX_MESES_INC = 12;
/** Sedes cuyo gerente recibe el incentivo de la empresa (nombre sin tildes). */
const SEDES_INC_GERENTE = ['LAMBAYEQUE', 'FERRENAFE'];
interface IncAsesor { sede: string; vendedor: string; productos: number; monto: number; detalle: VentaInc[]; }
interface IncGerente { sede: string; gerente: string; productosEfectiva: number; montoEfectiva: number; motosGG: number; montoGG: number; total: number; detalle: VentaInc[]; }
const INC_ASESOR_EFECTIVA = 50, INC_GERENTE_EFECTIVA = 25, INC_GERENTE_MOTO_GG = 50;

interface GrupoSede {
  sede: string;
  filas: FilaVendedor[];
  motos: Record<Entidad, number>;
  bono: Record<Entidad, number>;
  total: number;
  avisos: string[];
}

/** Regla de cada aliado. `desde` = primer mes (AAAA-MM) en que rige la campaña; antes se
 *  listan las motos pero el bono queda en 0 ("fuera de vigencia"). Se asume que la regla
 *  sigue vigente los meses siguientes hasta que llegue una campaña nueva. */
const REGLAS: Record<Entidad, { desde: string; color: string; resumen: string[] }> = {
  'GLOBAL GO': {
    desde: '2026-01', color: '#C62828',
    resumen: ['S/ 100 por moto vendida', 'S/ 125 por moto si el asesor vende 5 o más en el mes'],
  },
  EFECTIVA: {
    desde: '2026-11', color: '#1565C0',
    resumen: ['MAF ≥ 4,000 → S/ 50 · ≥ 6,000 → S/ 70 · ≥ 9,000 → S/ 100 (por moto)',
      'Solo se paga si la sede vende mínimo 2 motos Efectiva en el mes', 'Vigencia: desde nov-2026'],
  },
  ALFIN: {
    desde: '2026-10', color: '#6A1B9A',
    resumen: ['Solo motos con MAF mayor a 3,000', '1 moto → S/ 150 · 2 motos → S/ 150 + S/ 100',
      '3 o más motos → S/ 170 por cada moto', 'Vigencia: desde oct-2026'],
  },
};
const ENTIDADES: Entidad[] = ['GLOBAL GO', 'EFECTIVA', 'ALFIN'];
const cero = (): Record<Entidad, number> => ({ 'GLOBAL GO': 0, EFECTIVA: 0, ALFIN: 0 });

/**
 * Bonos por aliado (motos) — Global Go, Efectiva y Alfin, por vendedor y agrupado por
 * sede, para Sedes (piso) y Realzza. Lee la tabla `ventas` (misma fuente que Ventas
 * Sedes): solo motos del mes de venta, sin Nota de Crédito ni Incautación. El MAF se
 * toma del monto consolidado de la venta.
 */
@Component({
  selector: 'app-bonos-aliados',
  standalone: true,
  imports: [...SHARED_MATERIAL_IMPORTS],
  templateUrl: './bonos-aliados.component.html',
  styleUrl: './bonos-aliados.component.css',
})
export class BonosAliadosComponent implements OnChanges {
  @Input() anio!: number;
  @Input() mes!: number;

  private ventasSrv = inject(CargaVentasService);
  private capSrv = inject(CapSedesService);

  readonly ENTIDADES = ENTIDADES;
  readonly REGLAS = REGLAS;
  canal: Canal = 'SEDES';
  cargando = false;
  error = '';
  private motos: MotoAliado[] = [];
  grupos: GrupoSede[] = [];
  totales = { motos: cero(), bono: cero(), total: 0 };
  abiertos = new Set<string>();
  verReglas = false;

  // Incentivo de la empresa
  readonly INC = { asesor: INC_ASESOR_EFECTIVA, gerente: INC_GERENTE_EFECTIVA, motoGG: INC_GERENTE_MOTO_GG };
  private ventasInc: VentaInc[] = [];          // productos Efectiva + motos Global Go del rango
  private gerentePorSede = new Map<string, string>();                   // del maestro de sedes
  incMeses: IncMes[] = [];
  incTotales = { productos: 0, asesores: 0, gerentes: 0 };
  incDesde = '';
  incHasta = '';
  incOpciones: { key: string; label: string }[] = [];
  incCargando = false;
  incAviso = '';
  incSede = '';   // '' = todas · 'LAMBAYEQUE' · 'FERRENAFE'
  readonly INC_SEDES = [{ v: '', t: 'Todas' }, { v: 'LAMBAYEQUE', t: 'Lambayeque' }, { v: 'FERRENAFE', t: 'Ferreñafe' }];
  setIncSede(v: string): void { this.incSede = v; this.armarIncentivo(); }

  ngOnChanges(): void {
    if (!this.anio || !this.mes) return;
    this.cargar();
    // El rango del incentivo arranca en el mes elegido arriba; luego se puede ampliar.
    this.incDesde = this.incHasta = this.periodo;
    this.cargarIncentivo();
  }

  get incRangoLabel(): string {
    return this.incDesde === this.incHasta ? this.mesLabel(this.incDesde) : `${this.mesLabel(this.incDesde)} – ${this.mesLabel(this.incHasta)}`;
  }
  private mesLabel(key: string): string {
    const [a, m] = key.split('-').map(Number);
    return `${MESES_NOMBRE[m - 1]} ${a}`;
  }
  /** Meses entre dos claves 'AAAA-MM' (inclusive). */
  private mesesEntre(desde: string, hasta: string): string[] {
    const out: string[] = [];
    let [a, m] = desde.split('-').map(Number);
    const [ah, mh] = hasta.split('-').map(Number);
    while (a < ah || (a === ah && m <= mh)) {
      out.push(`${a}-${String(m).padStart(2, '0')}`);
      if (++m > 12) { m = 1; a++; }
    }
    return out;
  }

  setIncRango(desde: string, hasta: string): void {
    if (desde > hasta) [desde, hasta] = [hasta, desde];
    this.incDesde = desde; this.incHasta = hasta;
    this.cargarIncentivo();
  }

  /** Trae las ventas de cada mes del rango (máx. 12) y arma el incentivo listado por mes. */
  async cargarIncentivo(): Promise<void> {
    // Opciones: desde ene-2025 hasta el mes actual.
    const hoy = new Date();
    this.incOpciones = this.mesesEntre('2025-01', `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`)
      .reverse().map(key => ({ key, label: this.mesLabel(key) }));
    let meses = this.mesesEntre(this.incDesde, this.incHasta);
    this.incAviso = '';
    if (meses.length > MAX_MESES_INC) {
      meses = meses.slice(-MAX_MESES_INC);
      this.incDesde = meses[0];
      this.incAviso = `Se muestran como máximo ${MAX_MESES_INC} meses: desde ${this.mesLabel(this.incDesde)}.`;
    }
    this.incCargando = true;
    try {
      const lotes = await Promise.all(meses.map(k => {
        const [a, m] = k.split('-').map(Number);
        return lastValueFrom(this.ventasSrv.obtenerVentas(a, { mes: m })).catch(() => [] as any[]);
      }));
      this.ventasInc = [];
      lotes.forEach((rows, i) => {
        const [a, m] = meses[i].split('-').map(Number);
        for (const r of rows || []) {
          if (Number(r.anio_cv) !== a || Number(r.mes_cv) !== m) continue;   // solo mes de venta
          const ent = this.up(r.entidad);
          const estado = this.up(r.estado_venta);
          if (estado.includes('NOTA DE CR') || estado.includes('INCAUTAC')) continue;
          if ((Number(r.monto_consolidado) || 0) <= 0) continue;
          const esEfectiva = ent.includes('EFECTIVA');
          const esMotoGG = ent.includes('GLOBAL GO') && this.up(r.estado_tipo_producto).includes('MOTO');
          if (!esEfectiva && !esMotoGG) continue;
          this.ventasInc.push({
            mes: meses[i], sede: this.nombreSede(r.sede), vendedor: (r.vendedor || 'SIN VENDEDOR').toString().trim().toUpperCase(),
            tipo: esEfectiva ? 'EFECTIVA' : 'MOTO GLOBAL GO', ...this.datosCliente(r), monto: 0,
          });
        }
      });
      this.armarIncentivo();
    } finally {
      this.incCargando = false;
    }
  }

  private get periodo(): string { return `${this.anio}-${String(this.mes).padStart(2, '0')}`; }
  vigente(e: Entidad): boolean { return this.periodo >= REGLAS[e].desde; }

  async cargar(): Promise<void> {
    this.cargando = true; this.error = '';
    try {
      const [rows, sedes] = await Promise.all([
        lastValueFrom(this.ventasSrv.obtenerVentas(this.anio, { mes: this.mes })),
        lastValueFrom(this.capSrv.listarSedes()).catch(() => [] as { nombre: string; gerente: string }[]),
      ]);
      this.gerentePorSede = new Map((sedes || []).map(x => [this.nombreSede(x.nombre), (x.gerente || '').toString().trim().toUpperCase()]));
      this.motos = [];
      for (const r of rows || []) {
        if (Number(r.anio_cv) !== this.anio || Number(r.mes_cv) !== this.mes) continue;   // solo mes de venta
        const ent = this.up(r.entidad);
        const entidad = ENTIDADES.find(e => ent.includes(e));
        if (!entidad) continue;
        const estado = this.up(r.estado_venta);
        if (estado.includes('NOTA DE CR') || estado.includes('INCAUTAC')) continue;
        const maf = Number(r.monto_consolidado) || 0;
        if (maf <= 0) continue;
        if (!this.up(r.estado_tipo_producto).includes('MOTO')) continue;
        this.motos.push({
          sede: this.nombreSede(r.sede), vendedor: (r.vendedor || 'SIN VENDEDOR').toString().trim().toUpperCase(),
          entidad, fecha: `${String(r.dia_cv).padStart(2, '0')}/${String(r.mes_cv).padStart(2, '0')}/${r.anio_cv}`,
          producto: (r.productos || '').toString(), maf, bono: 0, nota: '',
          cliente: this.datosCliente(r).cliente, dni: this.datosCliente(r).dni,
        });
      }
      this.armar();
    } catch (e) {
      console.error('Bonos aliados:', e);
      this.error = 'No se pudieron cargar las ventas de motos.';
      this.grupos = [];
    } finally {
      this.cargando = false;
    }
  }

  setCanal(c: Canal): void { this.canal = c; this.abiertos.clear(); this.armar(); }
  toggle(clave: string): void { if (!this.abiertos.delete(clave)) this.abiertos.add(clave); }

  private esRealzza(sede: string): boolean { return sede.includes('REALZZA'); }

  /** Calcula el bono de cada moto y agrupa por sede → vendedor, para el canal elegido. */
  private armar(): void {
    const motos = this.motos.filter(m => this.esRealzza(m.sede) === (this.canal === 'REALZZA'));

    // Efectiva: la sede debe vender al menos 2 motos Efectiva en el mes.
    const efectivaPorSede = new Map<string, number>();
    for (const m of motos) if (m.entidad === 'EFECTIVA') efectivaPorSede.set(m.sede, (efectivaPorSede.get(m.sede) || 0) + 1);

    // Global Go y Alfin dependen de cuántas motos de ese aliado vendió el asesor.
    const porAsesor = new Map<string, MotoAliado[]>();
    for (const m of motos) {
      const k = `${m.entidad}|${m.vendedor}`;
      (porAsesor.get(k) ?? porAsesor.set(k, []).get(k)!).push(m);
    }
    for (const [k, lista] of porAsesor) {
      const entidad = k.split('|')[0] as Entidad;
      if (!this.vigente(entidad)) { for (const m of lista) { m.bono = 0; m.nota = 'Fuera de vigencia'; } continue; }
      if (entidad === 'GLOBAL GO') {
        const tarifa = lista.length >= 5 ? 125 : 100;
        for (const m of lista) { m.bono = tarifa; m.nota = lista.length >= 5 ? '5 o más motos → S/ 125' : 'S/ 100 por moto'; }
      } else if (entidad === 'ALFIN') {
        const validas = lista.filter(m => m.maf > 3000).sort((a, b) => a.fecha.localeCompare(b.fecha));
        for (const m of lista) if (m.maf <= 3000) { m.bono = 0; m.nota = 'MAF no supera 3,000'; }
        validas.forEach((m, i) => {
          if (validas.length >= 3) { m.bono = 170; m.nota = '3 o más motos → S/ 170'; }
          else if (i === 0) { m.bono = 150; m.nota = 'Primera moto → S/ 150'; }
          else { m.bono = 100; m.nota = 'Segunda moto → S/ 100'; }
        });
      } else {
        for (const m of lista) {
          if ((efectivaPorSede.get(m.sede) || 0) < 2) { m.bono = 0; m.nota = 'La sede vendió menos de 2 motos Efectiva'; continue; }
          m.bono = m.maf >= 9000 ? 100 : m.maf >= 6000 ? 70 : m.maf >= 4000 ? 50 : 0;
          m.nota = m.bono ? `MAF ${m.maf >= 9000 ? '≥ 9,000' : m.maf >= 6000 ? '≥ 6,000' : '≥ 4,000'}` : 'MAF menor a 4,000';
        }
      }
    }

    const sedes = new Map<string, Map<string, FilaVendedor>>();
    for (const m of motos) {
      const porVend = sedes.get(m.sede) ?? sedes.set(m.sede, new Map()).get(m.sede)!;
      const f = porVend.get(m.vendedor) ?? porVend.set(m.vendedor, { vendedor: m.vendedor, motos: cero(), bono: cero(), total: 0, detalle: [] }).get(m.vendedor)!;
      f.motos[m.entidad]++; f.bono[m.entidad] += m.bono; f.total += m.bono; f.detalle.push(m);
    }
    this.totales = { motos: cero(), bono: cero(), total: 0 };
    this.grupos = Array.from(sedes.entries()).map(([sede, porVend]) => {
      const filas = Array.from(porVend.values()).sort((a, b) => b.total - a.total || a.vendedor.localeCompare(b.vendedor));
      const g: GrupoSede = { sede, filas, motos: cero(), bono: cero(), total: 0, avisos: [] };
      for (const f of filas) {
        f.detalle.sort((a, b) => a.fecha.localeCompare(b.fecha));
        for (const e of ENTIDADES) { g.motos[e] += f.motos[e]; g.bono[e] += f.bono[e]; }
        g.total += f.total;
      }
      if (g.motos.EFECTIVA === 1 && this.vigente('EFECTIVA')) g.avisos.push('Solo 1 moto Efectiva: no alcanza el mínimo de 2 de la sede.');
      for (const e of ENTIDADES) { this.totales.motos[e] += g.motos[e]; this.totales.bono[e] += g.bono[e]; }
      this.totales.total += g.total;
      return g;
    }).sort((a, b) => b.total - a.total || a.sede.localeCompare(b.sede));
    this.armarIncentivo();
  }

  /** Incentivo de la empresa para el canal elegido, listado por mes del rango: por asesor
   *  (productos Efectiva) y por gerente de tienda (productos Efectiva + motos Global Go). */
  private armarIncentivo(): void {
    const enCanal = (sede: string) => this.esRealzza(sede) === (this.canal === 'REALZZA');
    // Combo de sede (solo en la vista Sedes): Lambayeque o Ferreñafe; vacío = todas.
    const sedeSel = this.canal === 'SEDES' ? this.incSede : '';
    const ventas = this.ventasInc.filter(v => enCanal(v.sede) && (!sedeSel || this.up(v.sede) === sedeSel));
    this.incTotales = { productos: 0, asesores: 0, gerentes: 0 };
    this.incMeses = this.mesesEntre(this.incDesde, this.incHasta).map(key => {
      const delMes = ventas.filter(v => v.mes === key);

      const porAsesor = new Map<string, IncAsesor>();
      for (const v of delMes) if (v.tipo === 'EFECTIVA') {
        const k = `${v.sede}|${v.vendedor}`;
        const x = porAsesor.get(k) ?? porAsesor.set(k, { sede: v.sede, vendedor: v.vendedor, productos: 0, monto: 0, detalle: [] }).get(k)!;
        x.productos++; x.monto += INC_ASESOR_EFECTIVA; x.detalle.push({ ...v, monto: INC_ASESOR_EFECTIVA });
      }
      const asesores = Array.from(porAsesor.values()).sort((p, q) => p.sede.localeCompare(q.sede) || q.monto - p.monto);
      for (const x of asesores) x.detalle.sort((p, q) => p.fecha.localeCompare(q.fecha));

      const porSede = new Map<string, IncGerente>();
      for (const v of delMes) {
        if (!SEDES_INC_GERENTE.includes(this.up(v.sede))) continue;   // solo Lambayeque y Ferreñafe
        const g = porSede.get(v.sede) ?? porSede.set(v.sede, {
          sede: v.sede, gerente: this.gerentePorSede.get(v.sede) || 'SIN GERENTE ASIGNADO',
          productosEfectiva: 0, montoEfectiva: 0, motosGG: 0, montoGG: 0, total: 0, detalle: [],
        }).get(v.sede)!;
        const monto = v.tipo === 'EFECTIVA' ? INC_GERENTE_EFECTIVA : INC_GERENTE_MOTO_GG;
        if (v.tipo === 'EFECTIVA') { g.productosEfectiva++; g.montoEfectiva += monto; } else { g.motosGG++; g.montoGG += monto; }
        g.total += monto; g.detalle.push({ ...v, monto });
      }
      const gerentes = Array.from(porSede.values()).sort((p, q) => q.total - p.total || p.sede.localeCompare(q.sede));
      for (const g of gerentes) g.detalle.sort((p, q) => p.tipo.localeCompare(q.tipo) || p.fecha.localeCompare(q.fecha));

      const productos = asesores.reduce((t, x) => t + x.productos, 0);
      const totAsesores = asesores.reduce((t, x) => t + x.monto, 0);
      const totGerentes = gerentes.reduce((t, g) => t + g.total, 0);
      this.incTotales.productos += productos; this.incTotales.asesores += totAsesores; this.incTotales.gerentes += totGerentes;
      return { key, label: this.mesLabel(key), asesores, gerentes, productos, totAsesores, totGerentes };
    });
  }

  async exportar(): Promise<void> {
    const wb = new Workbook();
    const estilo = (row: any) => row.eachCell((c: any) => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    });
    const canalPrevio = this.canal;
    for (const canal of ['SEDES', 'REALZZA'] as Canal[]) {
      this.canal = canal; this.armar();
      const ws = wb.addWorksheet(canal === 'SEDES' ? 'Sedes' : 'Realzza');
      estilo(ws.addRow(['SEDE', 'VENDEDOR', 'MOTOS GLOBAL GO', 'BONO GLOBAL GO', 'MOTOS EFECTIVA', 'BONO EFECTIVA', 'MOTOS ALFIN', 'BONO ALFIN', 'TOTAL BONO']));
      for (const g of this.grupos) {
        for (const f of g.filas) ws.addRow([g.sede, f.vendedor, ...ENTIDADES.flatMap(e => [f.motos[e], f.bono[e]]), f.total]);
        const t = ws.addRow([`TOTAL ${g.sede}`, '', ...ENTIDADES.flatMap(e => [g.motos[e], g.bono[e]]), g.total]);
        t.font = { bold: true };
      }
      ws.addRow([]);
      ws.addRow(['TOTAL', '', ...ENTIDADES.flatMap(e => [this.totales.motos[e], this.totales.bono[e]]), this.totales.total]).font = { bold: true };
      ws.columns.forEach((c, i) => { c.width = i < 2 ? 32 : 16; });
      ws.views = [{ state: 'frozen', ySplit: 1 }];

      const wd = wb.addWorksheet(canal === 'SEDES' ? 'Detalle Sedes' : 'Detalle Realzza');
      estilo(wd.addRow(['SEDE', 'VENDEDOR', 'ALIADO', 'FECHA', 'PRODUCTO', 'MAF (S/)', 'BONO (S/)', 'CRITERIO']));
      for (const g of this.grupos) for (const f of g.filas) for (const m of f.detalle) {
        wd.addRow([m.sede, m.vendedor, m.entidad, m.fecha, m.producto, m.maf, m.bono, m.nota]);
      }
      wd.columns.forEach((c, i) => { c.width = [26, 32, 12, 12, 44, 12, 11, 40][i]; });
      wd.views = [{ state: 'frozen', ySplit: 1 }];

      const wi = wb.addWorksheet(canal === 'SEDES' ? 'Incentivo Sedes' : 'Incentivo Realzza');
      wi.addRow([`INCENTIVO EMPRESA — ${this.incRangoLabel.toUpperCase()}`]).font = { bold: true };
      wi.addRow([`ASESORES (S/ ${INC_ASESOR_EFECTIVA} por producto Efectiva)`]).font = { bold: true };
      estilo(wi.addRow(['MES', 'SEDE', 'ASESOR', 'PRODUCTOS EFECTIVA', 'INCENTIVO (S/)']));
      for (const mm of this.incMeses) {
        for (const a of mm.asesores) wi.addRow([mm.label, a.sede, a.vendedor, a.productos, a.monto]);
        if (mm.asesores.length) wi.addRow([`Subtotal ${mm.label}`, '', '', mm.productos, mm.totAsesores]).font = { bold: true };
      }
      wi.addRow(['TOTAL', '', '', this.incTotales.productos, this.incTotales.asesores]).font = { bold: true };
      wi.addRow([]);
      wi.addRow([`GERENTES (S/ ${INC_GERENTE_EFECTIVA} por producto Efectiva + S/ ${INC_GERENTE_MOTO_GG} por moto Global Go)`]).font = { bold: true };
      estilo(wi.addRow(['MES', 'SEDE', 'GERENTE', 'PRODUCTOS EFECTIVA', 'S/ EFECTIVA', 'MOTOS GLOBAL GO', 'S/ GLOBAL GO', 'TOTAL (S/)']));
      for (const mm of this.incMeses) {
        for (const g of mm.gerentes) wi.addRow([mm.label, g.sede, g.gerente, g.productosEfectiva, g.montoEfectiva, g.motosGG, g.montoGG, g.total]);
        if (mm.gerentes.length) wi.addRow([`Subtotal ${mm.label}`, '', '', '', '', '', '', mm.totGerentes]).font = { bold: true };
      }
      wi.addRow(['TOTAL', '', '', '', '', '', '', this.incTotales.gerentes]).font = { bold: true };
      wi.columns.forEach((c, i) => { c.width = i === 0 ? 22 : i < 3 ? 34 : 18; });

      const wid = wb.addWorksheet(canal === 'SEDES' ? 'Detalle Incentivo Sedes' : 'Detalle Incentivo Realzza');
      estilo(wid.addRow(['MES', 'SEDE', 'GERENTE', 'VENDEDOR', 'TIPO', 'FECHA', 'CLIENTE', 'DNI', 'PRODUCTO', 'INCENTIVO ASESOR (S/)', 'INCENTIVO GERENTE (S/)']));
      for (const mm of this.incMeses) for (const g of mm.gerentes) for (const d of g.detalle) {
        wid.addRow([mm.label, d.sede, g.gerente, d.vendedor, d.tipo, d.fecha, d.cliente, d.dni, d.producto,
          d.tipo === 'EFECTIVA' ? INC_ASESOR_EFECTIVA : 0, d.monto]);
      }
      wid.columns.forEach((c, i) => { c.width = [18, 22, 32, 32, 16, 12, 36, 12, 48, 14, 14][i]; });
      wid.views = [{ state: 'frozen', ySplit: 1 }];
    }
    this.canal = canalPrevio; this.armar();
    const buf = await wb.xlsx.writeBuffer();
    FileSaver.saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `Bonos_Aliados_Motos_${this.periodo}.xlsx`);
  }

  /** Cliente, DNI, producto y fecha de una fila de `ventas`. */
  private datosCliente(r: any): { cliente: string; dni: string; producto: string; fecha: string } {
    return {
      cliente: (r.cliente_venta || '').toString().trim().toUpperCase(),
      dni: (r.doc_identidad || '').toString().trim(),
      producto: (r.productos || '').toString().trim(),
      fecha: `${String(r.dia_cv).padStart(2, '0')}/${String(r.mes_cv).padStart(2, '0')}/${r.anio_cv}`,
    };
  }

  private up(v: any): string {
    return (v ?? '').toString().trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  /** "SEDE RELENOR LAMBAYEQUE" → "LAMBAYEQUE"; "SEDE RETAIL REALZZA PIURA" → "REALZZA PIURA". */
  private nombreSede(s: any): string {
    const n = (s ?? '').toString().trim().toUpperCase().replace(/\s+/g, ' ').replace(/^SEDE\s+/, '').replace(/^RELENOR\s+/, '').replace(/^RETAIL\s+/, '');
    return n === 'REALZZA STORE' ? 'REALZZA CHICLAYO' : (n || 'SIN SEDE');
  }
}
