import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

/**
 * Overlay de carga animado, reutilizable (p. ej. al importar Excel).
 * Las animaciones son por transform/opacity → siguen corriendo aunque el hilo
 * principal esté bloqueado procesando el archivo.
 */
@Component({
  selector: 'app-loading-overlay',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="lo-back" *ngIf="visible">
      <div class="lo-card">
        <div class="lo-stage">
          <span class="lo-ring"></span>
          <span class="lo-ring lo-ring2"></span>
          <span class="lo-core"><mat-icon>{{ icon }}</mat-icon></span>
        </div>
        <div class="lo-msg">{{ mensaje }}</div>
        <div class="lo-sub">{{ submensaje }}</div>
        <div class="lo-dots"><span></span><span></span><span></span></div>
      </div>
    </div>
  `,
  styles: [`
    .lo-back {
      position: fixed; inset: 0; z-index: 9000;
      display: flex; align-items: center; justify-content: center;
      background: rgba(14, 27, 51, .55); backdrop-filter: blur(3px);
      animation: lo-fade .2s ease both;
    }
    @keyframes lo-fade { from { opacity: 0; } to { opacity: 1; } }
    .lo-card {
      display: flex; flex-direction: column; align-items: center; gap: 12px;
      background: #fff; border-radius: 18px; padding: 30px 40px;
      box-shadow: 0 20px 60px rgba(10, 25, 50, .4);
      animation: lo-pop .28s cubic-bezier(.22,1.2,.36,1) both;
    }
    @keyframes lo-pop { from { transform: scale(.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    .lo-stage { position: relative; width: 76px; height: 76px; display: grid; place-items: center; }
    .lo-ring {
      position: absolute; inset: 0; border-radius: 50%;
      border: 3px solid #e3edf7; border-top-color: #1A5FAD;
      animation: lo-spin .9s linear infinite;
    }
    .lo-ring2 {
      inset: 9px; border-width: 3px; border-top-color: #F07420;
      animation: lo-spin 1.3s linear infinite reverse;
    }
    @keyframes lo-spin { to { transform: rotate(360deg); } }
    .lo-core {
      display: grid; place-items: center; width: 40px; height: 40px;
      animation: lo-beat 1.1s ease-in-out infinite;
    }
    .lo-core mat-icon { font-size: 26px; width: 26px; height: 26px; color: #1A5FAD; }
    @keyframes lo-beat { 0%,100% { transform: scale(1); } 50% { transform: scale(1.14); } }
    .lo-msg { font-weight: 800; font-size: 15px; color: #1E3A5F; }
    .lo-sub { font-size: 12.5px; color: #7d93a8; font-weight: 500; margin-top: -4px; }
    .lo-dots { display: flex; gap: 6px; margin-top: 2px; }
    .lo-dots span {
      width: 8px; height: 8px; border-radius: 50%; background: #1A5FAD;
      animation: lo-bounce 1s ease-in-out infinite;
    }
    .lo-dots span:nth-child(2) { animation-delay: .15s; background: #3d7fc0; }
    .lo-dots span:nth-child(3) { animation-delay: .3s; background: #F07420; }
    @keyframes lo-bounce { 0%,100% { transform: translateY(0); opacity: .5; } 50% { transform: translateY(-7px); opacity: 1; } }
  `],
})
export class LoadingOverlayComponent {
  @Input() visible = false;
  @Input() mensaje = 'Procesando…';
  @Input() submensaje = 'Esto puede tardar unos segundos';
  @Input() icon = 'description';
}
