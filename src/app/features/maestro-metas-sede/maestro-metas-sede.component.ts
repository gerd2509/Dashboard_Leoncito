import { Component, OnInit, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CargaVentasService } from '../../services/carga-ventas.service';

interface MetaFila { id: number | null; sede: string; anio: number; mes: number; meta: number; actual: number; logro: number; }
interface MetaTbFila { id: number | null; tipo_base: string; anio: number; mes: number; meta: number; }

/**
 * Maestro Metas (admin): meta mensual editable. Dos vistas (toggle):
 *  - POR SEDE → alimenta el %logro que gatilla el Bono Volumen del sueldo de piso.
 *  - POR TIPO DE BASE (Realzza) → alimenta la columna Meta/%avance de "Ventas por tipo
 *    de base" en Ventas Realzza (antes venía del Excel; ahora editable en BD).
 */
@Component({
  selector: 'app-maestro-metas-sede',
  standalone: true,
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './maestro-metas-sede.component.html',
  styleUrl: './maestro-metas-sede.component.css',
})
export class MaestroMetasSedeComponent implements OnInit {
  private svc = inject(CargaVentasService);
  private snack = inject(MatSnackBar);

  modo: 'sede' | 'tipoBase' = 'sede';
  filas: MetaFila[] = [];       // vista por sede
  filasTb: MetaTbFila[] = [];   // vista por tipo de base
  cargando = false;
  anio = new Date().getFullYear();
  mes = new Date().getMonth() + 1;
  readonly anios: number[] = [];
  readonly meses = [
    { v: 1, l: 'Enero' }, { v: 2, l: 'Febrero' }, { v: 3, l: 'Marzo' }, { v: 4, l: 'Abril' },
    { v: 5, l: 'Mayo' }, { v: 6, l: 'Junio' }, { v: 7, l: 'Julio' }, { v: 8, l: 'Agosto' },
    { v: 9, l: 'Septiembre' }, { v: 10, l: 'Octubre' }, { v: 11, l: 'Noviembre' }, { v: 12, l: 'Diciembre' },
  ];

  constructor() {
    const y = new Date().getFullYear();
    for (let i = y + 1; i >= y - 3; i--) this.anios.push(i);
  }

  ngOnInit(): void { this.cargar(); }

  setModo(m: 'sede' | 'tipoBase'): void { if (this.modo !== m) { this.modo = m; this.cargar(); } }
  onAnio(v: number): void { this.anio = v; this.cargar(); }
  onMes(v: number): void { this.mes = v; this.cargar(); }

  cargar(): void {
    this.cargando = true;
    const obs = this.modo === 'sede'
      ? this.svc.getMetaSede(this.anio, this.mes)
      : this.svc.getMetaTipoBase(this.anio, this.mes);
    obs.subscribe({
      next: (r: any[]) => {
        if (this.modo === 'sede') this.filas = r || []; else this.filasTb = r || [];
        this.cargando = false;
      },
      error: () => { this.filas = []; this.filasTb = []; this.cargando = false; this.toast('No se pudo cargar las metas.', true); },
    });
  }

  /** Guarda la meta editada de una fila (upsert por sede/tipo-base + anio/mes). */
  onRowUpdated(e: any): void {
    const f = e?.data;
    if (!f) return;
    const meta = Number(String(f.meta ?? '').toString().replace(/[^0-9.]/g, '')) || 0;
    const obs = this.modo === 'sede'
      ? this.svc.guardarMetaSede({ sede: f.sede, anio: this.anio, mes: this.mes, meta })
      : this.svc.guardarMetaTipoBase({ tipo_base: f.tipo_base, anio: this.anio, mes: this.mes, meta });
    obs.subscribe({
      next: () => { this.toast('✔ Meta guardada.'); this.cargar(); },
      error: () => { this.toast('❌ No se pudo guardar.', true); this.cargar(); },
    });
  }

  logroCell = (row: MetaFila) => (row.logro || 0);
  private toast(msg: string, error = false): void {
    this.snack.open(msg, 'OK', { duration: error ? 5000 : 2500, horizontalPosition: 'end', verticalPosition: 'top',
      panelClass: error ? 'toast-error' : 'toast-ok' });
  }
}