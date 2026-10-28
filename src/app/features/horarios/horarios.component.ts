import { Component, OnInit, inject } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../common_imports';
import { MatIconModule } from '@angular/material/icon';
import { lastValueFrom } from 'rxjs';
import { CapSedesService } from '../../services/cap-sedes.service';
import { HorariosService, HorarioSlot, HorarioRotacionAsesor, HorarioCambio } from '../../services/horarios.service';
import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';

// Sede fija por ahora — el módulo nace solo para Realzza Chiclayo.
const SEDE = 'REALZZA CHICLAYO';

// Asesores que SÍ están en el CAP pero no entran a esta rotación (decisión puntual, no un dato del CAP).
const EXCLUIDOS_ROTACION = new Set(['LLONTOP DAVILA DENNIS CHRISTIAN']);

// Nombres cortos conocidos (para los demás, se deriva automáticamente del 3er token del nombre CAP).
const NOMBRES_CORTOS: Record<string, string> = {
  'MONTALVO LUYO ERNESTO ADOLFO': 'Ernesto',
  'CHANTA CAMPOS KELLY KARINTIA': 'Kelly',
  'SANTAMARIA GUZMAN MERLY BRIGHITE': 'Merly',
  'UCHOFEN VIGO FELICITA': 'Felicita',
  'PEREZ TINEO MARICIELO TATIANA': 'Tatiana',
  'MIÑOPE GONZALES ANYELA ESTHEFANY': 'Anyela',
  'RIVAS PURISACA KAREN YUDITH': 'Karen Yudith',
  'ORUE LIZARRAGA JESUS AUGUSTO LIZANDRO': 'Jesús',
  'BERNAL BAZAN BRENDA NICOLL': 'Brenda',
  'PEREZ TINEO WILLIAM HUMBERTO': 'William',
  'CHANAME SOTO ANITA NOEMI': 'Anita',
  'VALDERA PISCOYA DEXY ROSARIO': 'Dexy',
};

// Asesoras mencionadas para pasar a esta rotación que aún no existen en el CAP (se avisa en UI).
const PENDIENTES_DE_CAP = ['QUISPE', 'TORRES ALVARADO', 'MORALES ÑIQUE', 'MORETO'];

// Semilla validada (noviembre 2026) — se guarda sola la primera vez que la sede no tiene
// reglas todavía. Solo incluye a quienes YA existen en el CAP; el resto se agrega editando
// la regla en pantalla cuando se incorporen.
const SEED_ROTACION: { id: string; grupo: number | null; diaFijo: number | null; inamovible: boolean; nota?: string }[] = [
  { id: 'MONTALVO LUYO ERNESTO ADOLFO', grupo: 0, diaFijo: null, inamovible: false },
  { id: 'RIVAS PURISACA KAREN YUDITH', grupo: 0, diaFijo: null, inamovible: false },
  { id: 'CHANAME SOTO ANITA NOEMI', grupo: 0, diaFijo: null, inamovible: false },
  { id: 'CHANTA CAMPOS KELLY KARINTIA', grupo: 1, diaFijo: null, inamovible: false },
  { id: 'PEREZ TINEO MARICIELO TATIANA', grupo: 1, diaFijo: null, inamovible: false },
  { id: 'ORUE LIZARRAGA JESUS AUGUSTO LIZANDRO', grupo: 1, diaFijo: null, inamovible: false },
  { id: 'SANTAMARIA GUZMAN MERLY BRIGHITE', grupo: 2, diaFijo: null, inamovible: false },
  { id: 'UCHOFEN VIGO FELICITA', grupo: 2, diaFijo: null, inamovible: false },
  { id: 'MIÑOPE GONZALES ANYELA ESTHEFANY', grupo: 2, diaFijo: null, inamovible: false },
  { id: 'BERNAL BAZAN BRENDA NICOLL', grupo: 2, diaFijo: null, inamovible: false },
  { id: 'PEREZ TINEO WILLIAM HUMBERTO', grupo: null, diaFijo: 4, inamovible: true, nota: 'Depende de sus estudios, puede cambiar más adelante — por ahora es fijo e inamovible' },
  { id: 'VALDERA PISCOYA DEXY ROSARIO', grupo: null, diaFijo: 5, inamovible: true, nota: 'Depende de sus estudios, puede cambiar más adelante — por ahora es fijo e inamovible' },
];
const SEED_SLOTS_NOV_2026: { etiqueta: string; nota: string | null; domingos: number[]; cuentaCuota: boolean; asesores: string[] }[] = [
  { etiqueta: '1-nov', nota: 'viene de octubre, no cuenta para la cuota de noviembre', domingos: [1], cuentaCuota: false,
    asesores: ['MIÑOPE GONZALES ANYELA ESTHEFANY', 'PEREZ TINEO MARICIELO TATIANA', 'ORUE LIZARRAGA JESUS AUGUSTO LIZANDRO', 'CHANAME SOTO ANITA NOEMI', 'UCHOFEN VIGO FELICITA', 'BERNAL BAZAN BRENDA NICOLL'] },
  { etiqueta: '8-nov → 15-nov', nota: null, domingos: [8, 15], cuentaCuota: true,
    asesores: ['MONTALVO LUYO ERNESTO ADOLFO', 'SANTAMARIA GUZMAN MERLY BRIGHITE', 'RIVAS PURISACA KAREN YUDITH', 'ORUE LIZARRAGA JESUS AUGUSTO LIZANDRO', 'CHANAME SOTO ANITA NOEMI', 'BERNAL BAZAN BRENDA NICOLL'] },
  { etiqueta: '22-nov → 29-nov', nota: null, domingos: [22, 29], cuentaCuota: true,
    asesores: ['CHANTA CAMPOS KELLY KARINTIA', 'UCHOFEN VIGO FELICITA', 'PEREZ TINEO MARICIELO TATIANA', 'MIÑOPE GONZALES ANYELA ESTHEFANY'] },
];
const DIA_NOMBRE: Record<number, string> = { 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes' };
const NOMBRE_GRUPO: Record<number, string> = { 0: 'Rota A (parte martes)', 1: 'Rota B (parte miércoles)', 2: 'Rota C (parte jueves)' };

interface AsesorVM { nombre: string; corto: string; }
interface EstadoDia { tipo: 'trabaja' | 'desc-dom' | 'desc-sem'; manual?: boolean; motivo?: string | null; cambioId?: number; }
interface PanelState { asesor: string; corto: string; dia: number; estadoTexto: string; tipoSel: string; motivo: string; cambioId: number | null; }

@Component({
  selector: 'app-horarios',
  standalone: true,
  imports: [...SHARED_MATERIAL_IMPORTS, MatIconModule, LoadingOverlayComponent],
  templateUrl: './horarios.component.html',
  styleUrls: ['./horarios.component.css'],
})
export class HorariosComponent implements OnInit {
  private capSedes = inject(CapSedesService);
  private horariosSvc = inject(HorariosService);

  readonly sede = SEDE;
  readonly diaNombre = DIA_NOMBRE;
  readonly nombreGrupo = NOMBRE_GRUPO;

  cargando = false;
  anio = 2026;
  mes = 11; // 1-12
  opcionesMes = [
    { anio: 2026, mes: 11, label: 'Noviembre 2026' },
    { anio: 2026, mes: 12, label: 'Diciembre 2026' },
  ];

  asesores: AsesorVM[] = [];
  pendientesCap: string[] = [];
  slots: HorarioSlot[] = [];
  rotacion: HorarioRotacionAsesor[] = [];
  cambios: HorarioCambio[] = [];
  private rotacionMap = new Map<string, HorarioRotacionAsesor>();
  private cambiosMap = new Map<string, HorarioCambio>();

  diasMes: number[] = [];
  letrasDia = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

  reglasAbiertas = false;
  calAbierta = true;
  logAbierta = true;

  panel: PanelState | null = null;

  get mesLabelActual(): string {
    return this.opcionesMes.find(o => o.mes === this.mes)?.label || '';
  }
  cortoDe(nombre: string): string {
    return this.asesores.find(a => a.nombre === nombre)?.corto || nombre;
  }

  async ngOnInit() {
    await this.cargarRoster();
    await this.cargarMes();
  }

  private async cargarRoster() {
    const filas = await this.capSedes.filasSede(SEDE, true);
    this.asesores = filas
      .map(f => f.vendedor.toUpperCase())
      .filter(nombre => !EXCLUIDOS_ROTACION.has(nombre))
      .map(nombre => ({ nombre, corto: this.nombreCorto(nombre) }))
      .sort((a, b) => a.corto.localeCompare(b.corto));
    this.pendientesCap = PENDIENTES_DE_CAP.filter(apellido =>
      !filas.some(f => f.vendedor.toUpperCase().includes(apellido)));
  }

  private nombreCorto(nombre: string): string {
    const fijo = NOMBRES_CORTOS[nombre];
    if (fijo) return fijo;
    const partes = nombre.trim().split(/\s+/);
    const base = partes.length >= 3 ? partes[2] : partes[0];
    return base.charAt(0) + base.slice(1).toLowerCase();
  }

  async cargarMes() {
    this.cargando = true;
    try {
      this.diasMes = Array.from({ length: new Date(this.anio, this.mes, 0).getDate() }, (_, i) => i + 1);
      const [reglas, cambios] = await Promise.all([
        lastValueFrom(this.horariosSvc.obtenerReglas(SEDE, this.anio, this.mes)),
        lastValueFrom(this.horariosSvc.obtenerCambios(SEDE, this.anio, this.mes)),
      ]);
      this.slots = reglas.slots || [];
      this.rotacion = reglas.rotacion || [];
      this.cambios = cambios || [];

      const nombresRoster = new Set(this.asesores.map(a => a.nombre));
      let necesitaGuardar = false;
      if (this.rotacion.length === 0 && this.asesores.length) {
        this.rotacion = SEED_ROTACION.filter(s => nombresRoster.has(s.id))
          .map(s => ({ asesor: s.id, grupo: s.grupo, diaFijo: s.diaFijo, inamovible: s.inamovible, nota: s.nota || null }));
        necesitaGuardar = true;
      }
      if (this.slots.length === 0 && this.anio === 2026 && this.mes === 11 && this.asesores.length) {
        this.slots = SEED_SLOTS_NOV_2026.map(s => ({
          etiqueta: s.etiqueta, nota: s.nota, domingos: s.domingos, cuentaCuota: s.cuentaCuota,
          asesores: s.asesores.filter(n => nombresRoster.has(n)),
        }));
        necesitaGuardar = true;
      }
      this.reconstruirMapas();
      if (necesitaGuardar) await this.guardarReglas();
    } finally {
      this.cargando = false;
    }
  }

  private reconstruirMapas() {
    this.rotacionMap = new Map(this.rotacion.map(r => [r.asesor, r]));
    this.cambiosMap = new Map(this.cambios.map(c => [`${c.asesor}|${new Date(c.fecha).getDate()}`, c]));
  }

  // ───────────────────── Motor de reglas (domingo cierra la semana) ─────────────────────
  diaSemana(dia: number): number {
    return new Date(this.anio, this.mes - 1, dia).getDay();
  }
  private domingoDeLaSemana(dia: number): number {
    const dow = this.diaSemana(dia);
    return dia + ((7 - dow) % 7);
  }
  private descansaDomingoEsaSemana(asesor: string, dia: number): boolean {
    const domRef = this.domingoDeLaSemana(dia);
    return this.slots.some(s => s.asesores.includes(asesor) && s.domingos.includes(domRef));
  }
  private diaRotacion(grupo: number, domRef: number): number {
    const semana = Math.round((domRef - 8) / 7);
    const orden = [2, 3, 4];
    return orden[((grupo + semana) % 3 + 3) % 3];
  }

  estadoDia(asesor: string, dia: number): EstadoDia {
    const cambio = this.cambiosMap.get(`${asesor}|${dia}`);
    if (cambio) return { tipo: cambio.tipo as EstadoDia['tipo'], manual: true, motivo: cambio.motivo, cambioId: cambio.id };
    const dow = this.diaSemana(dia);
    const tieneDomingoEstaSemana = this.descansaDomingoEsaSemana(asesor, dia);
    if (dow === 0) return tieneDomingoEstaSemana ? { tipo: 'desc-dom' } : { tipo: 'trabaja' };
    const regla = this.rotacionMap.get(asesor);
    if (!regla) return { tipo: 'trabaja' };
    const domRef = this.domingoDeLaSemana(dia);
    const diaQueLeToca = regla.inamovible ? regla.diaFijo : (regla.grupo != null ? this.diaRotacion(regla.grupo, domRef) : null);
    if (diaQueLeToca == null || diaQueLeToca !== dow) return { tipo: 'trabaja' };
    if (tieneDomingoEstaSemana && !regla.inamovible) return { tipo: 'trabaja' };
    return { tipo: 'desc-sem' };
  }

  etiquetaEstado(e: EstadoDia): string {
    const sufijo = e.manual ? ' · cambio directo' : '';
    if (e.tipo === 'desc-dom') return 'Descanso (domingo)' + sufijo;
    if (e.tipo === 'desc-sem') return 'Descanso (entre semana)' + sufijo;
    return 'Trabaja' + sufijo;
  }

  // ───────────────────── Stats ─────────────────────
  get domingosDelMes(): number[] {
    return this.diasMes.filter(d => this.diaSemana(d) === 0);
  }
  get rangoDescansoDominical(): string {
    const porDomingo = this.domingosDelMes.map(d => this.asesores.filter(a => this.estadoDia(a.nombre, d).tipo === 'desc-dom').length);
    if (!porDomingo.length) return '—';
    return `${Math.min(...porDomingo)}–${Math.max(...porDomingo)}`;
  }

  // ───────────────────── Panel de edición (cambio directo / transpaso) ─────────────────────
  abrirPanel(asesor: AsesorVM, dia: number) {
    const e = this.estadoDia(asesor.nombre, dia);
    this.panel = {
      asesor: asesor.nombre, corto: asesor.corto, dia,
      estadoTexto: 'Estado actual: ' + this.etiquetaEstado(e),
      tipoSel: e.tipo, motivo: e.motivo || '',
      cambioId: e.manual ? (e.cambioId ?? null) : null,
    };
  }
  cerrarPanel() { this.panel = null; }

  async guardarCambio() {
    if (!this.panel) return;
    const fecha = `${this.anio}-${String(this.mes).padStart(2, '0')}-${String(this.panel.dia).padStart(2, '0')}`;
    if (this.panel.cambioId) await lastValueFrom(this.horariosSvc.quitarCambio(this.panel.cambioId));
    await lastValueFrom(this.horariosSvc.registrarCambio(SEDE, this.panel.asesor, fecha, this.panel.tipoSel, this.panel.motivo));
    this.cerrarPanel();
    await this.cargarMes();
  }
  async quitarCambioActual() {
    if (!this.panel?.cambioId) return;
    await lastValueFrom(this.horariosSvc.quitarCambio(this.panel.cambioId));
    this.cerrarPanel();
    await this.cargarMes();
  }

  // ───────────────────── Edición de reglas ─────────────────────
  toggleSlotAsesor(slot: HorarioSlot, asesor: string, marcado: boolean) {
    const i = slot.asesores.indexOf(asesor);
    if (marcado && i === -1) slot.asesores.push(asesor);
    if (!marcado && i !== -1) slot.asesores.splice(i, 1);
    this.guardarReglas();
  }

  agregarSlot() {
    this.slots.push({ etiqueta: 'Nuevo par', nota: null, domingos: [], cuentaCuota: true, asesores: [] });
  }
  quitarSlot(slot: HorarioSlot) {
    this.slots = this.slots.filter(s => s !== slot);
    this.guardarReglas();
  }
  domingosTexto(slot: HorarioSlot): string { return (slot.domingos || []).join(', '); }
  setDomingosTexto(slot: HorarioSlot, texto: string) {
    slot.domingos = texto.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    this.guardarReglas();
  }

  reglaDe(asesor: string): HorarioRotacionAsesor {
    let r = this.rotacionMap.get(asesor);
    if (!r) {
      r = { asesor, grupo: 0, diaFijo: null, inamovible: false, nota: null };
      this.rotacion.push(r);
      this.rotacionMap.set(asesor, r);
    }
    return r;
  }
  cambiarInamovible(asesor: string, inamovible: boolean) {
    const r = this.reglaDe(asesor);
    r.inamovible = inamovible;
    if (inamovible && r.diaFijo == null) r.diaFijo = 4;
    if (!inamovible) r.grupo = r.grupo ?? 0;
    this.guardarReglas();
  }
  cambiarGrupo(asesor: string, grupo: number) {
    this.reglaDe(asesor).grupo = grupo;
    this.guardarReglas();
  }
  cambiarDiaFijo(asesor: string, dia: number) {
    this.reglaDe(asesor).diaFijo = dia;
    this.guardarReglas();
  }

  async guardarReglas() {
    await lastValueFrom(this.horariosSvc.guardarReglas(SEDE, this.anio, this.mes, this.slots, this.rotacion));
  }

  toggleCard(cual: 'reglas' | 'cal' | 'log') {
    if (cual === 'reglas') this.reglasAbiertas = !this.reglasAbiertas;
    if (cual === 'cal') this.calAbierta = !this.calAbierta;
    if (cual === 'log') this.logAbierta = !this.logAbierta;
  }
}
