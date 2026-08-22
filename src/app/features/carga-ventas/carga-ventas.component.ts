import { Component, inject, OnInit, OnDestroy } from '@angular/core';
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

import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';

@Component({
  selector: 'app-carga-ventas',
  imports: [...SHARED_MATERIAL_IMPORTS, LoadingOverlayComponent],
  templateUrl: './carga-ventas.component.html',
  styleUrl: './carga-ventas.component.css',
})
export class CargaVentasComponent implements OnInit, OnDestroy {
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
    {
      tipo: 'kommo-call', label: 'Kommo Call', icono: 'hub',
      descripcion: 'Leads Kommo del canal Call. Se actualiza por ID de lead.',
      ayuda: 'Tabla propia (leads_kommo_call). Exporta de Kommo con: ID, Nombre del lead, Contacto principal, Responsable, Embudo de ventas, Fecha de creación, Última modificación el, Modificado por, Etiquetas del lead. Sirve para "Maduración de Leads".',
    },
    {
      tipo: 'kommo-realzza', label: 'Kommo Realzza', icono: 'hub',
      descripcion: 'Leads Kommo del canal Realzza. Se actualiza por ID de lead.',
      ayuda: 'Tabla propia (leads_kommo_realzza). Mismas columnas del export de Kommo. Sirve para "Maduración de Leads".',
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

  // Sondeo del margen procesado en segundo plano.
  private prevCreado: string | null = null;
  private pollTimer: any = null;
  private pollHasta = 0;

  ngOnInit(): void {
    this.cargarEstado();
  }

  ngOnDestroy(): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
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
    if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null; }
    this.subiendo = true;
    this.procesando = false;
    this.progreso = 0;
    this.resultado = null;
    this.error = '';
    // Marca temporal de la última carga ANTES de subir (para detectar cuándo terminó la nueva).
    this.prevCreado = this.estado?.ultimaCarga?.creado_en ?? null;

    const nombre = this.auth.getUsuario()?.nombre ?? '';
    this.srv.importar(this.tipo, this.archivo, nombre).subscribe({
      next: (ev) => {
        if (ev.type === HttpEventType.UploadProgress) {
          if (ev.total) {
            // Subida con tamaño conocido → porcentaje real.
            this.progreso = Math.round((ev.loaded / ev.total) * 100);
            if (this.progreso >= 100) this.procesando = true;
          } else {
            // No se puede medir el total → animación de procesamiento.
            this.procesando = true;
          }
        } else if (ev.type === HttpEventType.ResponseHeader || ev.type === HttpEventType.DownloadProgress) {
          // El servidor empezó a responder → subida completa, ahora procesa.
          this.progreso = 100;
          this.procesando = true;
        } else if (ev.type === HttpEventType.Response) {
          const body = ev.body as ResultadoCargaVentas;
          // Margen (u otros pesados): el backend procesa en segundo plano y responde al
          // instante → seguimos consultando /estado hasta que termine (evita timeouts).
          if (body && body.procesando) {
            this.progreso = 100;
            this.procesando = true;
            this.pollHasta = Date.now() + 8 * 60 * 1000;   // hasta 8 min
            this.archivo = null;
            this.sondearProcesamiento();
            return;
          }
          this.subiendo = false;
          this.procesando = false;
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

  /** Consulta /estado cada 3s mientras el backend procesa el margen en segundo plano. */
  private sondearProcesamiento(): void {
    this.srv.estado(this.tipo).subscribe({
      next: (e) => {
        this.estado = e;
        const creado = e.ultimaCarga?.creado_en ?? null;
        const listo = creado && creado !== this.prevCreado;   // apareció una carga nueva
        if (e.error) {                                        // el job falló en background
          this.subiendo = false; this.procesando = false;
          this.error = e.error;
        } else if (listo && !e.procesando) {                  // terminó OK
          this.subiendo = false; this.procesando = false;
          this.resultado = {
            success: true, filas: e.ultimaCarga!.filas, codigos: e.ultimaCarga!.codigos,
            reemplazados: e.ultimaCarga!.reemplazados, updated_at: e.updated_at ?? '',
          };
        } else if (Date.now() > this.pollHasta) {             // demasiado tiempo → aviso
          this.subiendo = false; this.procesando = false;
          this.error = 'La carga sigue procesándose. Vuelve a abrir esta pantalla en unos minutos para ver el resultado.';
        } else {
          this.pollTimer = setTimeout(() => this.sondearProcesamiento(), 3000);
        }
      },
      error: () => {                                          // error de red al consultar → reintenta
        if (Date.now() > this.pollHasta) { this.subiendo = false; this.procesando = false; return; }
        this.pollTimer = setTimeout(() => this.sondearProcesamiento(), 4000);
      },
    });
  }

  get tamanoArchivo(): string {
    if (!this.archivo) return '';
    const mb = this.archivo.size / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(this.archivo.size / 1024)} KB`;
  }
}
