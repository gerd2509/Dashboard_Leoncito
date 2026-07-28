import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Botones de rango rápido reutilizables para los dashboards de ventas.
 * Emite el rango elegido por (rango)="..."; cada dashboard lo aplica a su
 * formulario de fechas y recarga. No conoce el formato de cada form.
 */
@Component({
  selector: 'app-date-presets',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="dp-wrap">
      <button *ngFor="let p of presets" type="button" class="dp-btn"
              [class.activo]="activo === p.key" (click)="elegir(p.key)">{{ p.label }}</button>
    </div>
  `,
  styles: [`
    .dp-wrap { display: inline-flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    .dp-btn {
      border: 1px solid #cddcec; background: #f4f8fc; color: #24557f;
      font-size: 12.5px; font-weight: 600; padding: 6px 12px; border-radius: 999px;
      cursor: pointer; transition: background .15s, border-color .15s, color .15s;
      white-space: nowrap; font-family: inherit;
    }
    .dp-btn:hover { background: #e6f0fb; border-color: #a9c6e4; }
    .dp-btn.activo { background: #1A5FAD; border-color: #1A5FAD; color: #fff; }
  `],
})
export class DatePresetsComponent {
  @Output() rango = new EventEmitter<{ desde: Date; hasta: Date }>();

  activo = '';
  presets = [
    { key: 'hoy', label: 'Hoy' },
    { key: 'semana', label: 'Esta semana' },
    { key: 'mes', label: 'Este mes' },
    { key: 'mesAnterior', label: 'Mes anterior' },
  ];

  elegir(key: string): void {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    let desde = new Date(hoy);
    let hasta = new Date(hoy);

    switch (key) {
      case 'hoy':
        break;
      case 'semana': {
        // Lunes de la semana en curso → hoy.
        const dow = (hoy.getDay() + 6) % 7;   // 0 = lunes
        desde = new Date(hoy); desde.setDate(hoy.getDate() - dow);
        break;
      }
      case 'mes':
        desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        break;
      case 'mesAnterior':
        desde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
        hasta = new Date(hoy.getFullYear(), hoy.getMonth(), 0);   // último día del mes anterior
        break;
    }

    this.activo = key;
    this.rango.emit({ desde, hasta });
  }
}
