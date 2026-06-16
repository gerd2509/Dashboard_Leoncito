import { Component, inject, ViewChild, OnInit } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../../common_imports';
import { DX_COMMON_MODULES } from '../../dx_common_modules';
import { SheetsService } from '../../../services/service-google.service';
import { AuthService } from '../../../services/auth.service';
import { SedeConfigService } from '../../../services/sede-config.service';
import { ExcelExportService } from '../../../services/excel/excel.service';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { DxDataGridComponent } from 'devextreme-angular';
import { lastValueFrom } from 'rxjs';

@Component({
  selector: 'app-agendamientos-sedes',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './agendamientos-sedes.component.html',
  styleUrl: './agendamientos-sedes.component.css'
})
export class AgendamientosSedesComponent implements OnInit {
  private service      = inject(SheetsService);
  private excelService = inject(ExcelExportService);
  private auth         = inject(AuthService);
  private sedeCfg      = inject(SedeConfigService);

  protected showFilterRow = true;
  protected currentFilter = 'auto';

  formAgendamientos: UntypedFormGroup;
  datosFiltrados: any[] = [];
  datosOriginales: any[] = [];
  isLoading = false;

  // ── Sede ──
  esAdmin = false;
  sedesDisponibles: { key: string; nombre: string }[] = [];
  sedeKey = 'ferrenafe';

  @ViewChild(DxDataGridComponent, { static: false }) dataGrid!: DxDataGridComponent;

  constructor(private fb: UntypedFormBuilder) {
    this.formAgendamientos = this.fb.group({
      fechaGestion: [new Date()],
      sede: ['ferrenafe'],
    });
  }

  async ngOnInit() {
    this.configurarSedeSegunUsuario();
    this.datosOriginales = await lastValueFrom(this.service.getSheetDataFerre());
  }

  // admin / sede 'todas' → selector; usuario de sede → fijo a su sede
  private configurarSedeSegunUsuario() {
    const u = this.auth.getUsuario();
    this.esAdmin = !u || u.rol === 'admin' || this.sedeCfg.normalizar(u.sede) === 'todas';

    if (this.esAdmin) {
      this.sedesDisponibles = this.sedeCfg.getSedesCall();
      this.sedeKey = this.sedesDisponibles[0]?.key ?? 'ferrenafe';
    } else {
      this.sedeKey = this.sedeCfg.normalizar(u!.sede);
      const cfg = this.sedeCfg.getConfig(u!.sede);
      this.sedesDisponibles = [{ key: this.sedeKey, nombre: cfg?.nombre ?? u!.sede }];
    }
    this.formAgendamientos.patchValue({ sede: this.sedeKey }, { emitEvent: false });
  }

  onSedeChange(e: any) {
    const key = e?.value ?? this.formAgendamientos.value.sede;
    if (!key || key === this.sedeKey) return;
    this.sedeKey = key;
    this.recalcular();
  }

  get sedeNombre(): string {
    return this.sedeCfg.getConfig(this.sedeKey)?.nombre ?? this.sedeKey;
  }

  // Columna de asesor en el form por sede: 'ASESOR FERREÑAFE' / 'ASESOR MOTUPE'
  get columnaAsesor(): string {
    const cfg = this.sedeCfg.getConfig(this.sedeKey);
    return cfg ? `ASESOR ${cfg.valorSede.toUpperCase()}` : 'ASESOR';
  }

  soloFecha = (d: any) => d['Marca temporal']?.split(' ')[0] ?? '';

  parseFecha(fechaStr: string): Date | null {
    if (!fechaStr) return null;
    const partes = fechaStr.split(' ');
    const [dia, mes, anio] = partes[0].split('/').map(Number);
    const [hora, minuto, segundo] = partes[1]?.split(':').map(Number) || [0, 0, 0];
    return new Date(anio, mes - 1, dia, hora, minuto, segundo);
  }

  // Filas que pertenecen a la sede seleccionada (su columna de asesor tiene valor)
  private filasDeSede(): any[] {
    const col = this.columnaAsesor;
    return this.datosOriginales.filter(r => (r[col] ?? '').toString().trim() !== '');
  }

  evaluarEstadoString(fila: any, agendamientos: any[]): string {
    const dni = fila['DNI CLIENTE'];
    const motivoInteres = fila['MOTIVO INTERÉS'];
    if (motivoInteres !== 'CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)') return '';

    const marcaTemporalActual = this.parseFecha(fila['Marca temporal']);
    if (!marcaTemporalActual) return '';

    const posteriores = agendamientos.filter(p => {
      const mt = this.parseFecha(p['Marca temporal']);
      return p['DNI CLIENTE'] === dni && mt && mt > marcaTemporalActual;
    });

    const reagendado = posteriores.some(p =>
      (p['RESULTADO DE GESTIÓN']?.toUpperCase().trim() === 'TERCERO RELACIONADO') ||
      (p['MOTIVO INTERÉS']?.toUpperCase().trim() === 'CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)')
    );
    if (reagendado) return 'REAGENDADO';

    const resultadosAtendido = [
      'VENTA DERIVADA PARA CIERRE A SEDE',
      'VISITARÁ TIENDA',
      'SE ENVIÓ A ASESOR VISITA A DOMICILIO',
      'NO INTERESADO',
      'NO ATENDIBLE'
    ];
    const estadosAtendido = ['CONTACTO', 'NO CONTACTO'];

    const atendido = posteriores.some(p => {
      const resultado = (p['RESULTADO DE GESTIÓN'] || '').toUpperCase().trim();
      const estado = (p['ESTADO DE GESTIÓN'] || '').toUpperCase().trim();
      return resultadosAtendido.includes(resultado) || estadosAtendido.includes(estado);
    });

    return atendido ? 'ATENDIDO' : 'VIGENTE';
  }

  // Recalcula sobre los datos ya cargados (cambio de sede o fecha)
  private recalcular() {
    const fechaSeleccionada = this.formAgendamientos.value.fechaGestion;
    if (!fechaSeleccionada) { this.datosFiltrados = []; return; }

    const dia = fechaSeleccionada.getDate().toString().padStart(2, '0');
    const mes = (fechaSeleccionada.getMonth() + 1).toString().padStart(2, '0');
    const anio = fechaSeleccionada.getFullYear();
    const fechaSel = `${dia}/${mes}/${anio}`;

    const col = this.columnaAsesor;
    const filasSede = this.filasDeSede();

    const agendamientosDelDia = filasSede.filter((d: any) => {
      const fechaRaw = (d['FECHA DE INTERÉS AGENDAMIENTO'] || '').trim();
      const [dDia, dMes, dAnio] = fechaRaw.split('/');
      if (!dDia || !dMes || !dAnio) return false;
      const fechaInteres = `${dDia.padStart(2, '0')}/${dMes.padStart(2, '0')}/${dAnio}`;
      const motivo = (d['MOTIVO INTERÉS'] || '').trim().toUpperCase();
      return fechaInteres === fechaSel && motivo === 'CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)';
    });

    this.datosFiltrados = agendamientosDelDia.map(fila => ({
      ...fila,
      asesor: (fila[col] ?? '').toString().trim(),
      estadoAgendamiento: this.evaluarEstadoString(fila, filasSede),
    }));
  }

  async actualizar() {
    if (!this.formAgendamientos.value.fechaGestion) return;
    this.isLoading = true;
    try {
      this.datosOriginales = await lastValueFrom(this.service.getSheetDataFerre());
      this.recalcular();
    } catch (error) {
      console.error('Error al actualizar agendamientos de sedes:', error);
    } finally {
      this.isLoading = false;
    }
  }

  getComentarioAdicionalUnido = (d: any): string => {
    return Object.keys(d)
      .filter(key => key.toUpperCase().startsWith('COMENTARIO ADICIONAL AGENDAMIENTO'))
      .map(key => d[key])
      .filter(valor => valor && valor.trim() !== '')
      .join(' | ');
  };

  exportar(): void {
    if (this.dataGrid) {
      this.excelService.exportarDesdeGrid(`agendamientos-${this.sedeKey}`, this.dataGrid);
    }
  }

  onCellPrepared(e: any) {
    if (e.rowType === 'header' && !e.cellElement.classList.contains('dx-editor-cell')) {
      e.cellElement.style.padding = '8px';
      e.cellElement.style.backgroundColor = '#293964';
      e.cellElement.style.color = 'white';
      e.cellElement.style.textAlign = 'center';
      e.cellElement.style.fontWeight = 'bold';
      e.cellElement.style.whiteSpace = 'normal';
      e.cellElement.style.height = 'auto';
      e.cellElement.style.borderWidth = '1.5px';
      e.cellElement.style.borderColor = 'black';
      return;
    }

    if (e.rowType === 'data' && e.column.dataField === 'estadoAgendamiento') {
      const colores: Record<string, string> = {
        'ATENDIDO':   '#c8e6c9',
        'REAGENDADO': '#fff9c4',
        'VIGENTE':    '#ffcdd2'
      };
      const color = colores[e.value];
      if (color) e.cellElement.style.setProperty('background-color', color, 'important');
      e.cellElement.style.fontWeight = 'bold';
      e.cellElement.style.textAlign = 'center';
    }
  }
}
