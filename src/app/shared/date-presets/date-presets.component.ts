import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';

/**
 * Selector de rango rápido COMPACTO (un solo botón con menú) reutilizable en los
 * dashboards de ventas. Emite el rango elegido por (rango)="..."; cada dashboard
 * lo aplica a su formulario de fechas y recarga. No conoce el formato de cada form.
 */
@Component({
  selector: 'app-date-presets',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatMenuModule, MatIconModule],
  template: `
    <button type="button" mat-stroked-button class="dp-trigger" [matMenuTriggerFor]="menu"
            [class.activo]="!!activoKey" title="Rango rápido de fechas">
      <mat-icon>event</mat-icon>
      <span class="dp-lbl">{{ activoLabel || 'Rango' }}</span>
      <mat-icon class="dp-caret">arrow_drop_down</mat-icon>
    </button>
    <mat-menu #menu="matMenu" class="dp-menu">
      <button mat-menu-item *ngFor="let p of presets" (click)="elegir(p.key, p.label)">
        <mat-icon *ngIf="activoKey === p.key" class="dp-check">check</mat-icon>
        <span [style.margin-left.px]="activoKey === p.key ? 0 : 26">{{ p.label }}</span>
      </button>
    </mat-menu>
  `,
  styles: [`
    .dp-trigger {
      display: inline-flex; align-items: center; gap: 4px; height: 38px;
      border-radius: 8px; padding: 0 10px; font-weight: 600; font-size: 13px;
      color: #24557f; border-color: #cddcec;
    }
    .dp-trigger.activo { color: #fff; background: #1A5FAD; border-color: #1A5FAD; }
    .dp-trigger .mat-icon { font-size: 19px; width: 19px; height: 19px; }
    .dp-trigger .dp-caret { margin-left: -2px; }
    .dp-trigger .dp-lbl { white-space: nowrap; }
    .dp-check { color: #1A5FAD; }
  `],
})
export class DatePresetsComponent {
  @Output() rango = new EventEmitter<{ desde: Date; hasta: Date }>();

  activoKey = '';
  activoLabel = '';
  presets = [
    { key: 'hoy', label: 'Hoy' },
    { key: 'semana', label: 'Esta semana' },
    { key: 'mes', label: 'Este mes' },
    { key: 'mesAnterior', label: 'Mes anterior' },
  ];

  elegir(key: string, label: string): void {
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

    this.activoKey = key;
    this.activoLabel = label;
    this.rango.emit({ desde, hasta });
  }
}
