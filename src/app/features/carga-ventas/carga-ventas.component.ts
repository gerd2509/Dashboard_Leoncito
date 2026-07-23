import { Component, inject, OnInit } from '@angular/core';
import { HttpEventType } from '@angular/common/http';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { AuthService } from '../../services/auth.service';
import {
  CargaVentasService,
  CargaTipo,
  EstadoVentas,
  ResultadoCargaVentas,
} from '../../services/carga-ventas.service';

interface OpcionCarga {
  tipo: CargaTipo;
  label: string;
  icono: string;
  descripcion: string;
  ayuda: string;
}

@Component({
  selector: 'app-carga-ventas',
  imports: [...SHARED_MATERIAL_IMPORTS],
  templateUrl: './carga-ventas.component.html',
  styleUrl: './carga-ventas.component.css',
})
export class CargaVentasComponent implements OnInit {
  private srv = inject(CargaVentasService);
  private auth = inject(AuthService);

  // ── Selector de dataset a cargar ──
  readonly opciones: OpcionCarga[] = [
    {
      tipo: 'ventas', label: 'Ventas', icono: 'point_of_sale',
      descripcion: 'Ventas por sede (afectaciones). Se actualiza por CodigoCV.',
      ayuda: 'El archivo debe incluir la columna CodigoCV (clave). Volver a subirlo no duplica datos.',
    },
    {
      tipo: 'margen', label: 'Margen de Ventas', icono: 'percent',
      descripcion: 'Márgenes por línea de producto. Se reemplaza por CodigoCV.',
      ayuda: 'El archivo debe incluir CodigoCV. Un CodigoCV puede tener varias líneas; al re-subir se reemplazan las de esos códigos.',
    },
    {
      tipo: 'ventas-call', label: 'Ventas Call', icono: 'headset_mic',
      descripcion: 'Evolutivo de ventas del canal Call. Se actualiza por CodigoCV.',
      ayuda: 'Tabla propia (ventas_call). Mi Panel del asesor Call lee siempre de aquí (mes actual y meses anteriores). El archivo debe incluir CodigoCV.',
    },
    {
      tipo: 'ventas-realzza', label: 'Ventas Realzza', icono: 'storefront',
      descripcion: 'Evolutivo de ventas del canal Realzza (por sede). Se actualiza por CodigoCV.',
      ayuda: 'Tabla propia (ventas_realzza). En Realzza el vendedor es la sede. Las notas de crédito y refacturaciones se aplican por su fecha de afectación (DiaAF/MesAF/AñoAF). El archivo debe incluir CodigoCV.',
    },
  ];
  tipo: CargaTipo = 'ventas';

  archivo: File | null = null;
  subiendo = false;
  progreso = 0;
  procesando = false;
  resultado: ResultadoCargaVentas | null = null;
  error = '';

  estado: EstadoVentas | null = null;
  cargandoEstado = false;

  ngOnInit(): void {
    this.cargarEstado();
  }

  get opcionActual(): OpcionCarga {
    return this.opciones.find(o => o.tipo === this.tipo)!;
  }

  seleccionarTipo(t: CargaTipo): void {
    if (this.tipo === t || this.subiendo) return;
    this.tipo = t;
    this.archivo = null;
    this.resultado = null;
    this.error = '';
    this.estado = null;
    this.cargarEstado();
  }

  cargarEstado(): void {
    this.cargandoEstado = true;
    this.srv.estado(this.tipo).subscribe({
      next: (e) => { this.estado = e; this.cargandoEstado = false; },
      error: () => { this.cargandoEstado = false; },
    });
  }

  onArchivo(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.archivo = input.files && input.files.length ? input.files[0] : null;
    this.resultado = null;
    this.error = '';
    input.value = '';
  }

  subir(): void {
    if (!this.archivo || this.subiendo) return;
    this.subiendo = true;
    this.procesando = false;
    this.progreso = 0;
    this.resultado = null;
    this.error = '';

    const nombre = this.auth.getUsuario()?.nombre ?? '';
    this.srv.importar(this.tipo, this.archivo, nombre).subscribe({
      next: (ev) => {
        if (ev.type === HttpEventType.UploadProgress && ev.total) {
          this.progreso = Math.round((ev.loaded / ev.total) * 100);
          if (this.progreso >= 100) this.procesando = true;
        } else if (ev.type === HttpEventType.Response) {
          this.subiendo = false;
          this.procesando = false;
          const body = ev.body as ResultadoCargaVentas;
          if (body && body.success) {
            this.resultado = body;
            this.archivo = null;
            this.cargarEstado();
          } else {
            this.error = (body && body.message) || 'Error al importar el archivo.';
          }
        }
      },
      error: (err) => {
        this.subiendo = false;
        this.procesando = false;
        this.error = err?.error?.message
          ?? 'No se pudo subir el archivo. Revisa tu conexión o el tamaño del archivo.';
      },
    });
  }

  get tamanoArchivo(): string {
    if (!this.archivo) return '';
    const mb = this.archivo.size / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(this.archivo.size / 1024)} KB`;
  }
}
