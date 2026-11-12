import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Ícono de leoncito en SVG, coloreable por marca.
 *  - variant 'leoncito' → león dorado
 *  - variant 'realzza'  → león blanco / albino
 *  - mood 'neutral' (por defecto, igual que antes) / 'feliz' (celebrando, meta
 *    cumplida) / 'alerta' (preocupado, falta gestión) — solo cambia el rostro,
 *    la animación la pone quien lo use (ver Mi Panel).
 * Se dimensiona con el `font-size` del contenedor (usa 1em).
 */
@Component({
  selector: 'app-lion-icon',
  standalone: true,
  imports: [CommonModule],
  styles: [`
    :host { display: inline-block; line-height: 1; }
    .lion-svg { width: 1em; height: 1em; display: block; overflow: visible; }
  `],
  template: `
    <svg class="lion-svg" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <!-- MELENA -->
      <g [attr.fill]="mane">
        <circle cx="50"   cy="29"   r="9"/>
        <circle cx="47.6" cy="38"   r="9"/>
        <circle cx="41"   cy="44.6" r="9"/>
        <circle cx="32"   cy="47"   r="9"/>
        <circle cx="23"   cy="44.6" r="9"/>
        <circle cx="16.4" cy="38"   r="9"/>
        <circle cx="14"   cy="29"   r="9"/>
        <circle cx="16.4" cy="20"   r="9"/>
        <circle cx="23"   cy="13.4" r="9"/>
        <circle cx="32"   cy="11"   r="9"/>
        <circle cx="41"   cy="13.4" r="9"/>
        <circle cx="47.6" cy="20"   r="9"/>
      </g>

      <!-- OREJAS -->
      <circle [attr.fill]="mane" cx="21" cy="16" r="6"/>
      <circle [attr.fill]="mane" cx="43" cy="16" r="6"/>
      <circle [attr.fill]="detail" cx="21" cy="16" r="2.6" opacity="0.45"/>
      <circle [attr.fill]="detail" cx="43" cy="16" r="2.6" opacity="0.45"/>

      <!-- ROSTRO -->
      <circle [attr.fill]="face" cx="32" cy="30" r="15.5"/>

      <!-- OJOS -->
      <circle [attr.fill]="detail" cx="26" cy="28" r="2.7"/>
      <circle [attr.fill]="detail" cx="38" cy="28" r="2.7"/>

      <!-- NARIZ -->
      <path [attr.fill]="detail" d="M32 39 l-4.2 -4.2 q4.2 -2.4 8.4 0 z"/>

      <!-- HOCICO: sonrisa normal (por defecto, idéntico al diseño original) -->
      <path *ngIf="mood !== 'feliz' && mood !== 'alerta'" [attr.stroke]="detail" fill="none"
            stroke-width="1.8" stroke-linecap="round"
            d="M32 39 v3.2 M32 42.2 q-4 3.4 -8 1 M32 42.2 q4 3.4 8 1"/>

      <!-- HOCICO: sonrisa grande (meta cumplida) -->
      <path *ngIf="mood === 'feliz'" [attr.fill]="detail" opacity="0.92"
            d="M23.5 42.5 q8.5 8 17 0 q-1.5 6.5 -8.5 6.5 q-7 0 -8.5 -6.5 z"/>

      <!-- HOCICO + CEJAS: preocupado (falta gestión) -->
      <ng-container *ngIf="mood === 'alerta'">
        <path [attr.stroke]="detail" fill="none" stroke-width="1.8" stroke-linecap="round"
              d="M25.5 44 q6.5 -3.6 13 0"/>
        <path [attr.stroke]="detail" fill="none" stroke-width="1.6" stroke-linecap="round"
              d="M21.5 23.6 q4.4 -2.6 8 -.6 M34.5 23 q3.6 -2 8 .6"/>
      </ng-container>
    </svg>
  `
})
export class LionIconComponent {
  @Input() variant: 'leoncito' | 'realzza' = 'leoncito';
  @Input() mood: 'neutral' | 'feliz' | 'alerta' = 'neutral';

  get mane(): string   { return this.variant === 'realzza' ? '#FFFFFF' : '#F2A22C'; }
  get face(): string   { return this.variant === 'realzza' ? '#EAF1FF' : '#FFD27A'; }
  get detail(): string { return this.variant === 'realzza' ? '#3F5C7C' : '#5E2F0C'; }
}
