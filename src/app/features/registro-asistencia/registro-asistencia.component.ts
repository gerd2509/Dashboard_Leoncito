import { Component, OnInit, inject } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { AsistenciaService, MarcaAsistencia } from '../../services/asistencia.service';
import { AuthService } from '../../services/auth.service';

interface ResultadoMarca {
  ok: boolean; sinUbicacion: boolean; titulo: string; detalle: string;
}

/**
 * Registro de Asistencia (piloto, Realzza): un botón que toma la ubicación del
 * navegador y la manda al backend, que la compara contra la ubicación
 * configurada de la tienda (Maestro CAP → Sedes). NUNCA bloquea el registro —
 * si queda fuera del radio esperado, igual se guarda y se marca para revisión
 * (el GPS de navegador no es confiable al 100%, sobre todo en PC/laptop).
 */
@Component({
  selector: 'app-registro-asistencia',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './registro-asistencia.component.html',
  styleUrl: './registro-asistencia.component.css',
})
export class RegistroAsistenciaComponent implements OnInit {
  private srv = inject(AsistenciaService);
  protected auth = inject(AuthService);

  marcando = false;
  resultado: ResultadoMarca | null = null;
  errorGeo = '';

  get puedeVerListado(): boolean {
    const rol = (this.auth.getUsuario()?.rol || '').toLowerCase();
    return rol === 'admin' || rol === 'gerente' || rol === 'supervisor';
  }

  ngOnInit(): void {
    if (this.puedeVerListado) this.cargarListado();
  }

  marcarAsistencia(): void {
    this.resultado = null;
    this.errorGeo = '';
    if (!('geolocation' in navigator)) {
      this.errorGeo = 'Tu navegador no soporta geolocalización.';
      return;
    }
    this.marcando = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        this.srv.marcar(latitude, longitude, accuracy).subscribe({
          next: (r) => {
            this.marcando = false;
            if (r.sinUbicacionConfigurada) {
              this.resultado = {
                ok: true, sinUbicacion: true, titulo: 'Asistencia registrada',
                detalle: 'Tu tienda todavía no tiene una ubicación configurada, así que no se validó la distancia — igual quedó guardada.',
              };
            } else if (r.dentroRango) {
              this.resultado = {
                ok: true, sinUbicacion: false, titulo: '¡Asistencia registrada!',
                detalle: `Estás a ${r.distanciaMetros} m de ${r.sede}.`,
              };
            } else {
              this.resultado = {
                ok: false, sinUbicacion: false, titulo: 'Registrada, pero fuera de ubicación',
                detalle: `Estás a ${r.distanciaMetros} m de ${r.sede}. Quedó marcada para revisión.`,
              };
            }
            if (this.puedeVerListado) this.cargarListado();
          },
          error: () => { this.marcando = false; this.errorGeo = 'No se pudo registrar tu asistencia. Intenta de nuevo.'; },
        });
      },
      (err) => {
        this.marcando = false;
        this.errorGeo = err.code === err.PERMISSION_DENIED
          ? 'Debes permitir el acceso a tu ubicación para marcar asistencia.'
          : 'No se pudo obtener tu ubicación (GPS/conexión). Intenta de nuevo.';
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  // ── Listado de revisión (admin/gerente/supervisor) ──
  cargandoListado = false;
  filas: MarcaAsistencia[] = [];
  form: UntypedFormGroup;

  constructor(private fb: UntypedFormBuilder) {
    const hoy = new Date();
    this.form = this.fb.group({ desde: [hoy], hasta: [hoy] });
  }

  cargarListado(): void {
    this.cargandoListado = true;
    const desde = this.ymd(this.form.value.desde), hasta = this.ymd(this.form.value.hasta);
    this.srv.listar(desde, hasta).subscribe({
      next: (rows) => { this.filas = rows; this.cargandoListado = false; },
      error: () => { this.cargandoListado = false; },
    });
  }
  private ymd(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  estadoClase(f: MarcaAsistencia): string {
    if (f.dentro_rango === null) return 'sin-config';
    return f.dentro_rango ? 'ok' : 'fuera';
  }
  estadoTexto(f: MarcaAsistencia): string {
    if (f.dentro_rango === null) return 'Sin ubicación configurada';
    return f.dentro_rango ? 'Dentro de rango' : 'Fuera de rango';
  }
}
