import { Component, OnInit, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { DX_COMMON_MODULES } from '../dx_common_modules';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { lastValueFrom } from 'rxjs';
import { ControlSupervisorService, ControlSupervisor } from '../../services/control-supervisor.service';
import { SheetsService } from '../../services/service-google.service';

// Resultado del cruce control-supervisor ↔ gestión del asesor.
type Resultado = 'COINCIDE' | 'DISCREPANCIA' | 'SIN GESTIÓN';

interface CitaControl {
  id: number;
  text: string;
  startDate: Date;
  endDate: Date;
  resultado: Resultado;
  asesor: string;
  tipoBase: string;
  dni: string;
  celular: string;
  estadoSup: string;      // estado que puso el supervisor
  estadoAsesor: string;   // estado en la gestión del asesor (o '—')
  asesorGestion: string;  // asesor que figura en la gestión encontrada
  comentario: string;
}

@Component({
  selector: 'app-control-supervisor',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './control-supervisor.component.html',
  styleUrl: './control-supervisor.component.css'
})
export class ControlSupervisorComponent implements OnInit {
  private srv = inject(ControlSupervisorService);
  private sheets = inject(SheetsService);

  form: UntypedFormGroup;
  isLoading = false;
  error = '';

  citas: CitaControl[] = [];
  citasFiltradas: CitaControl[] = [];
  asesoresDisponibles: string[] = [];
  currentDate = new Date();

  // Vista del calendario controlada por botones propios (Día/Semana/Mes).
  vistaActual: 'day' | 'week' | 'month' = 'month';
  setVista(v: 'day' | 'week' | 'month'): void { this.vistaActual = v; }

  // KPIs
  kTotal = 0; kCoincide = 0; kDiscrepancia = 0; kSinGestion = 0;

  // Recursos de color por resultado del cruce.
  readonly recursosResultado = [
    { id: 'COINCIDE',      text: 'Coincide',                  color: '#2E7D32' },
    { id: 'DISCREPANCIA',  text: 'Discrepancia',              color: '#c62828' },
    { id: 'SIN GESTIÓN',   text: 'Sin gestión del asesor',    color: '#78909c' },
  ];

  constructor(private fb: UntypedFormBuilder) {
    const hoy = new Date();
    const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    this.form = this.fb.group({
      fechaInicio: [primero],
      fechaFin: [hoy],
      asesor: [''],
    });
  }

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  private soloDigitos(v: any): string {
    return (v ?? '').toString().replace(/\D/g, '').replace(/^0+/, '');
  }

  // "d/m/yyyy H:mm:ss" → Date (o null).
  private parseMarca(texto: any): Date | null {
    const s = (texto ?? '').toString().trim();
    if (!s) return null;
    const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    const d = new Date(+m[3], +m[2] - 1, +m[1], m[4] ? +m[4] : 9, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
    return isNaN(d.getTime()) ? null : d;
  }

  async cargar(): Promise<void> {
    this.isLoading = true;
    this.error = '';
    try {
      const desde = new Date(this.form.value.fechaInicio); desde.setHours(0, 0, 0, 0);
      const hasta = new Date(this.form.value.fechaFin); hasta.setHours(23, 59, 59, 999);
      this.currentDate = new Date(desde);

      const [controles, gestion] = await Promise.all([
        lastValueFrom(this.srv.listar({ desde, hasta })),
        lastValueFrom(this.sheets.getSheetDataCampo()),   // gestión Realzza (Google Form)
      ]);

      // Índice de gestiones del asesor por DNI → lista de {celular, estado, asesor, fecha}
      const idxDni = new Map<string, Array<{ celular: string; estado: string; asesor: string; fecha: Date | null }>>();
      (gestion || []).forEach((g: any) => {
        const dni = this.soloDigitos(g['DNI CLIENTE']);
        if (!dni) return;
        const arr = idxDni.get(dni) || [];
        arr.push({
          celular: this.soloDigitos(g['CELULAR GESTIONADO']),
          estado: (g['ESTADO DE GESTIÓN'] || '').toString().trim().toUpperCase(),
          asesor: (g['ASESOR REALZZA'] || '').toString().trim(),
          fecha: this.parseMarca(g['Marca temporal']),
        });
        idxDni.set(dni, arr);
      });

      this.citas = (controles || []).map(c => this.armarCita(c, idxDni)).filter((c): c is CitaControl => c !== null);
      this.asesoresDisponibles = Array.from(new Set(this.citas.map(c => c.asesor).filter(Boolean))).sort();
      this.aplicarFiltroAsesor();
    } catch (e) {
      console.error('❌ control-supervisor:', e);
      this.error = 'No se pudieron cargar los controles (revisa la conexión al servidor).';
      this.citas = []; this.citasFiltradas = [];
      this.recalcularKpis();
    } finally {
      this.isLoading = false;
    }
  }

  // Cruza un control con la gestión del asesor (por DNI y, si hay, celular).
  private armarCita(c: ControlSupervisor, idxDni: Map<string, any[]>): CitaControl | null {
    const start = this.parseMarca(c.marca_temporal);
    if (!start) return null;
    const end = new Date(start.getTime() + 30 * 60 * 1000);

    const dni = this.soloDigitos(c.dni_cliente);
    const cel = this.soloDigitos(c.celular);
    const estadoSup = (c.estado_gestion || '').toString().trim().toUpperCase();

    const candidatos = idxDni.get(dni) || [];
    let hit: any = null;
    if (candidatos.length) {
      // Preferir el que coincide en celular; si no, el más reciente.
      hit = (cel && candidatos.find(x => x.celular && x.celular === cel))
        || [...candidatos].sort((a, b) => (b.fecha?.getTime() || 0) - (a.fecha?.getTime() || 0))[0];
    }

    let resultado: Resultado;
    let estadoAsesor = '—';
    let asesorGestion = '';
    if (!hit) {
      resultado = 'SIN GESTIÓN';
    } else {
      estadoAsesor = hit.estado || '—';
      asesorGestion = hit.asesor || '';
      resultado = estadoAsesor === estadoSup ? 'COINCIDE' : 'DISCREPANCIA';
    }

    return {
      id: c.id,
      text: `${c.dni_cliente} · ${estadoSup}`,
      startDate: start,
      endDate: end,
      resultado,
      asesor: (c.asesor || '').toString().trim(),
      tipoBase: c.tipo_base || '',
      dni: c.dni_cliente || '',
      celular: c.celular || '',
      estadoSup,
      estadoAsesor,
      asesorGestion,
      comentario: c.comentario || '',
    };
  }

  aplicarFiltroAsesor(): void {
    const asesor = (this.form.value.asesor || '').toString().trim();
    this.citasFiltradas = asesor ? this.citas.filter(c => c.asesor === asesor) : [...this.citas];
    this.recalcularKpis();
  }

  private recalcularKpis(): void {
    this.kTotal = this.citasFiltradas.length;
    this.kCoincide = this.citasFiltradas.filter(c => c.resultado === 'COINCIDE').length;
    this.kDiscrepancia = this.citasFiltradas.filter(c => c.resultado === 'DISCREPANCIA').length;
    this.kSinGestion = this.citasFiltradas.filter(c => c.resultado === 'SIN GESTIÓN').length;
  }

  // ── Popups de detalle (reemplazan el formulario feo por defecto) ─────────────
  detalleVisible = false;
  detalle: CitaControl | null = null;

  diaVisible = false;
  diaTitulo = '';
  diaCitas: CitaControl[] = [];

  // Anula el formulario de edición nativo de DevExtreme.
  onFormOpening(e: any): void { e.cancel = true; }

  // Click en una cita → abre el detalle propio (no el tooltip nativo).
  onCitaClick(e: any): void {
    e.cancel = true;
    this.abrirDetalle(e.appointmentData);
  }
  onCitaDblClick(e: any): void {
    e.cancel = true;
    this.abrirDetalle(e.appointmentData);
  }

  abrirDetalle(c: CitaControl): void {
    this.detalle = c;
    this.detalleVisible = true;
  }

  // Click en un día → lista todos los controles de ese día.
  onCeldaClick(e: any): void {
    const fecha: Date = e?.cellData?.startDate;
    if (!fecha) return;
    const delDia = this.citasFiltradas.filter(c => this.mismaFecha(c.startDate, fecha));
    if (!delDia.length) return;
    this.diaCitas = [...delDia].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    this.diaTitulo = this.fechaLarga(fecha);
    this.diaVisible = true;
  }

  // Desde el popup del día, abrir el detalle de una cita.
  verDesdeDia(c: CitaControl): void {
    this.diaVisible = false;
    setTimeout(() => this.abrirDetalle(c), 120);
  }

  private mismaFecha(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  private fechaLarga(d: Date): string {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]} ${d.getFullYear()}`;
  }
  resultadoClase(r: string): string {
    return r === 'COINCIDE' ? 'ok' : r === 'DISCREPANCIA' ? 'bad' : 'none';
  }
  horaDe(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}
