import { Component, OnInit, OnDestroy, inject, HostListener, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';

interface ItemMeta { k: string; nombre: string; actual: number; meta: number; falta: number; esperado: number; }
interface BasePend { cartera: string; faltan: number; dias_sin: number; }
interface Recordatorio {
  id: number; titulo: string; mensaje: string; origen: 'manual' | 'auto'; creado_en: string;
  detalle: { items?: ItemMeta[]; bases?: BasePend[]; nota?: string; hora?: string };
}

/**
 * Recordatorio de Pulso comercial: aparece en grande, encima de cualquier pantalla,
 * cuando el administrador (o el horario automático) le envía al asesor lo que le falta
 * para su meta del día. Solo para asesores de Realzza (Chiclayo, Piura y Lima).
 * Llega EN VIVO: el panel deja abierta una conexión (/recordatorios/stream) y la API le
 * empuja el recordatorio en ~3 s. Si la conexión se cae, se reconecta sola; además,
 * cada 5 min y al volver a la pestaña se consulta por si acaso.
 */
@Component({
  selector: 'app-recordatorio-pulso',
  standalone: true,
  imports: [CommonModule],
  template: `
  @if (actual; as r) {
    <div class="rp-fondo" role="presentation">
      <section class="rp-card" role="alertdialog" aria-modal="true" aria-labelledby="rp-tit" aria-describedby="rp-msg">
        <div class="rp-cabecera">
          <img class="rp-leon" src="/img/realzza-cub-head.webp" alt="">
          <div>
            <span class="rp-de">{{ r.origen === 'auto' ? 'Recordatorio automático' : 'Recordatorio de tu jefe' }} · {{ r.detalle.hora || horaDe(r.creado_en) }}</span>
            <h2 id="rp-tit">{{ r.titulo }}</h2>
          </div>
        </div>

        @if (r.detalle.nota) { <p class="rp-nota">“{{ r.detalle.nota }}”</p> }

        @if (r.detalle.items?.length) {
          <div class="rp-metas" id="rp-msg">
            @for (i of r.detalle.items; track i.k) {
              <div class="rp-meta" [class.ok]="i.falta === 0">
                <span class="rp-k">{{ i.nombre }}</span>
                <b>{{ i.actual }}<small>/{{ i.meta }}</small></b>
                <span class="rp-falta">{{ i.falta === 0 ? 'Cumplido' : 'Faltan ' + i.falta }}</span>
                <span class="rp-barra"><i [style.width.%]="pct(i)"></i></span>
              </div>
            }
          </div>
        } @else {
          <p id="rp-msg" class="rp-msg">{{ r.mensaje }}</p>
        }

        @if (r.detalle.bases?.length) {
          <ul class="rp-bases">
            @for (b of r.detalle.bases; track b.cartera) {
              <li><b>{{ b.cartera }}</b>: llevas {{ b.dias_sin }} días sin llamar a tu base · te faltan {{ b.faltan }} clientes</li>
            }
          </ul>
        }

        <button type="button" class="rp-ok" (click)="entendido(r)" [disabled]="enviando">Entendido, ¡a darle!</button>
        @if (cola.length > 1) { <span class="rp-mas">Tienes {{ cola.length - 1 }} recordatorio(s) más</span> }
      </section>
    </div>
  }`,
  styles: [`
    .rp-fondo { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; padding: 16px;
      background: rgba(7, 14, 32, .72); backdrop-filter: blur(4px); animation: rpFade .25s ease both; }
    .rp-card { width: min(560px, 100%); max-height: calc(100vh - 32px); overflow: auto; border-radius: 26px; padding: 24px;
      background: linear-gradient(160deg, #10295C 0%, #0B1A3A 70%); color: #fff; box-shadow: 0 30px 80px rgba(0,0,0,.45);
      font-family: 'Archivo', system-ui, sans-serif; animation: rpEntra .45s cubic-bezier(.2,1.3,.4,1) both; }
    .rp-cabecera { display: flex; gap: 16px; align-items: center; }
    .rp-leon { width: 92px; height: auto; flex: none; filter: drop-shadow(0 8px 14px rgba(0,0,0,.4)); animation: rpLeon 2.4s ease-in-out infinite; transform-origin: 50% 90%; }
    .rp-de { font-size: 13px; color: #B8C8E6; }
    .rp-card h2 { margin: 4px 0 0; font-size: 26px; line-height: 1.15; font-weight: 800; letter-spacing: -.01em; }
    .rp-nota { margin: 16px 0 0; padding: 12px 14px; border-radius: 14px; background: rgba(255, 211, 77, .14); border-left: 4px solid #FFD34D; font-size: 17px; line-height: 1.4; }
    .rp-msg { margin: 16px 0 0; font-size: 17px; line-height: 1.45; color: #DCE6F7; }
    .rp-metas { display: grid; grid-template-columns: repeat(auto-fit, minmax(118px, 1fr)); gap: 10px; margin-top: 18px; }
    .rp-meta { background: rgba(255,255,255,.08); border-radius: 16px; padding: 12px; display: flex; flex-direction: column; gap: 2px; }
    .rp-meta .rp-k { font-size: 13px; color: #B8C8E6; }
    .rp-meta b { font-size: 40px; line-height: 1; font-weight: 800; }
    .rp-meta b small { font-size: 18px; color: #B8C8E6; font-weight: 600; }
    .rp-falta { font-size: 14px; font-weight: 700; color: #FFD34D; }
    .rp-meta.ok .rp-falta { color: #3DDC97; }
    .rp-barra { height: 6px; border-radius: 3px; background: rgba(255,255,255,.15); margin-top: 6px; overflow: hidden; }
    .rp-barra i { display: block; height: 100%; background: #FFD34D; border-radius: 3px; }
    .rp-meta.ok .rp-barra i { background: #3DDC97; }
    .rp-bases { margin: 16px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
    .rp-bases li { padding: 10px 12px; border-radius: 12px; background: rgba(214, 69, 69, .22); font-size: 15px; line-height: 1.4; }
    .rp-ok { margin-top: 20px; width: 100%; min-height: 54px; border: 0; border-radius: 16px; background: #FFD34D; color: #0B1A3A;
      font-size: 18px; font-weight: 800; cursor: pointer; }
    .rp-ok:focus-visible { outline: 3px solid #5AB6F2; outline-offset: 3px; }
    .rp-mas { display: block; text-align: center; margin-top: 10px; font-size: 13px; color: #B8C8E6; }
    @keyframes rpFade { from { opacity: 0; } }
    @keyframes rpEntra { from { opacity: 0; transform: translateY(30px) scale(.94); } }
    @keyframes rpLeon { 0%,100% { transform: rotate(-4deg); } 50% { transform: rotate(5deg) translateY(-3px); } }
    @media (prefers-reduced-motion: reduce) { .rp-fondo, .rp-card, .rp-leon { animation: none; } }
  `],
})
export class RecordatorioPulsoComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);
  private timer: any = null;
  private abort: AbortController | null = null;
  private conectado = false;
  private reintento: any = null;
  private esperaMs = 3000;
  private activo = true;
  private vistos = new Set<number>();
  cola: Recordatorio[] = [];
  enviando = false;

  get actual(): Recordatorio | null { return this.cola[0] || null; }

  /** Solo asesores de Realzza (Chiclayo, Piura, Lima). */
  private get aplica(): boolean {
    const u = this.auth.getUsuario();
    if (!u?.vendedor) return false;
    return (u.canal || '').toLowerCase() === 'realzza' || (u.sede || '').toLowerCase().startsWith('realzza');
  }

  ngOnInit(): void {
    if (typeof document === 'undefined' || !this.aplica) return;
    setTimeout(() => { this.consultar(); this.conectar(); }, 2500);
    // Respaldo por si la conexión en vivo se cayó sin avisar
    this.timer = setInterval(() => { if (document.visibilityState === 'visible') this.consultar(); }, 5 * 60_000);
  }
  ngOnDestroy(): void {
    this.activo = false;
    if (this.timer) clearInterval(this.timer);
    if (this.reintento) clearTimeout(this.reintento);
    this.abort?.abort();
  }

  @HostListener('document:visibilitychange')
  alVolver(): void {
    if (document.visibilityState !== 'visible' || !this.aplica) return;
    this.consultar();
    if (!this.conectado) this.conectar();
  }

  /** Conexión en vivo: lee el flujo text/event-stream con fetch (lleva el token en la cabecera). */
  private async conectar(): Promise<void> {
    const token = this.auth.getToken();
    if (!this.activo || this.conectado || !token || typeof fetch === 'undefined' || typeof TextDecoder === 'undefined') return;
    this.conectado = true;
    this.abort = new AbortController();
    let cortePorSesion = false;
    try {
      const res = await fetch(`${environment.gestionBase}/recordatorios/stream`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        signal: this.abort.signal, cache: 'no-store',
      });
      if (res.status === 401 || res.status === 400) { cortePorSesion = true; return; }
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      this.esperaMs = 3000;
      const lector = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        let i: number;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          this.procesarEvento(buf.slice(0, i));
          buf = buf.slice(i + 2);
        }
      }
    } catch { /* sin red o se cerró: se reintenta abajo */ }
    finally {
      this.conectado = false;
      if (this.activo && !cortePorSesion && this.auth.isLoggedIn()) {
        this.reintento = setTimeout(() => this.conectar(), this.esperaMs);
        this.esperaMs = Math.min(this.esperaMs * 2, 60_000);
      }
    }
  }

  private procesarEvento(bloque: string): void {
    let evento = 'message';
    const datos: string[] = [];
    for (const linea of bloque.split('\n')) {
      if (linea.startsWith('event:')) evento = linea.slice(6).trim();
      else if (linea.startsWith('data:')) datos.push(linea.slice(5).trimStart());
    }
    if (evento !== 'recordatorio' || !datos.length) return;
    try { this.zone.run(() => this.agregar([JSON.parse(datos.join('\n'))])); } catch { /* evento mal formado */ }
  }

  private agregar(lista: Recordatorio[]): void {
    const nuevos = (lista || []).filter((x) => x && !this.vistos.has(x.id) && !this.cola.some((c) => c.id === x.id));
    if (!nuevos.length) return;
    this.cola = [...this.cola, ...nuevos];
    this.sonar();
    this.cdr.markForCheck();
  }

  private consultar(): void {
    if (!this.auth.isLoggedIn()) return;
    this.http.get<{ data: Recordatorio[] }>(`${environment.gestionBase}/recordatorios/mios`).subscribe({
      next: (r) => this.agregar(r?.data || []),
      error: () => { /* sin conexión: se reintenta en la próxima vuelta */ },
    });
  }

  entendido(r: Recordatorio): void {
    this.enviando = true;
    this.vistos.add(r.id);
    this.http.post(`${environment.gestionBase}/recordatorios/${r.id}/visto`, {}).subscribe({
      next: () => this.cerrar(r), error: () => this.cerrar(r),
    });
  }
  private cerrar(r: Recordatorio): void {
    this.cola = this.cola.filter((c) => c.id !== r.id);
    this.enviando = false;
  }

  pct(i: ItemMeta): number { return Math.min(100, Math.round((i.actual / Math.max(i.meta, 1)) * 100)); }
  horaDe(iso: string): string {
    try { return new Date(iso).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: 'numeric', minute: '2-digit' }); } catch { return ''; }
  }

  /** Dos tonos cortos para llamar la atención (si el navegador lo permite). */
  private sonar(): void {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      [[660, 0], [880, 0.18]].forEach(([f, t]) => {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.frequency.value = f; o.type = 'sine';
        g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
        g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.16);
        o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.18);
      });
      setTimeout(() => ctx.close(), 800);
    } catch { /* sin audio */ }
  }
}
