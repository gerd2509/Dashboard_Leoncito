import { Component, Input, OnChanges, inject } from '@angular/core';
import { lastValueFrom } from 'rxjs';
import { Workbook } from 'exceljs';
import * as FileSaver from 'file-saver';
import { SHARED_MATERIAL_IMPORTS } from '../../common_imports';
import { CargaVentasService } from '../../../services/carga-ventas.service';

type Entidad = 'GLOBAL GO' | 'EFECTIVA' | 'ALFIN';
type Canal = 'SEDES' | 'REALZZA';

interface MotoAliado {
  sede: string; vendedor: string; entidad: Entidad; fecha: string;
  producto: string; maf: number; bono: number; nota: string;
}
interface FilaVendedor {
  vendedor: string;
  motos: Record<Entidad, number>;
  bono: Record<Entidad, number>;
  total: number;
  detalle: MotoAliado[];
}
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

  ngOnChanges(): void { if (this.anio && this.mes) this.cargar(); }

  private get periodo(): string { return `${this.anio}-${String(this.mes).padStart(2, '0')}`; }
  vigente(e: Entidad): boolean { return this.periodo >= REGLAS[e].desde; }

  async cargar(): Promise<void> {
    this.cargando = true; this.error = '';
    try {
      const rows = await lastValueFrom(this.ventasSrv.obtenerVentas(this.anio, { mes: this.mes }));
      this.motos = [];
      for (const r of rows || []) {
        if (Number(r.anio_cv) !== this.anio || Number(r.mes_cv) !== this.mes) continue;   // solo mes de venta
        if (!this.up(r.estado_tipo_producto).includes('MOTO')) continue;
        const ent = this.up(r.entidad);
        const entidad = ENTIDADES.find(e => ent.includes(e));
        if (!entidad) continue;
        const estado = this.up(r.estado_venta);
        if (estado.includes('NOTA DE CR') || estado.includes('INCAUTAC')) continue;
        const maf = Number(r.monto_consolidado) || 0;
        if (maf <= 0) continue;
        this.motos.push({
          sede: this.nombreSede(r.sede), vendedor: (r.vendedor || 'SIN VENDEDOR').toString().trim().toUpperCase(),
          entidad, fecha: `${String(r.dia_cv).padStart(2, '0')}/${String(r.mes_cv).padStart(2, '0')}/${r.anio_cv}`,
          producto: (r.productos || '').toString(), maf, bono: 0, nota: '',
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
    }
    this.canal = canalPrevio; this.armar();
    const buf = await wb.xlsx.writeBuffer();
    FileSaver.saveAs(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `Bonos_Aliados_Motos_${this.periodo}.xlsx`);
  }

  private up(v: any): string {
    return (v ?? '').toString().trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  /** "SEDE RELENOR LAMBAYEQUE" → "LAMBAYEQUE"; "SEDE RETAIL REALZZA PIURA" → "REALZZA PIURA". */
  private nombreSede(s: any): string {
    const n = this.up(s).replace(/^SEDE\s+/, '').replace(/^RELENOR\s+/, '').replace(/^RETAIL\s+/, '');
    return n === 'REALZZA STORE' ? 'REALZZA CHICLAYO' : (n || 'SIN SEDE');
  }
}
