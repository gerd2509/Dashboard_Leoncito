import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../services/auth.service';
import {
  AulaService, AulaCurso, AulaLeccion, AulaPregunta, AulaProgresoResumen,
  AulaExamenResultado, AulaRankingFila, AulaInsignia,
} from '../../services/aula.service';
import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';

type Vista = 'cursos' | 'lecciones' | 'leccion' | 'examen' | 'resultado' | 'ranking' | 'certificado';

@Component({
  selector: 'app-aula-virtual',
  standalone: true,
  imports: [CommonModule, MatIconModule, LoadingOverlayComponent],
  templateUrl: './aula-virtual.component.html',
  styleUrls: ['./aula-virtual.component.css'],
})
export class AulaVirtualComponent implements OnInit {
  private auth = inject(AuthService);
  private aula = inject(AulaService);
  private sanitizer = inject(DomSanitizer);

  vendedor = '';
  canal = '';
  cargando = false;
  error = '';
  vista: Vista = 'cursos';

  cursos: AulaCurso[] = [];
  cursoSel: AulaCurso | null = null;
  lecciones: AulaLeccion[] = [];
  leccionSel: AulaLeccion | null = null;
  pdfUrl: SafeResourceUrl | null = null;

  preguntas: AulaPregunta[] = [];
  respuestas = new Map<number, number>();
  resultado: AulaExamenResultado | null = null;

  progreso: AulaProgresoResumen | null = null;
  ranking: AulaRankingFila[] = [];

  celebrando: AulaInsignia[] = [];
  confetis: { id: number; left: number; delay: number; emoji: string }[] = [];

  ngOnInit(): void {
    const u = this.auth.getUsuario();
    this.vendedor = (u?.vendedor || u?.nombre || '').toString().trim();
    this.canal = (u?.canal || '').toString().toLowerCase();
    if (!this.vendedor) { this.error = 'No se encontró tu usuario de vendedor.'; return; }
    this.cargarTodo();
  }

  private cargarTodo(): void {
    this.cargando = true;
    this.aula.miProgreso(this.vendedor).subscribe({ next: (p) => (this.progreso = p), error: () => {} });
    this.aula.obtenerCursos(this.canal || 'todos', this.vendedor).subscribe({
      next: (c) => { this.cursos = c; this.cargando = false; },
      error: () => { this.error = 'No se pudieron cargar los cursos.'; this.cargando = false; },
    });
  }

  // ── Navegación ──
  abrirCurso(c: AulaCurso): void {
    this.cursoSel = c; this.vista = 'lecciones'; this.cargando = true;
    this.aula.obtenerLecciones(c.id, this.vendedor).subscribe({
      next: (l) => { this.lecciones = l; this.cargando = false; },
      error: () => { this.error = 'No se pudieron cargar las lecciones.'; this.cargando = false; },
    });
  }

  abrirLeccion(l: AulaLeccion): void {
    this.cargando = true;
    this.aula.obtenerLeccion(l.id).subscribe({
      next: (det) => {
        this.leccionSel = { ...l, ...det };
        this.pdfUrl = det.url ? this.sanitizer.bypassSecurityTrustResourceUrl(det.url) : null;
        this.vista = 'leccion'; this.cargando = false;
      },
      error: () => { this.error = 'No se pudo abrir la lección.'; this.cargando = false; },
    });
  }

  marcarVisto(): void {
    if (!this.leccionSel) return;
    this.aula.marcarVisto(this.leccionSel.id, this.vendedor).subscribe({
      next: (r) => {
        if (this.leccionSel) this.leccionSel.visto = true;
        this.refrescarProgreso();
        this.celebrarInsignias(r.nuevasInsignias);
        if (this.leccionSel?.tiene_examen) this.iniciarExamen();
        else this.volverALecciones();
      },
      error: () => {},
    });
  }

  iniciarExamen(): void {
    if (!this.leccionSel) return;
    this.cargando = true;
    this.respuestas.clear();
    this.aula.obtenerExamen(this.leccionSel.id).subscribe({
      next: (p) => { this.preguntas = p; this.vista = 'examen'; this.cargando = false; },
      error: () => { this.error = 'No se pudo cargar el examen.'; this.cargando = false; },
    });
  }

  elegirRespuesta(preguntaId: number, opcion: number): void { this.respuestas.set(preguntaId, opcion); }

  get examenCompleto(): boolean { return this.preguntas.length > 0 && this.respuestas.size === this.preguntas.length; }

  enviarExamen(): void {
    if (!this.leccionSel || !this.examenCompleto) return;
    this.cargando = true;
    const respuestas = [...this.respuestas.entries()].map(([pregunta_id, opcion]) => ({ pregunta_id, opcion }));
    this.aula.enviarExamen(this.leccionSel.id, this.vendedor, respuestas).subscribe({
      next: (res) => {
        this.resultado = res; this.vista = 'resultado'; this.cargando = false;
        this.refrescarProgreso();
        this.celebrarInsignias(res.nuevasInsignias);
        if (this.leccionSel) { this.leccionSel.aprobado = this.leccionSel.aprobado || res.aprobado; this.leccionSel.mejor_puntaje = Math.max(this.leccionSel.mejor_puntaje || 0, res.puntaje); }
      },
      error: () => { this.error = 'No se pudo calificar el examen.'; this.cargando = false; },
    });
  }

  reintentarExamen(): void { this.iniciarExamen(); }

  volverALecciones(): void {
    this.vista = 'lecciones'; this.leccionSel = null; this.pdfUrl = null; this.resultado = null; this.preguntas = [];
    if (this.cursoSel) this.abrirCurso(this.cursoSel);
  }
  volverACursos(): void {
    this.vista = 'cursos'; this.cursoSel = null; this.lecciones = [];
    this.cargarTodo();
  }
  verRanking(): void {
    this.vista = 'ranking'; this.cargando = true;
    this.aula.ranking().subscribe({ next: (r) => { this.ranking = r; this.cargando = false; }, error: () => (this.cargando = false) });
  }
  verCertificado(c: AulaCurso): void { this.cursoSel = c; this.vista = 'certificado'; }
  imprimirCertificado(): void { window.print(); }

  private refrescarProgreso(): void {
    this.aula.miProgreso(this.vendedor).subscribe({ next: (p) => (this.progreso = p), error: () => {} });
  }

  // ── Celebración de insignias nuevas (confeti CSS, sin librerías) ──
  private celebrarInsignias(nuevas: AulaInsignia[]): void {
    if (!nuevas?.length) return;
    this.celebrando = nuevas;
    const emojis = ['🎉', '✨', '🎊', '⭐'];
    this.confetis = Array.from({ length: 26 }, (_, i) => ({
      id: i, left: Math.random() * 100, delay: Math.random() * 0.6, emoji: emojis[i % emojis.length],
    }));
    setTimeout(() => { this.celebrando = []; this.confetis = []; }, 4200);
  }
  cerrarCelebracion(): void { this.celebrando = []; this.confetis = []; }

  get fechaHoy(): string {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }
  claseNota(p: number): string { return p >= 70 ? 'ok' : p >= 50 ? 'warn' : 'bad'; }

  tieneInsignia(codigo: string): boolean {
    return !!this.progreso?.insignias.some((x) => x.codigo === codigo);
  }
}
