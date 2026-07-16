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
  tipo: 'GESTION' | 'MARKET_PLACE';
  color: string;          // id del recurso para colorear (resultado o estado MP)
  text: string;
  startDate: Date;
  endDate: Date;
  asesor: string;
  comentario: string;
  // Gestión:
  resultado?: Resultado;
  tipoBase?: string;
  dni?: string;
  celular?: string;
  estadoSup?: string;      // estado que puso el supervisor
  estadoAsesor?: string;   // estado en la ÚLTIMA gestión del asesor (o '—')
  asesorGestion?: string;  // asesor que figura en la gestión encontrada
  fechaGestion?: string;   // fecha de la última gestión hallada (o '')
  fuenteGestion?: string;  // "Gestión Realzza" | "Gestión Kommo (Realzza)"
  avisoTipo?: string;      // aviso si la clasificación kommo/market place no calza
  avisoCelular?: string;   // aviso si el celular registrado difiere del de la gestión
  // Market Place / Kommo Plataforma:
  mpSubtipo?: string;      // MARKET PLACE | KOMMO PLATAFORMA
  estadoMp?: string;       // AL DÍA / DESACTUALIZADO / ACTUALIZADO (market place)
  fechaPublicacion?: string;
  diasSinPublicar?: number | null;
  cliente?: string;        // nombre del cliente (kommo plataforma)
  estadoLead?: string;     // LEAD RESPONDIDO / ... (kommo plataforma)
  fotos?: string[];        // pruebas (imágenes base64)
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

  // KPIs de gestión.
  kTotal = 0; kCoincide = 0; kDiscrepancia = 0; kSinGestion = 0;
  // KPIs de market place.
  kMpTotal = 0; kAlDia = 0; kDesactualizado = 0; kActualizado = 0;

  // Vista: qué controles mostrar en el calendario.
  vista: 'TODO' | 'GESTION' | 'MARKET_PLACE' = 'TODO';

  // Recursos de color: gestión (resultado del cruce) + market place (estado).
  readonly recursosColor = [
    { id: 'COINCIDE',      text: 'Coincide',               color: '#2E7D32' },
    { id: 'DISCREPANCIA',  text: 'Discrepancia',           color: '#c62828' },
    { id: 'SIN GESTIÓN',   text: 'Sin gestión del asesor', color: '#78909c' },
    { id: 'AL DÍA',        text: 'MP al día',              color: '#1565C0' },
    { id: 'DESACTUALIZADO',text: 'MP desactualizado',      color: '#E65100' },
    { id: 'ACTUALIZADO',   text: 'MP actualizado',         color: '#6A1B9A' },
    { id: 'LEAD RESPONDIDO',       text: 'Lead respondido',        color: '#2E7D32' },
    { id: 'CLIENTE SOLO DIO DNI',  text: 'Solo dio DNI',           color: '#E65100' },
    { id: 'CLIENTE AÚN NO RESPONDE', text: 'Aún no responde',      color: '#c62828' },
    { id: 'OTRO',          text: 'Otro (Kommo Plataforma)', color: '#546E7A' },
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

  setVistaTipo(v: 'TODO' | 'GESTION' | 'MARKET_PLACE'): void {
    this.vista = v;
    this.aplicarFiltroAsesor();
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
      // El calendario se centra en la fecha fin (para que Día/Semana caigan en datos).
      this.currentDate = new Date(this.form.value.fechaFin);

      const [controles, gestion, kommo] = await Promise.all([
        lastValueFrom(this.srv.listar({ desde, hasta })),
        lastValueFrom(this.sheets.getSheetDataCampo()),   // gestión Realzza (Google Form)
        lastValueFrom(this.sheets.getSheetKOMMO()),        // gestión Kommo (Realzza + Call)
      ]);

      // Índice de gestiones Realzza por DNI → lista de {celular, estado, asesor, fecha}
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

      // Índice de gestión KOMMO (lado tienda Realzza) por DNI, con la marca MARKET PLACE R:
      //   MARKET PLACE R = NO → es KOMMO ; = SÍ → es MARKET PLACE.
      const idxKommo = new Map<string, Array<{ celular: string; estado: string; asesor: string; fecha: Date | null; mp: string }>>();
      (kommo || []).forEach((g: any) => {
        const dni = this.soloDigitos(g['DNI CLIENTE REALZZA']);
        if (!dni) return;
        const arr = idxKommo.get(dni) || [];
        arr.push({
          celular: this.soloDigitos(g['CELULAR GESTIONADO REALZZA']),
          estado: (g['ESTADO DE GESTIÓN REALZZA'] || '').toString().trim().toUpperCase(),
          asesor: (g['ASESOR REALZZA'] || '').toString().trim(),
          fecha: this.parseMarca(g['Marca temporal']),
          mp: this.siNo(g['MARKET PLACE R']),
        });
        idxKommo.set(dni, arr);
      });

      this.citas = (controles || [])
        .map(c => (c.tipo_control === 'MARKET_PLACE' ? this.armarCitaMp(c) : this.armarCita(c, idxDni, idxKommo)))
        .filter((c): c is CitaControl => c !== null);
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
  // Si el tipo de base es KOMMO o MARKET PLACE, cruza con la gestión KOMMO (tienda
  // Realzza) filtrando por la columna MARKET PLACE R (NO=kommo, SÍ=market place);
  // en cualquier otro caso cruza con la gestión Realzza normal.
  private armarCita(c: ControlSupervisor, idxDni: Map<string, any[]>, idxKommo: Map<string, any[]>): CitaControl | null {
    const start = this.parseMarca(c.marca_temporal);
    if (!start) return null;
    const end = new Date(start.getTime() + 30 * 60 * 1000);

    const dni = this.soloDigitos(c.dni_cliente);
    const cel = this.soloDigitos(c.celular);
    const estadoSup = (c.estado_gestion || '').toString().trim().toUpperCase();

    // Fuente del cruce según el tipo de base registrado por el supervisor.
    const tb = (c.tipo_base || '').toString().trim().toUpperCase();
    const esMarketPlace = tb === 'MARKET PLACE';
    const esKommo = tb === 'KOMMO';
    const esKommoMp = esMarketPlace || esKommo;
    let candidatos: any[];
    let fuenteGestion: string;
    if (esKommoMp) {
      // Cruza contra TODAS las gestiones Kommo del cliente (sin filtrar por MP);
      // luego se compara el estado y se avisa si la clasificación (MARKET PLACE R)
      // de la gestión no calza con lo que registró el supervisor.
      candidatos = idxKommo.get(dni) || [];
      fuenteGestion = 'Gestión Kommo (Realzza)';
    } else {
      candidatos = idxDni.get(dni) || [];
      fuenteGestion = 'Gestión Realzza';
    }

    // SIEMPRE la ÚLTIMA gestión del cliente por DNI: la más reciente EN o ANTES de
    // la fecha del control (la que el supervisor estaba verificando); si no hay
    // ninguna anterior, la más reciente disponible. El celular NO restringe la
    // elección (para no quedarnos con un registro viejo): si difiere, se avisa aparte.
    let hit: any = null;
    if (candidatos.length) {
      const ordenado = [...candidatos].sort((a, b) => (b.fecha?.getTime() || 0) - (a.fecha?.getTime() || 0));
      hit = (start ? ordenado.find(x => x.fecha && x.fecha.getTime() <= start.getTime()) : null) || ordenado[0];
    }

    let resultado: Resultado;
    let estadoAsesor = '—';
    let asesorGestion = '';
    let fechaGestion = '';
    let avisoTipo = '';
    let avisoCelular = '';
    if (!hit) {
      resultado = 'SIN GESTIÓN';
    } else {
      estadoAsesor = hit.estado || '—';
      asesorGestion = hit.asesor || '';
      fechaGestion = hit.fecha ? `${String(hit.fecha.getDate()).padStart(2, '0')}/${String(hit.fecha.getMonth() + 1).padStart(2, '0')}/${hit.fecha.getFullYear()} ${this.horaDe(hit.fecha)}` : '';
      resultado = estadoAsesor === estadoSup ? 'COINCIDE' : 'DISCREPANCIA';

      // Kommo/Market Place: avisar si la clasificación de la gestión no calza.
      if (esKommoMp) {
        const gestMkt = hit.mp === 'SI';
        fuenteGestion = `Gestión Kommo (Realzza) · gestión: ${gestMkt ? 'MARKET PLACE' : 'KOMMO'}`;
        if (gestMkt !== esMarketPlace) {
          avisoTipo = `La gestión figura como ${gestMkt ? 'MARKET PLACE' : 'KOMMO'}, pero se registró como ${esMarketPlace ? 'MARKET PLACE' : 'KOMMO'}`;
        }
      }

      // Avisar si el celular registrado por el supervisor difiere del de la gestión.
      const celGest = (hit.celular || '').toString();
      if (cel && celGest && cel !== celGest) {
        avisoCelular = `El celular registrado (${c.celular}) no coincide con el de la gestión (${celGest})`;
      }
    }

    return {
      id: c.id,
      tipo: 'GESTION',
      color: resultado,
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
      fechaGestion,
      fuenteGestion,
      avisoTipo,
      avisoCelular,
      comentario: c.comentario || '',
    };
  }

  // Normaliza SÍ/NO (sin tildes) para la columna MARKET PLACE R.
  private siNo(v: any): string {
    const s = (v ?? '').toString().trim().toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    return s === 'SI' ? 'SI' : s === 'NO' ? 'NO' : s;
  }

  // Control de Market Place / Kommo Plataforma → cita coloreada por su estado.
  private armarCitaMp(c: ControlSupervisor): CitaControl | null {
    const start = this.parseMarca(c.marca_temporal);
    if (!start) return null;
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    const sub = (c.mp_subtipo || 'MARKET PLACE').toString().trim().toUpperCase();
    const fotos = Array.isArray(c.fotos) ? c.fotos : [];

    if (sub === 'KOMMO PLATAFORMA') {
      const estadoLead = (c.estado_lead || '').toString().trim().toUpperCase();
      return {
        id: c.id, tipo: 'MARKET_PLACE', mpSubtipo: 'KOMMO PLATAFORMA',
        color: estadoLead || 'OTRO',
        text: `KP · ${estadoLead}`,
        startDate: start, endDate: end,
        asesor: (c.asesor || '').toString().trim(),
        tipoBase: 'KOMMO PLATAFORMA',
        comentario: c.comentario || '',
        cliente: c.cliente || '',
        estadoLead,
        fotos,
      };
    }

    const estadoMp = (c.estado_mp || '').toString().trim().toUpperCase();
    const fpub = this.parseMarca(c.fecha_publicacion);
    const dias = fpub ? Math.max(0, Math.floor((start.getTime() - fpub.getTime()) / 86400000)) : null;

    return {
      id: c.id, tipo: 'MARKET_PLACE', mpSubtipo: 'MARKET PLACE',
      color: estadoMp || 'DESACTUALIZADO',
      text: `MP · ${estadoMp}`,
      startDate: start, endDate: end,
      asesor: (c.asesor || '').toString().trim(),
      tipoBase: 'MARKET PLACE',
      comentario: c.comentario || '',
      estadoMp,
      fechaPublicacion: c.fecha_publicacion || '',
      diasSinPublicar: dias,
      fotos,
    };
  }

  aplicarFiltroAsesor(): void {
    const asesor = (this.form.value.asesor || '').toString().trim();
    this.citasFiltradas = this.citas.filter(c =>
      (!asesor || c.asesor === asesor) &&
      (this.vista === 'TODO' || c.tipo === this.vista));
    this.recalcularKpis();
  }

  private recalcularKpis(): void {
    const g = this.citasFiltradas.filter(c => c.tipo === 'GESTION');
    this.kTotal = g.length;
    this.kCoincide = g.filter(c => c.resultado === 'COINCIDE').length;
    this.kDiscrepancia = g.filter(c => c.resultado === 'DISCREPANCIA').length;
    this.kSinGestion = g.filter(c => c.resultado === 'SIN GESTIÓN').length;
    const m = this.citasFiltradas.filter(c => c.tipo === 'MARKET_PLACE');
    this.kMpTotal = m.length;
    this.kAlDia = m.filter(c => c.estadoMp === 'AL DÍA').length;
    this.kDesactualizado = m.filter(c => c.estadoMp === 'DESACTUALIZADO').length;
    this.kActualizado = m.filter(c => c.estadoMp === 'ACTUALIZADO').length;
  }

  // ── Popups de detalle (reemplazan el formulario feo por defecto) ─────────────
  detalleVisible = false;
  detalle: CitaControl | null = null;

  diaVisible = false;
  diaTitulo = '';
  diaCitas: CitaControl[] = [];
  fotoAmpliada: string | null = null;   // visor de foto a pantalla completa
  diaGrupos: {
    asesor: string; total: number; discrepancias: number; obs: number;
    tipos: { tipoBase: string; citas: CitaControl[]; total: number; discrepancias: number; obs: number }[];
  }[] = [];
  private asesorExpandido = new Set<string>();
  private tipoExpandido = new Set<string>();
  private detalleDesdeDia = false;   // true si el detalle se abrió desde la lista del día

  // Cuota diaria de supervisiones que debe ingresar el supervisor.
  readonly metaDia = 50;
  get claseMetaDia(): string {
    const n = this.diaCitas.length;
    return n >= this.metaDia ? 'meta-ok' : n >= this.metaDia * 0.6 ? 'meta-mid' : 'meta-low';
  }

  toggleAsesor(a: string): void {
    this.asesorExpandido.has(a) ? this.asesorExpandido.delete(a) : this.asesorExpandido.add(a);
  }
  estaExpandido(a: string): boolean { return this.asesorExpandido.has(a); }
  keyTipo(asesor: string, tipoBase: string): string { return asesor + '¦' + tipoBase; }
  toggleTipo(k: string): void {
    this.tipoExpandido.has(k) ? this.tipoExpandido.delete(k) : this.tipoExpandido.add(k);
  }
  estaTipoExpandido(k: string): boolean { return this.tipoExpandido.has(k); }

  // Agrupa las citas del día por asesor y, dentro, por TIPO DE BASE (doble desplegable).
  private construirGruposDia(): void {
    const porAsesor = new Map<string, CitaControl[]>();
    for (const c of this.diaCitas) {
      const a = c.asesor || '—';
      if (!porAsesor.has(a)) porAsesor.set(a, []);
      porAsesor.get(a)!.push(c);
    }
    this.diaGrupos = Array.from(porAsesor.entries()).map(([asesor, citas]) => {
      const porTipo = new Map<string, CitaControl[]>();
      for (const c of citas) {
        const tb = (c.tipoBase || '—').toString().trim().toUpperCase() || '—';
        if (!porTipo.has(tb)) porTipo.set(tb, []);
        porTipo.get(tb)!.push(c);
      }
      const tipos = Array.from(porTipo.entries()).map(([tipoBase, cs]) => ({
        tipoBase, citas: cs, total: cs.length,
        discrepancias: cs.filter(x => x.resultado === 'DISCREPANCIA').length,
        obs: cs.filter(x => this.tieneAviso(x)).length,
      })).sort((a, b) => b.total - a.total || a.tipoBase.localeCompare(b.tipoBase));
      return {
        asesor, total: citas.length,
        discrepancias: citas.filter(c => c.resultado === 'DISCREPANCIA').length,
        obs: citas.filter(c => this.tieneAviso(c)).length,
        tipos,
      };
    }).sort((a, b) => b.discrepancias - a.discrepancias || b.obs - a.obs || b.total - a.total);
    // Arrancan COLAPSADOS (asesor y tipo base): se despliega al hacer clic.
    this.asesorExpandido = new Set();
    this.tipoExpandido = new Set();
  }

  // Anula el formulario de edición nativo de DevExtreme.
  onFormOpening(e: any): void { e.cancel = true; }

  // Click en una cita del calendario → abre el detalle (no viene de la lista del día).
  onCitaClick(e: any): void {
    e.cancel = true;
    this.detalleDesdeDia = false;
    this.abrirDetalle(e.appointmentData);
  }
  onCitaDblClick(e: any): void {
    e.cancel = true;
    this.detalleDesdeDia = false;
    this.abrirDetalle(e.appointmentData);
  }

  abrirDetalle(c: CitaControl): void {
    this.detalle = c;
    this.detalleVisible = true;
  }

  // Al cerrar el detalle: si venía de la lista del día, se vuelve a esa lista.
  onDetalleHidden(): void {
    if (this.detalleDesdeDia) {
      this.detalleDesdeDia = false;
      setTimeout(() => (this.diaVisible = true), 140);
    }
  }

  // Click en un día → lista todos los controles de ese día.
  onCeldaClick(e: any): void {
    const fecha: Date = e?.cellData?.startDate;
    if (!fecha) return;
    this.currentDate = new Date(fecha);   // navega el calendario a ese día (útil al pasar a Día/Semana)
    const delDia = this.citasFiltradas.filter(c => this.mismaFecha(c.startDate, fecha));
    if (!delDia.length) return;
    this.diaCitas = [...delDia].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    this.construirGruposDia();
    this.diaTitulo = this.fechaLarga(fecha);
    this.diaVisible = true;
  }

  // ¿La cita tiene alguna observación (celular o tipo distinto)?
  tieneAviso(c: CitaControl): boolean { return !!(c.avisoTipo || c.avisoCelular); }
  tieneFotos(c: CitaControl): boolean { return !!(c.fotos && c.fotos.length); }
  avisoTexto(c: CitaControl): string { return [c.avisoTipo, c.avisoCelular].filter(Boolean).join(' · '); }
  get diaObs(): number { return this.diaCitas.filter(c => this.tieneAviso(c)).length; }
  get diaDiscrepancias(): number { return this.diaCitas.filter(c => c.resultado === 'DISCREPANCIA').length; }

  // Desde el popup del día, abrir el detalle de una cita (al cerrar vuelve a la lista).
  verDesdeDia(c: CitaControl): void {
    this.detalleDesdeDia = true;
    this.diaVisible = false;
    setTimeout(() => this.abrirDetalle(c), 120);
  }

  private mismaFecha(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  private fechaLarga(d: Date): string {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${dias[d.getDay()]} ${d.getDate()} de ${meses[d.getMonth()]} del ${d.getFullYear()}`;
  }
  // Clase CSS por color/estado (gestión y market place).
  claseColor(id: string): string {
    switch (id) {
      case 'COINCIDE': return 'ok';
      case 'DISCREPANCIA': return 'bad';
      case 'SIN GESTIÓN': return 'none';
      case 'AL DÍA': return 'mp-ok';
      case 'DESACTUALIZADO': return 'mp-bad';
      case 'ACTUALIZADO': return 'mp-upd';
      case 'LEAD RESPONDIDO': return 'ok';
      case 'CLIENTE SOLO DIO DNI': return 'mp-bad';
      case 'CLIENTE AÚN NO RESPONDE': return 'bad';
      case 'OTRO': return 'none';
      default: return 'none';
    }
  }
  horaDe(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  mpCorto(estado: string): string {
    return estado === 'AL DÍA' ? 'OK' : estado === 'ACTUALIZADO' ? 'ACT' : estado === 'DESACTUALIZADO' ? 'DESACT' : '';
  }
  // Texto del badge de resultado/estado según el tipo de cita.
  badgeDe(c: CitaControl): string {
    if (c.tipo !== 'MARKET_PLACE') return c.resultado || '';
    return c.mpSubtipo === 'KOMMO PLATAFORMA' ? (c.estadoLead || '') : (c.estadoMp || '');
  }
  esKommoPlataforma(c: CitaControl): boolean { return c.mpSubtipo === 'KOMMO PLATAFORMA'; }
}
