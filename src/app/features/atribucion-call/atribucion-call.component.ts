import { Component, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CargaVentasService } from '../../services/carga-ventas.service';
import { ASESORES_CALL, nombreCorto } from '../../shared/asesores';

/**
 * Atribución de Ventas Call (AsesorVenta). Reemplaza el VLOOKUP del Excel:
 * cruza en la BD las ventas_call con la última gestión de DERIVACIÓN del DNI
 * (≤31 días) y les pone el código CC del asesor. Lo que no cruza (sin derivación)
 * se busca por DNI y se asigna a mano (queda protegido del cruce automático).
 */
@Component({
  selector: 'app-atribucion-call',
  standalone: true,
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './atribucion-call.component.html',
  styleUrl: './atribucion-call.component.css',
})
export class AtribucionCallComponent {
  private svc = inject(CargaVentasService);
  private snack = inject(MatSnackBar);

  readonly meses = [
    { v: 0, t: 'Todos los meses' }, { v: 1, t: 'Enero' }, { v: 2, t: 'Febrero' }, { v: 3, t: 'Marzo' },
    { v: 4, t: 'Abril' }, { v: 5, t: 'Mayo' }, { v: 6, t: 'Junio' }, { v: 7, t: 'Julio' }, { v: 8, t: 'Agosto' },
    { v: 9, t: 'Septiembre' }, { v: 10, t: 'Octubre' }, { v: 11, t: 'Noviembre' }, { v: 12, t: 'Diciembre' },
  ];
  anio = new Date().getFullYear();
  mes: number = new Date().getMonth() + 1;
  cruzando = false;
  resultado: { actualizados: number; sinDerivacion: number } | null = null;

  dni = '';
  buscando = false;
  ventas: any[] = [];
  yaBusco = false;

  readonly ccOpciones = ASESORES_CALL.map(a => ({ cc: a.value, label: `${a.value} · ${nombreCorto(a.nombre)}` }));

  cruzar(): void {
    this.cruzando = true; this.resultado = null;
    this.svc.cruzarDerivacionCall(this.anio || undefined, this.mes || undefined).subscribe({
      next: r => {
        this.cruzando = false; this.resultado = r;
        this.toast(`✔ Atribuidas ${r.actualizados} · ${r.sinDerivacion} sin derivación (revisar a mano).`);
      },
      error: () => { this.cruzando = false; this.toast('❌ No se pudo cruzar (revisa el servidor).', true); },
    });
  }

  buscar(): void {
    const d = (this.dni || '').replace(/\D/g, '');
    if (!d) { this.toast('Ingresa un DNI.', true); return; }
    this.buscando = true; this.yaBusco = true;
    this.svc.buscarVentaCall(d).subscribe({
      next: rows => { this.ventas = (rows || []).map(r => ({ ...r, _nuevo: '' })); this.buscando = false; },
      error: () => { this.buscando = false; this.ventas = []; this.toast('❌ Error en la búsqueda.', true); },
    });
  }

  usarSugerido(v: any): void { if (v.cc_sugerido) v._nuevo = v.cc_sugerido; }

  guardar(v: any): void {
    const cc = (v._nuevo || '').trim();
    if (!cc) { this.toast('Selecciona un asesor (CC).', true); return; }
    this.svc.setVendedorVentaCall(v.codigo_cv, cc).subscribe({
      next: () => { v.vendedor = cc; v.asesor_manual = true; v._nuevo = ''; this.toast('✔ AsesorVenta actualizado.'); },
      error: () => this.toast('❌ No se pudo guardar.', true),
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
