import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import {
  AulaService, AulaCurso, AulaLeccion, AulaPregunta, AulaProgresoVendedor, AulaProgresoDetalle,
} from '../../services/aula.service';
import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';

type Vista = 'cursos' | 'lecciones' | 'preguntas' | 'progreso';

const ICONOS = ['school', 'menu_book', 'campaign', 'support_agent', 'storefront', 'trending_up', 'diamond', 'handshake', 'psychology'];
const COLORES = ['#1A5FAD', '#6A1B9A', '#2E7D32', '#E65100', '#00838F', '#AD1457', '#455A64'];

@Component({
  selector: 'app-aula-virtual-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, LoadingOverlayComponent],
  templateUrl: './aula-virtual-admin.component.html',
  styleUrls: ['./aula-virtual-admin.component.css'],
})
export class AulaVirtualAdminComponent implements OnInit {
  private aula = inject(AulaService);
  private snack = inject(MatSnackBar);

  readonly iconos = ICONOS;
  readonly colores = COLORES;
  readonly canales = [{ v: 'todos', t: 'Call + Realzza' }, { v: 'call', t: 'Solo Call' }, { v: 'realzza', t: 'Solo Realzza' }];

  vista: Vista = 'cursos';
  cargando = false;

  cursos: AulaCurso[] = [];
  formCurso: Partial<AulaCurso> | null = null;   // no-null = popup abierto (id presente = editar)

  cursoSel: AulaCurso | null = null;
  lecciones: AulaLeccion[] = [];
  formLeccion: (Partial<AulaLeccion> & { archivo?: File | null }) | null = null;

  leccionSel: AulaLeccion | null = null;
  preguntas: AulaPregunta[] = [];
  formPregunta: Partial<AulaPregunta> | null = null;

  progresoEquipo: AulaProgresoVendedor[] = [];
  vendedorSel: string | null = null;
  progresoDetalle: AulaProgresoDetalle | null = null;
  filtroVendedor = '';

  ngOnInit(): void { this.cargarCursos(); }

  // ── Cursos ──
  cargarCursos(): void {
    this.cargando = true;
    this.aula.adminCursos().subscribe({ next: (c) => { this.cursos = c; this.cargando = false; }, error: () => (this.cargando = false) });
  }
  nuevoCurso(): void { this.formCurso = { titulo: '', descripcion: '', canal: 'todos', icono: ICONOS[0], color: COLORES[0], orden: this.cursos.length }; }
  editarCursoForm(c: AulaCurso): void { this.formCurso = { ...c }; }
  cerrarFormCurso(): void { this.formCurso = null; }
  guardarCurso(): void {
    if (!this.formCurso || !(this.formCurso.titulo || '').trim()) { this.toast('El título es obligatorio.', true); return; }
    const obs = this.formCurso.id ? this.aula.editarCurso(this.formCurso.id, this.formCurso) : this.aula.crearCurso(this.formCurso);
    obs.subscribe({
      next: () => { this.toast('Curso guardado.'); this.formCurso = null; this.cargarCursos(); },
      error: () => this.toast('No se pudo guardar el curso.', true),
    });
  }
  eliminarCurso(c: AulaCurso): void {
    if (!confirm(`¿Eliminar el curso "${c.titulo}" y todas sus lecciones/preguntas?`)) return;
    this.aula.eliminarCurso(c.id).subscribe({ next: () => this.cargarCursos(), error: () => this.toast('No se pudo eliminar.', true) });
  }

  // ── Lecciones ──
  abrirLecciones(c: AulaCurso): void {
    this.cursoSel = c; this.vista = 'lecciones'; this.cargando = true;
    this.aula.adminLecciones(c.id).subscribe({ next: (l) => { this.lecciones = l; this.cargando = false; }, error: () => (this.cargando = false) });
  }
  volverACursos(): void { this.vista = 'cursos'; this.cursoSel = null; this.lecciones = []; this.cargarCursos(); }
  nuevaLeccion(): void { this.formLeccion = { titulo: '', orden: this.lecciones.length, xp: 100, archivo: null }; }
  editarLeccionForm(l: AulaLeccion): void { this.formLeccion = { ...l, archivo: null }; }
  cerrarFormLeccion(): void { this.formLeccion = null; }
  onArchivoLeccion(e: Event): void {
    const f = (e.target as HTMLInputElement).files?.[0] || null;
    if (this.formLeccion) this.formLeccion.archivo = f;
  }
  guardarLeccion(): void {
    if (!this.formLeccion || !(this.formLeccion.titulo || '').trim() || !this.cursoSel) { this.toast('El título es obligatorio.', true); return; }
    const fd = new FormData();
    fd.set('curso_id', String(this.cursoSel.id));
    fd.set('titulo', this.formLeccion.titulo || '');
    fd.set('orden', String(this.formLeccion.orden ?? 0));
    fd.set('xp', String(this.formLeccion.xp ?? 100));
    if (this.formLeccion.archivo) fd.set('archivo', this.formLeccion.archivo);
    const obs = this.formLeccion.id ? this.aula.editarLeccion(this.formLeccion.id, fd) : this.aula.crearLeccion(fd);
    this.cargando = true;
    obs.subscribe({
      next: () => { this.toast('Lección guardada.'); this.formLeccion = null; this.cargando = false; if (this.cursoSel) this.abrirLecciones(this.cursoSel); },
      error: () => { this.toast('No se pudo guardar la lección.', true); this.cargando = false; },
    });
  }
  eliminarLeccion(l: AulaLeccion): void {
    if (!confirm(`¿Eliminar la lección "${l.titulo}"?`)) return;
    this.aula.eliminarLeccion(l.id).subscribe({ next: () => { if (this.cursoSel) this.abrirLecciones(this.cursoSel); }, error: () => this.toast('No se pudo eliminar.', true) });
  }

  // ── Preguntas (generación IA + edición/aprobación) ──
  abrirPreguntas(l: AulaLeccion): void {
    this.leccionSel = l; this.vista = 'preguntas'; this.cargando = true;
    this.aula.adminPreguntas(l.id).subscribe({ next: (p) => { this.preguntas = p; this.cargando = false; }, error: () => (this.cargando = false) });
  }
  volverALecciones(): void { this.vista = 'lecciones'; this.leccionSel = null; this.preguntas = []; if (this.cursoSel) this.abrirLecciones(this.cursoSel); }

  nuevaPreguntaManual(): void { this.formPregunta = { pregunta: '', opciones: ['', '', '', ''], respuesta_correcta: 0, explicacion: '' }; }
  editarPreguntaForm(p: AulaPregunta): void { this.formPregunta = { ...p, opciones: [...p.opciones] }; }
  cerrarFormPregunta(): void { this.formPregunta = null; }
  guardarPregunta(): void {
    if (!this.formPregunta || !this.leccionSel) return;
    const opciones = (this.formPregunta.opciones || []).map((o) => (o || '').trim()).filter(Boolean);
    if (!(this.formPregunta.pregunta || '').trim() || opciones.length < 2) { this.toast('Completa la pregunta y al menos 2 opciones.', true); return; }
    const data = { ...this.formPregunta, opciones, leccion_id: this.leccionSel.id, aprobada: true };
    const obs = this.formPregunta.id ? this.aula.editarPregunta(this.formPregunta.id, data) : this.aula.crearPregunta(data);
    obs.subscribe({
      next: () => { this.toast('Pregunta guardada.'); this.formPregunta = null; if (this.leccionSel) this.abrirPreguntas(this.leccionSel); },
      error: () => this.toast('No se pudo guardar la pregunta.', true),
    });
  }
  aprobar(p: AulaPregunta): void {
    this.aula.editarPregunta(p.id, { aprobada: true }).subscribe({
      next: () => { p.aprobada = true; this.toast('Pregunta aprobada y publicada.'); },
      error: () => this.toast('No se pudo aprobar.', true),
    });
  }
  eliminarPregunta(p: AulaPregunta): void {
    if (!confirm('¿Eliminar esta pregunta?')) return;
    this.aula.eliminarPregunta(p.id).subscribe({ next: () => { this.preguntas = this.preguntas.filter((x) => x.id !== p.id); }, error: () => this.toast('No se pudo eliminar.', true) });
  }

  // ── Progreso del equipo ──
  verProgreso(): void {
    this.vista = 'progreso'; this.vendedorSel = null; this.progresoDetalle = null; this.cargando = true;
    this.aula.adminProgreso().subscribe({ next: (r) => { this.progresoEquipo = r; this.cargando = false; }, error: () => (this.cargando = false) });
  }
  get progresoFiltrado(): AulaProgresoVendedor[] {
    const f = this.filtroVendedor.trim().toLowerCase();
    return f ? this.progresoEquipo.filter((v) => v.vendedor.toLowerCase().includes(f)) : this.progresoEquipo;
  }
  verDetalleVendedor(v: AulaProgresoVendedor): void {
    this.vendedorSel = v.vendedor; this.cargando = true;
    this.aula.adminProgresoVendedor(v.vendedor).subscribe({ next: (d) => { this.progresoDetalle = d; this.cargando = false; }, error: () => (this.cargando = false) });
  }
  cerrarDetalleVendedor(): void { this.vendedorSel = null; this.progresoDetalle = null; }
  fmtFecha(f: string | null): string {
    if (!f) return '—';
    const d = new Date(f);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  private toast(msg: string, error = false): void {
    this.snack.open(msg, 'OK', { duration: error ? 5000 : 3000, horizontalPosition: 'end', verticalPosition: 'top', panelClass: error ? 'toast-error' : 'toast-ok' });
  }
}
