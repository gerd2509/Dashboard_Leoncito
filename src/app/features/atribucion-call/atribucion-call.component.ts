import { Component, OnInit, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CargaVentasService } from '../../services/carga-ventas.service';
import { ASESORES_CALL, nombreCorto } from '../../shared/asesores';

type Estado = 'DERIVACION' | 'MANUAL' | 'PENDIENTE';

/**
 * Atribución de Ventas (AsesorVenta). Reemplaza el VLOOKUP del Excel "GESTION
 * CONTACT CENTER": cruza cada venta de la tabla `ventas` (afectaciones PB) con la
 * última gestión de derivación en gestion_call (≤31 días) y asigna el CC + el
 * TipoCliente. Las columnas AsesorVenta / CONTACTO / TipoCliente / TipoBase son
 * editables (se corrigen a mano y quedan protegidas del re-cruce).
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

  cargando = false;
  cruzando = false;
  consolidando = false;
  ventas: any[] = [];
  resultado: { actualizados: number; total: number } | null = null;

  filtro: 'todos' | 'DERIVACION' | 'MANUAL' | 'PENDIENTE' = 'todos';

  // Búsqueda server-side por DNI sobre TODAS las afectaciones del mes.
  dni = '';
  buscando = false;
  yaBusco = false;
  resultados: any[] = [];

  // ── Opciones de los campos editables ──
  // AsesorVenta: los CC de Call + NAS.
  readonly ccOpciones = [
    ...ASESORES_CALL.map(a => ({ cc: a.value, label: `${a.value} · ${nombreCorto(a.nombre)}` })),
    { cc: 'NAS', label: 'NAS' },
  ];
  // CONTACTO: lista fija (origen del contacto).
  readonly contactoOpciones = ['BD', 'MARKET PLACE', 'KOMMO', 'BD KOMMO LEONCITO', 'NUEVO'];
  // TipoCliente / TipoBase: los tipos que maneja la gestión Call.
  readonly tipoOpciones = [
    'DORMIDO', 'NUEVO', 'NO VIGENTE', 'VIGENTE', 'AFILIACIONES', 'LOVER A', 'LOVER B',
    'REENGANCHE', 'CANCELADO', 'BRILLA', 'SORTEO - LA VICTORIA', 'EFECTIVA',
  ];

  // ── Popup de edición ──
  editVisible = false;
  editando: any = null;
  modelo: { vendedor: string; contacto: string; tipo_cliente: string; tipo_base: string } =
    { vendedor: '', contacto: '', tipo_cliente: '', tipo_base: '' };
  guardandoEdicion = false;

  ngOnInit(): void { this.cargar(); }

  cargar(): void {
    this.cargando = true; this.resultado = null;
    this.svc.listarAtribucionCall(this.anio || undefined, this.mes || undefined).subscribe({
      next: rows => { this.ventas = rows || []; this.cargando = false; },
      error: () => { this.cargando = false; this.ventas = []; this.toast('❌ No se pudo cargar la lista.', true); },
    });
  }

  cruzar(): void {
    this.cruzando = true; this.resultado = null;
    this.svc.cruzarDerivacionCall(this.anio || undefined, this.mes || undefined).subscribe({
      next: r => {
        this.cruzando = false; this.resultado = r;
        this.toast(`✔ ${r.actualizados} atribuidas ahora · ${r.total} con derivación en total.`);
        this.cargar();   // recarga la lista con el resultado del cruce
      },
      error: () => { this.cruzando = false; this.toast('❌ No se pudo cruzar (revisa el servidor).', true); },
    });
  }

  /** Copia las ventas atribuidas del mes a ventas_call (lo que consume Ventas Call). */
  consolidar(): void {
    if (!this.ventas.length) { this.toast('Primero carga/cruza el mes.', true); return; }
    this.consolidando = true;
    this.svc.consolidarVentasCall(this.anio || undefined, this.mes || undefined).subscribe({
      next: r => {
        this.consolidando = false;
        this.toast(`✔ Consolidado a Ventas Call: ${r.total} (${r.insertados} nuevas, ${r.actualizados} actualizadas).`);
      },
      error: () => { this.consolidando = false; this.toast('❌ No se pudo consolidar.', true); },
    });
  }

  // ── Estado / conteos ──
  estado(v: any): Estado {
    if (v.asesor_manual) return 'MANUAL';
    if (v.cc_sugerido) return 'DERIVACION';
    return 'PENDIENTE';
  }
  estadoTxt(v: any): string {
    const e = this.estado(v);
    return e === 'DERIVACION' ? 'Derivación' : e === 'MANUAL' ? 'Manual' : 'Pendiente';
  }
  estadoIcon(v: any): string {
    const e = this.estado(v);
    return e === 'MANUAL' ? 'edit' : e === 'DERIVACION' ? 'call_split' : 'help_outline';
  }
  get nDeriv(): number { return this.ventas.filter(v => this.estado(v) === 'DERIVACION').length; }
  get nManual(): number { return this.ventas.filter(v => this.estado(v) === 'MANUAL').length; }

  get ventasFiltradas(): any[] {
    return this.ventas.filter(v => this.filtro === 'todos' || this.estado(v) === this.filtro);
  }
  setFiltro(f: 'todos' | 'DERIVACION' | 'MANUAL' | 'PENDIENTE'): void { this.filtro = f; }

  /** Busca el DNI en el backend, sobre TODAS las afectaciones del mes seleccionado. */
  buscar(): void {
    const d = (this.dni || '').replace(/\D/g, '');
    if (!d) { this.toast('Escribe un DNI para buscar.', true); return; }
    this.buscando = true; this.yaBusco = true;
    this.svc.buscarVentaCall(d, this.anio || undefined, this.mes || undefined).subscribe({
      next: rows => { this.resultados = rows || []; this.buscando = false; },
      error: () => { this.buscando = false; this.resultados = []; this.toast('❌ No se pudo buscar.', true); },
    });
  }
  limpiarBusqueda(): void { this.dni = ''; this.resultados = []; this.yaBusco = false; }

  // ── Edición (popup) ──
  abrirEdicion(v: any): void {
    this.editando = v;
    this.modelo = {
      vendedor: v.vendedor || v.cc_sugerido || '',
      contacto: v.contacto || '',
      tipo_cliente: v.tipo_cliente || v.tc_sugerido || '',
      tipo_base: v.tipo_base || v.tipo_cliente || v.tc_sugerido || '',
    };
    this.editVisible = true;
  }
  /** TipoBase sigue a TipoCliente automáticamente (se puede sobrescribir después). */
  onTipoClienteChange(val: string): void { this.modelo.tipo_base = val; }

  guardarEdicion(): void {
    const v = this.editando; if (!v) return;
    const cc = (this.modelo.vendedor || '').trim();
    if (!cc) { this.toast('Selecciona el AsesorVenta (CC).', true); return; }
    this.guardandoEdicion = true;
    this.svc.guardarAtribucionVenta(v.codigo_cv, {
      vendedor: cc,
      contacto: this.modelo.contacto || '',
      tipo_cliente: this.modelo.tipo_cliente || '',
      tipo_base: this.modelo.tipo_base || '',
    }).subscribe({
      next: () => {
        Object.assign(v, {
          vendedor: cc, contacto: this.modelo.contacto || null,
          tipo_cliente: this.modelo.tipo_cliente || null, tipo_base: this.modelo.tipo_base || null,
          asesor_manual: true,
        });
        // refleja el cambio en la otra tabla (lista ↔ resultados) si la venta está en ambas
        const gemelo = [...this.ventas, ...this.resultados].find(x => x !== v && x.codigo_cv === v.codigo_cv);
        if (gemelo) Object.assign(gemelo, { vendedor: cc, contacto: v.contacto, tipo_cliente: v.tipo_cliente, tipo_base: v.tipo_base, asesor_manual: true });
        this.guardandoEdicion = false; this.editVisible = false;
        this.toast('✔ Atribución actualizada.');
      },
      error: () => { this.guardandoEdicion = false; this.toast('❌ No se pudo guardar.', true); },
    });
  }

  fecha(v: any): string { return `${String(v.dia_cv).padStart(2, '0')}/${String(v.mes_cv).padStart(2, '0')}/${v.anio_cv}`; }

  private toast(msg: string, error = false): void {
    this.snack.open(msg, 'OK', {
      duration: error ? 5000 : 3500, horizontalPosition: 'end', verticalPosition: 'top',
      panelClass: error ? 'toast-error' : 'toast-ok',
    });
  }
}
