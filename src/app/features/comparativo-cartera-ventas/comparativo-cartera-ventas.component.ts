import { Component, ViewChild, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { DxDataGridComponent } from 'devextreme-angular';
import * as XLSX from 'xlsx';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { lastValueFrom } from 'rxjs';
import { CargaVentasService } from '../../services/carga-ventas.service';
import { ExcelExportService } from '../../services/excel/excel.service';
import { CapSedesService } from '../../services/cap-sedes.service';
import { SedeConfigService } from '../../services/sede-config.service';
import { ASESORES_CALL, ASESORES_CALL_CENTER_CARTERA, ASESORES_CALL_EN_CARTERA_PISO } from '../../shared/asesores';

interface FilaCartera {
  dni: string;
  vendedor: string;
  tipoBase: string;
  tipoCliente: string;
  sede: string;
}

// Una venta de cartera ya cruzada (solo los que convirtieron).
interface VentaCartera {
  vendedor: string;
  tipoBase: string;
  tipoCliente: string;        // de la CARTERA (asignación)
  tipoClienteAfect: string;   // de AFECTACIONES (tabla ventas)
  sede: string;
  dni: string;
  cliente: string;
  ops: number;
  monto: number;
}

// Fila del resumen por sede (vista principal, tipo avance de cartera).
interface ResumenSede {
  sede: string;
  asignados: number;
  vendidos: number;
  conversion: number;
  monto: number;
}

import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';

@Component({
  selector: 'app-comparativo-cartera-ventas',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES, LoadingOverlayComponent],
  templateUrl: './comparativo-cartera-ventas.component.html',
  styleUrl: './comparativo-cartera-ventas.component.css'
})
export class ComparativoCarteraVentasComponent {
  private ventasSrv = inject(CargaVentasService);
  private excelSrv = inject(ExcelExportService);
  private cap = inject(CapSedesService);
  private sedeCfg = inject(SedeConfigService);
  private snack = inject(MatSnackBar);

  @ViewChild('grid', { static: false }) grid!: DxDataGridComponent;

  form: UntypedFormGroup;
  isLoading = false;
  cartera: FilaCartera[] = [];
  nombreArchivo = '';
  aviso = '';
  yaCruzado = false;

  // Todos los convertidos + la vista filtrada por sede que ve el grid.
  private convertidosAll: VentaCartera[] = [];
  ventasCartera: VentaCartera[] = [];

  // Vista principal: avance por sede.
  resumenSedes: ResumenSede[] = [];

  // Desglose por estado de las ventas cruzadas (Cancelado / Activo / Pronto Pago…).
  desgloseEstados: { estado: string; cantidad: number; monto: number }[] = [];

  // Desglose de las ventas de la vista actual por TIPO DE CLIENTE (de afectaciones),
  // con % de participación sobre el total de la sede.
  desgloseTipoCliente: { tipo: string; ops: number; monto: number; pct: number }[] = [];

  // Sedes para el selector + cartera asignada por sede.
  sedesDisponibles: string[] = [];
  private asignadosPorSede = new Map<string, number>();
  private totalAsignados = 0;

  // Ventas de Call atribuidas a cada una de las 3 asesoras de Call Center (por nombre y
  // DNI) — así "Call Center" no se cruza con cualquier venta de piso del mismo DNI, sino
  // solo con lo que ELLAS vendieron (mismo criterio que Avance de Cartera).
  private ventasCallPorAsesor = new Map<string, Map<string, { ops: number; monto: number; cliente: string }>>();

  // Cartera deduplicada (para recontar asignados por CAP) + CAP por sede.
  private carteraUnica: FilaCartera[] = [];
  private capPorSede = new Map<string, Set<string>>();   // sedeKey → nombres normalizados activos
  capAplicado = false;   // true cuando el detalle está filtrado por el CAP de la sede

  // KPIs
  kAsignados = 0; kVendidos = 0; kMonto = 0;
  get kConversion(): number { return this.kAsignados ? this.kVendidos / this.kAsignados : 0; }

  constructor(private fb: UntypedFormBuilder) {
    this.form = this.fb.group({ mes: [new Date()], sede: [''] });
  }

  // ── Utilidades ──────────────────────────────────────────────────────────────
  private norm(s: any): string {
    return (s ?? '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
  }
  private soloDigitos(v: any): string {
    return (v ?? '').toString().replace(/\D/g, '').replace(/^0+/, '');
  }

  private sinTildes(v: any): string {
    return (v ?? '').toString().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }
  /** Sede de la venta normalizada igual que Avance de Cartera (quita el prefijo del
   *  sistema de ventas). Solo cuentan las sedes de PISO dadas de alta en el catálogo:
   *  automáticamente deja fuera Incautados, La Victoria, Oficina Central, Realzza,
   *  almacenes, etc., sin tener que mantener una lista de exclusión aparte. */
  private sedeKeyVenta(raw: any): string {
    return this.sedeCfg.normalizar((raw ?? '').toString()).replace(/^sederelenor/, '');
  }
  private sedeReconocida(sede: any): boolean {
    return !!this.sedeCfg.getConfig(this.sedeKeyVenta(sede))?.nombre;
  }
  /** Mismo criterio que Avance de Cartera: solo Nota de Crédito e Incautación no son
   *  venta real. Pronto Pago, Cancelado, Activo, etc. sí cuentan. */
  private estadoExcluido(estado: any): boolean {
    const s = this.sinTildes(estado);
    return /NOTA DE/.test(s) || /INCAUTAC/.test(s);
  }
  private detectar(headers: string[], exactos: string[], fragmentos: string[]): string | null {
    const H = headers.map(h => ({ raw: h, n: this.norm(h).replace(/\s+/g, '') }));
    for (const e of exactos) {
      const t = this.norm(e).replace(/\s+/g, '');
      const f = H.find(h => h.n === t);
      if (f) return f.raw;
    }
    for (const fr of fragmentos) {
      const t = this.norm(fr).replace(/\s+/g, '');
      const f = H.find(h => h.n.includes(t));
      if (f) return f.raw;
    }
    return null;
  }

  // ── Importar Excel de piso (cartera) ─────────────────────────────────────────
  importar(event: any): void {
    const file = event.target.files[0];
    if (!file) return;
    this.nombreArchivo = file.name;
    const reader = new FileReader();
    reader.onload = async (e: any) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }) as any[];
        if (!rows.length) { this.toast('El Excel de piso está vacío.', true); return; }

        const headers = Object.keys(rows[0]);
        const cDni  = this.detectar(headers, ['DNI', 'DNI CLIENTE', 'DOC IDENTIDAD', 'DOCIDENTIDAD', 'DOCUMENTO'], ['DNI', 'DOCIDENTIDAD', 'DOCUMENTO']);
        const cVend = this.detectar(headers, ['AsignacionFinal', 'AsesorFinal', 'ASIGNACION FINAL', 'ASESOR FINAL', 'VENDEDOR', 'ASESOR', 'ASIGNACION'], ['ASIGNACION', 'ASESOR', 'VENDEDOR', 'EJECUTIVO', 'PROMOTOR', 'GESTOR']);
        const cBase = this.detectar(headers, ['TIPO DE BASE', 'TIPOBASE', 'TIPO BASE'], ['TIPODEBASE', 'TIPOBASE']);
        const cCli  = this.detectar(headers, ['TIPO DE CLIENTE', 'TIPOCLIENTE', 'TIPO CLIENTE'], ['TIPODECLIENTE', 'TIPOCLIENTE']);
        const cSede = this.detectar(headers, ['ZONA', 'ZONAS', 'SEDE', 'TIENDA'], ['ZONA', 'SEDE', 'TIENDA']);

        const faltan: string[] = [];
        if (!cDni)  faltan.push('DNI');
        if (!cVend) faltan.push('vendedor (AsignacionFinal)');
        if (!cBase) faltan.push('tipo de base');
        if (!cCli)  faltan.push('tipo de cliente');
        this.aviso = faltan.length
          ? `⚠️ No se detectaron estas columnas en el Excel: ${faltan.join(', ')}. Se agruparán como "SIN DATO".`
          : '';

        this.cartera = rows.map(r => ({
          dni:         cDni  ? String(r[cDni]) : '',
          vendedor:    (cVend ? String(r[cVend]) : '').trim().toUpperCase() || 'SIN VENDEDOR',
          tipoBase:    (cBase ? String(r[cBase]) : '').trim().toUpperCase() || 'SIN BASE',
          tipoCliente: (cCli  ? String(r[cCli])  : '').trim().toUpperCase() || 'SIN TIPO',
          sede:        (cSede ? String(r[cSede]) : '').trim().toUpperCase(),
        })).filter(f => this.soloDigitos(f.dni));

        if (!this.cartera.length) { this.toast('No se encontró ninguna fila con DNI válido.', true); return; }
        await this.recalcular();
      } catch (err) {
        console.error('❌ importar cartera:', err);
        this.toast('No se pudo leer el Excel de piso.', true);
      } finally {
        event.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ── Cruce cartera ↔ ventas netas (Postgres) → solo convertidos ───────────────
  async recalcular(): Promise<void> {
    if (!this.cartera.length) { this.toast('Primero importa el Excel de piso.', true); return; }
    this.isLoading = true;
    try {
      const mes: Date = this.form.value.mes || new Date();
      const anio = mes.getFullYear();
      const nMes = mes.getMonth() + 1;

      const ventas = await lastValueFrom(this.ventasSrv.obtenerVentas(anio, { mes: nMes }));
      await this.cargarVentasCall(anio, nMes);

      // Ventas REALES DE PISO, indexadas por DNI y por SEDE DE CIERRE (mismo criterio que
      // Avance de Cartera): solo sedes de piso dadas de alta en el catálogo (deja fuera La
      // Victoria, Incautados, Oficina Central, Realzza, etc.), solo estados de venta real
      // (Nota de Crédito e Incautación fuera), monto > 0. La venta cuenta en la sede donde
      // se CERRÓ, no en la de la base (cartera) — igual que Avance de Cartera. "N° Ventas"
      // cuenta OPERACIONES (si un cliente compró 2 veces, cuenta 2), también igual.
      const ventasPorDniSede = new Map<string, Map<string, { ops: number; monto: number }>>();
      const nombrePorDni = new Map<string, string>();
      const tipoClientePorDni = new Map<string, string>();
      const ventasValidas: { dni: string; estado: string; monto: number }[] = [];
      (ventas || []).forEach(v => {
        if (!this.sedeReconocida(v.sede)) return;
        if (this.estadoExcluido(v.estado_venta)) return;
        const monto = Number(v.monto_consolidado) || 0;
        if (monto <= 0) return;
        const dni = this.soloDigitos(v.doc_identidad);
        if (!dni) return;
        ventasValidas.push({ dni, estado: this.sinTildes(v.estado_venta), monto });
        const sedeKey = this.sedeKeyVenta(v.sede);
        const porSede = ventasPorDniSede.get(dni) ?? new Map<string, { ops: number; monto: number }>();
        const cur = porSede.get(sedeKey) ?? { ops: 0, monto: 0 };
        cur.ops += 1; cur.monto += monto;
        porSede.set(sedeKey, cur);
        ventasPorDniSede.set(dni, porSede);
        if (!nombrePorDni.has(dni) && v.cliente_venta) nombrePorDni.set(dni, (v.cliente_venta || '').toString());
        if (!tipoClientePorDni.has(dni) && v.tipo_cliente) tipoClientePorDni.set(dni, (v.tipo_cliente || '').toString().trim().toUpperCase());
      });

      // Recorre la cartera (dedup por DNI): guarda la BASE de cada cliente (sede asignada
      // en el Excel, normalizada igual que el catálogo) + su vendedor/tipoBase/tipoCliente.
      // Las 5 asesoras de Call Center (ASESORES_CALL_EN_CARTERA_PISO) no son vendedoras
      // físicas: se sacan de las sedes. Las 3 que hoy sí gestionan cartera por Call
      // (ASESORES_CALL_CENTER_CARTERA) se agrupan aparte como sede "Call Center", cruzadas
      // SOLO con lo que ELLAS vendieron en Call (no cualquier venta del mismo DNI).
      const vistos = new Set<string>();
      const carteraUnica: FilaCartera[] = [];
      const infoPorDni = new Map<string, { vendedor: string; tipoBase: string; tipoCliente: string }>();
      const baseSedeKeyPorDni = new Map<string, string>();
      const asignadosPorSedeKey = new Map<string, { nombre: string; asignados: number }>();
      let totalAsignados = 0;
      for (const r of this.cartera) {
        const dni = this.soloDigitos(r.dni);
        if (!dni || vistos.has(dni)) continue;
        vistos.add(dni);
        infoPorDni.set(dni, { vendedor: r.vendedor, tipoBase: r.tipoBase, tipoCliente: r.tipoCliente });

        if (ASESORES_CALL_EN_CARTERA_PISO.has(r.vendedor)) {
          if (!ASESORES_CALL_CENTER_CARTERA.has(r.vendedor)) continue;   // Karen/Esmeralda: ya no gestionan cartera
          totalAsignados++;
          baseSedeKeyPorDni.set(dni, 'call-center');
          const g = asignadosPorSedeKey.get('call-center') ?? { nombre: 'Call Center', asignados: 0 };
          g.asignados++; asignadosPorSedeKey.set('call-center', g);
          carteraUnica.push({ dni: r.dni, vendedor: r.vendedor, tipoBase: r.tipoBase, tipoCliente: r.tipoCliente, sede: 'Call Center' });
          continue;
        }

        totalAsignados++;
        const key = this.sedeCfg.normalizar(r.sede || '') || 'sin-sede';
        const nombre = this.sedeCfg.getConfig(key)?.nombre ?? (r.sede || 'SIN SEDE');
        baseSedeKeyPorDni.set(dni, key);
        const g = asignadosPorSedeKey.get(key) ?? { nombre, asignados: 0 };
        g.asignados++; asignadosPorSedeKey.set(key, g);
        carteraUnica.push({ dni: r.dni, vendedor: r.vendedor, tipoBase: r.tipoBase, tipoCliente: r.tipoCliente, sede: nombre });
      }
      this.carteraUnica = carteraUnica;

      // Ventas: cada DNI (único) cuenta sus operaciones EN LA SEDE DONDE SE CERRARON (igual
      // que Avance de Cartera); Call Center se cruza aparte con ventasCallPorAsesor.
      const convertidos: VentaCartera[] = [];
      const vendidosPorSedeKey = new Map<string, { nombre: string; vendidos: number; monto: number }>();
      for (const [dni, key] of baseSedeKeyPorDni) {
        const info = infoPorDni.get(dni)!;
        if (key === 'call-center') {
          const hitCC = this.ventasCallPorAsesor.get(info.vendedor)?.get(dni);
          if (!hitCC) continue;
          const g = vendidosPorSedeKey.get(key) ?? { nombre: 'Call Center', vendidos: 0, monto: 0 };
          g.vendidos += hitCC.ops; g.monto += hitCC.monto;
          vendidosPorSedeKey.set(key, g);
          convertidos.push({
            vendedor: info.vendedor, tipoBase: info.tipoBase, tipoCliente: info.tipoCliente,
            tipoClienteAfect: 'CALL', sede: 'Call Center', dni, cliente: hitCC.cliente, ops: hitCC.ops, monto: hitCC.monto,
          });
          continue;
        }
        const porSede = ventasPorDniSede.get(dni);
        if (!porSede) continue;
        for (const [sedeKeyVenta, agg] of porSede) {
          const nombreVenta = this.sedeCfg.getConfig(sedeKeyVenta)?.nombre;
          if (!nombreVenta) continue;   // ya filtrado arriba, por seguridad
          const g = vendidosPorSedeKey.get(sedeKeyVenta) ?? { nombre: nombreVenta, vendidos: 0, monto: 0 };
          g.vendidos += agg.ops; g.monto += agg.monto;
          vendidosPorSedeKey.set(sedeKeyVenta, g);
          convertidos.push({
            vendedor: info.vendedor, tipoBase: info.tipoBase, tipoCliente: info.tipoCliente,
            tipoClienteAfect: tipoClientePorDni.get(dni) || 'SIN TIPO',
            sede: nombreVenta, dni, cliente: nombrePorDni.get(dni) || '', ops: agg.ops, monto: agg.monto,
          });
        }
      }

      // Desglose por estado de las ventas que cruzaron con la cartera (ej. cuántas PRONTO PAGO).
      const porEstado = new Map<string, { cantidad: number; monto: number }>();
      for (const vv of ventasValidas) {
        if (!vistos.has(vv.dni)) continue;   // solo ventas de clientes de la cartera
        const cur = porEstado.get(vv.estado) || { cantidad: 0, monto: 0 };
        cur.cantidad++; cur.monto += vv.monto;
        porEstado.set(vv.estado, cur);
      }
      this.desgloseEstados = Array.from(porEstado.entries())
        .map(([estado, d]) => ({ estado, cantidad: d.cantidad, monto: Math.round(d.monto) }))
        .sort((a, b) => b.cantidad - a.cantidad);
      console.log('🔎 Ventas cruzadas por estado:', this.desgloseEstados);

      // CAP por sede: solo asesores ACTIVOS que pertenecen a cada sede.
      await this.cargarCap();

      // Resumen por sede: unión de las sedes con cartera asignada y las que solo recibieron
      // ventas de otra base (igual que Avance de Cartera).
      const claves = new Set<string>([...asignadosPorSedeKey.keys(), ...vendidosPorSedeKey.keys()]);
      this.resumenSedes = Array.from(claves).map(key => {
        const a = asignadosPorSedeKey.get(key);
        const v = vendidosPorSedeKey.get(key);
        const sede = a?.nombre ?? v?.nombre ?? key;
        const asignados = a?.asignados ?? 0;
        return { sede, asignados, vendidos: v?.vendidos ?? 0, monto: Math.round(v?.monto ?? 0), conversion: asignados ? (v?.vendidos ?? 0) / asignados : 0 };
      }).sort((a, b) => b.monto - a.monto || b.vendidos - a.vendidos);

      this.convertidosAll = convertidos;
      this.asignadosPorSede = new Map(Array.from(asignadosPorSedeKey.values()).map(g => [g.nombre, g.asignados]));
      this.totalAsignados = totalAsignados;
      this.sedesDisponibles = this.resumenSedes.map(s => s.sede)
        .filter(s => s && s !== 'SIN SEDE' && s !== 'Call Center').sort();
      if (asignadosPorSedeKey.has('call-center')) this.sedesDisponibles = [...this.sedesDisponibles, 'Call Center'];
      this.yaCruzado = true;
      this.aplicarSede();

      if (!convertidos.length) {
        this.toast('No hubo ventas netas de la cartera en el mes seleccionado.', false);
      }
    } catch (e) {
      console.error('❌ recalcular comparativo:', e);
      this.toast('No se pudieron traer las ventas del sistema (revisa la conexión).', true);
    } finally {
      this.isLoading = false;
    }
  }

  /** Ventas de Call (ventas_call) del mes, atribuidas por nombre de asesora (mismo
   *  criterio de estado real/monto>0 que `estadoExcluido`, 1 vez por código de venta). */
  private async cargarVentasCall(anio: number, mes: number): Promise<void> {
    this.ventasCallPorAsesor = new Map();
    try {
      const rows = await lastValueFrom(this.ventasSrv.obtenerVentasCanal('call', { anio, mes }));
      const vistosCv = new Set<string>();
      for (const r of (rows || [])) {
        if (this.estadoExcluido(r.estado_venta)) continue;
        const monto = Number(r.monto_consolidado) || 0;
        if (monto <= 0) continue;
        const cv = String(r.codigo_cv ?? '');
        if (cv && vistosCv.has(cv)) continue;
        if (cv) vistosCv.add(cv);
        const dni = this.soloDigitos(r.doc_identidad);
        if (!dni) continue;
        const vend = String(r.vendedor ?? '').trim().toUpperCase();
        const nombre = ASESORES_CALL.find(a => a.value === vend || a.nombre === vend)?.nombre;
        if (!nombre) continue;
        const porDni = this.ventasCallPorAsesor.get(nombre) ?? new Map<string, { ops: number; monto: number; cliente: string }>();
        const cur = porDni.get(dni) ?? { ops: 0, monto: 0, cliente: (r.cliente_venta || '').toString() };
        cur.ops += 1; cur.monto += monto;
        porDni.set(dni, cur);
        this.ventasCallPorAsesor.set(nombre, porDni);
      }
    } catch { /* sin ventas de Call → Call Center muestra 0 */ }
  }

  // Construye el mapa CAP: sedeKey → nombres normalizados de asesores ACTIVOS.
  private async cargarCap(): Promise<void> {
    try {
      const rows = await this.cap.cargar();
      const map = new Map<string, Set<string>>();
      for (const r of rows) {
        if (r.estado !== 'ACTIVO') continue;
        if (!map.has(r.sedeKey)) map.set(r.sedeKey, new Set());
        map.get(r.sedeKey)!.add(this.normNombre(r.vendedor));
      }
      this.capPorSede = map;
    } catch {
      this.capPorSede = new Map();   // sin CAP → no se filtra (fallback)
    }
  }

  private normNombre(v: any): string {
    return (v ?? '').toString().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  }

  // Filtra la vista (y los KPIs) por la sede elegida. En el detalle de una sede,
  // solo se muestran los asesores que pertenecen a esa sede según el CAP.
  aplicarSede(): void {
    const sede = (this.form.value.sede || '').toString();
    this.capAplicado = false;

    if (!sede) {
      this.ventasCartera = this.convertidosAll;
      this.kAsignados = this.totalAsignados;
      this.kVendidos = this.ventasCartera.reduce((s, c) => s + c.ops, 0);
      this.kMonto = Math.round(this.ventasCartera.reduce((s, c) => s + c.monto, 0));
      this.todoExpandido = false;
      this.calcularTipoCliente();
      return;
    }

    // Detalle = TOTALIDAD de la sede (todas las ventas de su cartera asignada),
    // sin desglosar ni filtrar por asesor. Así cuadra con el resumen por sede.
    this.capAplicado = false;
    const vista = this.convertidosAll.filter(c => c.sede === sede);
    this.ventasCartera = vista;
    this.kAsignados = this.carteraUnica.filter(c => c.sede === sede).length;
    this.kVendidos = vista.reduce((s, c) => s + c.ops, 0);
    this.kMonto = Math.round(vista.reduce((s, c) => s + c.monto, 0));
    this.todoExpandido = false;
    this.calcularTipoCliente();
  }

  /** Desglose de la vista actual por TIPO DE CLIENTE (afectaciones) con % del total. */
  private calcularTipoCliente(): void {
    const m = new Map<string, { ops: number; monto: number }>();
    for (const c of this.ventasCartera) {
      const k = (c.tipoClienteAfect || 'SIN TIPO').toString().trim().toUpperCase() || 'SIN TIPO';
      const cur = m.get(k) || { ops: 0, monto: 0 };
      cur.ops += c.ops; cur.monto += c.monto;
      m.set(k, cur);
    }
    const totalMonto = [...m.values()].reduce((s, x) => s + x.monto, 0);
    this.desgloseTipoCliente = [...m.entries()]
      .map(([tipo, x]) => ({ tipo, ops: x.ops, monto: Math.round(x.monto), pct: totalMonto ? (x.monto / totalMonto) * 100 : 0 }))
      .sort((a, b) => b.monto - a.monto);
  }

  get sedeSeleccionada(): string { return (this.form.value.sede || '').toString(); }

  // Vista principal = resumen por sede (cuando hay sedes y no se eligió ninguna).
  get mostrarResumen(): boolean {
    return this.yaCruzado && !this.sedeSeleccionada && this.sedesDisponibles.length > 0;
  }

  // Barra comparativa de conversión (relativa a la mejor sede).
  get maxConversion(): number {
    return this.resumenSedes.reduce((m, s) => Math.max(m, s.conversion), 0) || 1;
  }
  barPct(conv: number): number {
    return Math.round((conv / this.maxConversion) * 100);
  }
  barClase(conv: number): string {
    const r = conv / this.maxConversion;
    return r >= 0.66 ? 'hi' : r >= 0.33 ? 'mid' : 'lo';
  }

  seleccionarSede(sede: string): void {
    this.form.patchValue({ sede });
    this.aplicarSede();
  }
  volverAResumen(): void {
    this.form.patchValue({ sede: '' });
    this.aplicarSede();
  }

  exportar(): void {
    if (this.grid && this.ventasCartera.length) {
      this.excelSrv.exportarDesdeGrid('ComparativoCarteraVentasPiso', this.grid);
    }
  }

  // Expandir / colapsar todos los asesores del detalle.
  todoExpandido = false;
  toggleExpandir(): void {
    if (!this.grid) return;
    this.todoExpandido = !this.todoExpandido;
    if (this.todoExpandido) this.grid.instance.expandAll(0);
    else this.grid.instance.collapseAll(0);
  }

  onCellPrepared(e: any): void {
    if (e.rowType === 'header') {
      e.cellElement.style.backgroundColor = '#293964';
      e.cellElement.style.color = '#fff';
      e.cellElement.style.fontWeight = '700';
      e.cellElement.style.textAlign = 'center';
    }
    if (e.rowType === 'group') {
      e.cellElement.style.background = '#eaf0fb';
      e.cellElement.style.fontWeight = '800';
      e.cellElement.style.color = '#1E3A5F';
      e.cellElement.style.fontSize = '14px';
    }
    if (e.rowType === 'data' && e.column?.dataField === 'monto') {
      e.cellElement.style.fontWeight = '700';
      e.cellElement.style.color = '#1a3a6b';
    }
  }

  /** Toast de confirmación / error (arriba a la derecha), como en el resto de la app. */
  private toast(msg: string, error = false): void {
    this.snack.open(msg, 'OK', {
      duration: error ? 5000 : 3500,
      horizontalPosition: 'end',
      verticalPosition: 'top',
      panelClass: error ? 'toast-error' : 'toast-ok',
    });
  }

  formatPct(v: number): string { return `${(v * 100).toFixed(1)}%`; }
  formatSoles(v: number): string { return `S/ ${Math.round(v).toLocaleString('es-PE')}`; }

  // Formato de moneda para el grid/summaries → S/ (no "PEN").
  montoFormat = (v: number): string => `S/ ${Math.round(v || 0).toLocaleString('es-PE')}`;
}
