import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AulaCurso {
  id: number; titulo: string; descripcion: string; canal: string; icono: string; color: string;
  orden: number; activo: boolean; lecciones?: number;
  total_lecciones?: number; lecciones_completadas?: number; pct?: number;
}
export interface AulaLeccion {
  id: number; curso_id?: number; titulo: string; tipo: string; orden: number; xp: number;
  activo?: boolean; archivo_path?: string; archivo_nombre?: string; url?: string;
  visto?: boolean; aprobado?: boolean; mejor_puntaje?: number; intentos?: number; tiene_examen?: boolean;
  preguntas?: number; preguntas_aprobadas?: number;
}
export interface AulaPregunta {
  id: number; leccion_id?: number; pregunta: string; opciones: string[];
  respuesta_correcta?: number; explicacion?: string; aprobada?: boolean; origen?: string; orden?: number;
}
export interface AulaInsignia { codigo: string; nombre: string; descripcion: string; icono: string; fecha?: string; }
export interface AulaProgresoResumen {
  xp: number; nivel: number; xpParaSiguienteNivel: number; racha: number; leccionesAprobadas: number;
  insignias: AulaInsignia[]; insigniasTodas: AulaInsignia[];
}
export interface AulaExamenResultado {
  puntaje: number; correctas: number; total: number; aprobado: boolean; xpGanado: number;
  nuevasInsignias: AulaInsignia[];
  detalle: { pregunta_id: number; marcada: number; correcta: number; explicacion: string; acerto: boolean }[];
}
export interface AulaRankingFila { vendedor: string; xp: number; lecciones: number; puesto: number; nivel: number; }
export interface AulaProgresoVendedor {
  vendedor: string; vistas: number; aprobadas: number; con_intento: number; promedio: number;
  intentos: number; xp: number; nivel: number; ultima_actividad: string | null; total_lecciones: number;
}
export interface AulaProgresoDetalleFila {
  curso: string; leccion: string; xp: number; visto: boolean; fecha_visto: string | null;
  intentos: number; mejor_puntaje: number; aprobado: boolean; fecha_aprobado: string | null;
}
export interface AulaProgresoDetalle { detalle: AulaProgresoDetalleFila[]; insignias: AulaInsignia[]; racha: number; }

@Injectable({ providedIn: 'root' })
export class AulaService {
  private http = inject(HttpClient);
  private root = environment.aulaBase;

  // ── Vendedor ──
  obtenerCursos(canal: string, vendedor: string): Observable<AulaCurso[]> {
    return this.http.get<AulaCurso[]>(`${this.root}/cursos`, { params: { canal, vendedor } });
  }
  obtenerLecciones(cursoId: number, vendedor: string): Observable<AulaLeccion[]> {
    return this.http.get<AulaLeccion[]>(`${this.root}/cursos/${cursoId}/lecciones`, { params: { vendedor } });
  }
  obtenerLeccion(id: number): Observable<AulaLeccion> {
    return this.http.get<AulaLeccion>(`${this.root}/lecciones/${id}`);
  }
  marcarVisto(id: number, vendedor: string): Observable<{ success: boolean; nuevasInsignias: AulaInsignia[] }> {
    return this.http.post<any>(`${this.root}/lecciones/${id}/visto`, { vendedor });
  }
  obtenerExamen(id: number): Observable<AulaPregunta[]> {
    return this.http.get<AulaPregunta[]>(`${this.root}/lecciones/${id}/examen`);
  }
  enviarExamen(id: number, vendedor: string, respuestas: { pregunta_id: number; opcion: number }[]): Observable<AulaExamenResultado> {
    return this.http.post<AulaExamenResultado>(`${this.root}/lecciones/${id}/examen`, { vendedor, respuestas });
  }
  miProgreso(vendedor: string): Observable<AulaProgresoResumen> {
    return this.http.get<AulaProgresoResumen>(`${this.root}/mi-progreso`, { params: { vendedor } });
  }
  ranking(): Observable<AulaRankingFila[]> {
    return this.http.get<AulaRankingFila[]>(`${this.root}/ranking`);
  }

  // ── Admin ──
  adminCursos(): Observable<AulaCurso[]> { return this.http.get<AulaCurso[]>(`${this.root}/admin/cursos`); }
  crearCurso(data: Partial<AulaCurso>): Observable<AulaCurso> { return this.http.post<AulaCurso>(`${this.root}/admin/cursos`, data); }
  editarCurso(id: number, data: Partial<AulaCurso>): Observable<AulaCurso> { return this.http.put<AulaCurso>(`${this.root}/admin/cursos/${id}`, data); }
  eliminarCurso(id: number): Observable<any> { return this.http.delete(`${this.root}/admin/cursos/${id}`); }

  adminLecciones(cursoId: number): Observable<AulaLeccion[]> { return this.http.get<AulaLeccion[]>(`${this.root}/admin/cursos/${cursoId}/lecciones`); }
  crearLeccion(fd: FormData): Observable<AulaLeccion> { return this.http.post<AulaLeccion>(`${this.root}/admin/lecciones`, fd); }
  editarLeccion(id: number, fd: FormData): Observable<AulaLeccion> { return this.http.put<AulaLeccion>(`${this.root}/admin/lecciones/${id}`, fd); }
  eliminarLeccion(id: number): Observable<any> { return this.http.delete(`${this.root}/admin/lecciones/${id}`); }

  adminPreguntas(leccionId: number): Observable<AulaPregunta[]> { return this.http.get<AulaPregunta[]>(`${this.root}/admin/lecciones/${leccionId}/preguntas`); }
  crearPregunta(data: Partial<AulaPregunta>): Observable<AulaPregunta> { return this.http.post<AulaPregunta>(`${this.root}/admin/preguntas`, data); }
  editarPregunta(id: number, data: Partial<AulaPregunta>): Observable<AulaPregunta> { return this.http.put<AulaPregunta>(`${this.root}/admin/preguntas/${id}`, data); }
  eliminarPregunta(id: number): Observable<any> { return this.http.delete(`${this.root}/admin/preguntas/${id}`); }

  // ── Admin — progreso del equipo ──
  adminProgreso(): Observable<AulaProgresoVendedor[]> { return this.http.get<AulaProgresoVendedor[]>(`${this.root}/admin/progreso`); }
  adminProgresoVendedor(vendedor: string): Observable<AulaProgresoDetalle> {
    return this.http.get<AulaProgresoDetalle>(`${this.root}/admin/progreso/${encodeURIComponent(vendedor)}`);
  }
}
