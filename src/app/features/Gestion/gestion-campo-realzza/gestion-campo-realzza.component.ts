import { Component, inject, OnInit, ViewChild } from '@angular/core';
import { SHARED_MATERIAL_IMPORTS } from '../../common_imports';
import { DX_COMMON_MODULES } from '../../dx_common_modules';
import { SheetsService } from '../../../services/service-google.service';
import { ExcelExportService } from '../../../services/excel/excel.service';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { DxDataGridComponent } from 'devextreme-angular';
import { custom } from 'devextreme/ui/dialog';
import { lastValueFrom } from 'rxjs';

@Component({
  selector: 'app-gestion-campo-realzza',
  imports: [...SHARED_MATERIAL_IMPORTS, ...DX_COMMON_MODULES],
  templateUrl: './gestion-campo-realzza.component.html',
  styleUrl: './gestion-campo-realzza.component.css'
})
export class GestionCampoRealzzaComponent implements OnInit {
  protected service = inject(SheetsService);
  protected excelService = inject(ExcelExportService);

  formGestion: UntypedFormGroup;
  dataFiltrada: any[] = [];
  listData: any[] = [];

  protected showFilterRow: boolean = true;
  protected currentFilter: string = 'auto';

  isLoading = false;
  filtroDerivacionActivo: boolean = false;

  // Asesores Realzza — mismos nombres que el módulo Ventas Campo (fuente única).
  asesores = [
    { value: '', viewValue: 'SELECCIONE ASESOR' },
    { value: 'AV1', viewValue: 'ACOSTA JIMENEZ MARIELA NATALY' },
    { value: 'AV2', viewValue: 'PEREZ TINEO MARICIELO TATIANA' },
    { value: 'AV3', viewValue: 'RIVAS PURISACA KAREN YUDITH' },
    { value: 'AV4', viewValue: 'BERNAL BAZAN BRENDA NICOLL' },
    { value: 'AV5', viewValue: 'MIÑOPE GONZALES ANYELA ESTHEFANY' },
    { value: 'AV6', viewValue: 'MONTALVO LUYO ERNESTO ADOLFO' },
    { value: 'AV7', viewValue: 'SANTAMARIA GUZMAN MERLY BRIGHITE' },
    { value: 'AV8', viewValue: 'UCHOFEN VIGO FELICITA' },
    { value: 'AV9', viewValue: 'RIQUERO ULCO CESAR JEFFERSON' },
    { value: 'AV10', viewValue: 'BUSTAMANTE CHALAN ANA RUT' },
    { value: 'AV11', viewValue: 'BUSTAMANTE BANCES LUCIA NICOLL' },
    { value: 'AV12', viewValue: 'LLONTOP DAVILA DENNIS CHRISTIAN' }
  ];

  @ViewChild(DxDataGridComponent, { static: false }) dataGrid!: DxDataGridComponent;

  constructor(private fb: UntypedFormBuilder) {
    this.formGestion = this.fb.group({
      fechaInicio: [null, Validators.required],
      fechaFin: [null, Validators.required],
      Asesores: [''],
    });
  }

  // Campos del formulario de edición (para mostrar solo los que tienen datos).
  private readonly camposEdicion = [
    'Marca temporal', 'ASESOR REALZZA', 'DNI CLIENTE', 'CELULAR GESTIONADO', 'SEDE', 'TIPO DE BASE',
    'ESTADO DE GESTIÓN', 'MEDIO DE PRIMER CONTACTO', 'RESULTADO DE GESTIÓN', 'PRODUCTO INTERÉS', 'MOTIVO INTERÉS',
    'MOTIVO NO CONTACTO', 'MOTIVO AGENDAMIENTO', 'FECHA DE INTERÉS AGENDAMIENTO', 'HORA APROXIMADA INTERÉS AGENDAMIENTO',
    'COMENTARIO ADICIONAL AGENDAMIENTO', 'FECHA DE INTERÉS DERIVACIÓN', 'HORA APROXIMADA INTERÉS DERIVACIÓN',
    'COMENTARIO ADICIONAL DERIVACIÓN', 'MOTIVO NO INTERÉS', 'COMENTARIO ADICIONAL NO INTERÉS', 'MOTIVO NO ATENDIBLE',
    'COMENTARIO ADICIONAL NO ATENDIBLE', 'MOTIVOS TERCERO RELACIONADO', 'FECHA DE RE-LLAMADA', 'HORA DE RELLAMADA',
    'NÚMERO TITULAR ACTUAL', 'MOTIVO DE NO CIERRE', 'COMENTARIO VENTA NO CONCRETADA',
  ];

  // Al abrir el editar: mostrar en el formulario SOLO los campos con datos en ese registro.
  onEditingStart(e: any): void {
    const grid = this.dataGrid?.instance;
    if (!grid) return;
    const data = e?.data || {};
    grid.beginUpdate();
    for (const campo of this.camposEdicion) {
      const tiene = data[campo] !== undefined && data[campo] !== null && String(data[campo]).trim() !== '';
      grid.columnOption(campo, 'formItem.visible', tiene);
    }
    grid.endUpdate();
  }

  // ── Editar / eliminar registros del grid (persisten en la BD) ──
  onRowUpdated(e: any): void {
    const id = e?.key ?? e?.data?.id;
    if (!id) return;
    this.service.updateGestionRealzza(id, e.data).subscribe({
      error: () => { alert('No se pudo guardar el cambio; se recargará la información.'); this.cargasIniciales(); },
    });
  }
  // Confirmación propia (con título y botones de color) antes de eliminar.
  onRowRemoving(e: any): void {
    const dialog = custom({
      title: 'Eliminar gestión — Realzza',
      messageHtml: '<div style="padding:10px 6px;font-size:15px;color:#1E3A5F;">¿Eliminar esta gestión de forma permanente?</div>',
      buttons: [
        { text: 'Cancelar', type: 'danger', stylingMode: 'contained', onClick: () => false },
        { text: 'Eliminar', type: 'success', stylingMode: 'contained', onClick: () => true },
      ],
    });
    e.cancel = dialog.show().then((confirmado: boolean) => !confirmado);
  }

  onRowRemoved(e: any): void {
    const id = e?.key ?? e?.data?.id;
    if (!id) return;
    this.service.deleteGestionRealzza(id).subscribe({
      error: () => { alert('No se pudo eliminar; se recargará la información.'); this.cargasIniciales(); },
    });
  }

  // Devuelve la fecha dinámica según el motivo
  obtenerFechaInteres(item: any): string {
    const motivo = (item["MOTIVO INTERÉS"] || '').toString().trim().toUpperCase();

    if (motivo === 'VENTA DERIVADA PARA CIERRE A SEDE') {
      return item["FECHA DE INTERÉS DERIVACIÓN"] || '';
    }
    if (motivo === 'CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)') {
      return item["FECHA DE INTERÉS AGENDAMIENTO"] || '';
    }

    return '';
  }

  // Devuelve el comentario adicional según el motivo
  obtenerComentrarioAdicional(item: any): string {
    const motivo = (item["MOTIVO INTERÉS"] || '').toString().trim().toUpperCase();

    if (motivo === 'VENTA DERIVADA PARA CIERRE A SEDE') {
      return item["COMENTARIO ADICIONAL DERIVACIÓN"] || '';
    }
    if (motivo === 'CONSULTARÁ - AGENDAR PARA RESPUESTA (INTERNO)') {
      return item["COMENTARIO ADICIONAL AGENDAMIENTO"] || '';
    }

    return '';
  }

  async ngOnInit() {
    await this.cargasIniciales();
  }

  async cargasIniciales() {
    this.isLoading = true;
    try {
      this.listData = await lastValueFrom(this.service.getSheetDataCampo()); // Google Form campo/realzza

      // 🔹 Calculamos la columna dinámica desde el inicio
      this.listData = this.listData.map(item => ({
        ...item,
        FECHA_INTERES_DINAMICA: this.obtenerFechaInteres(item),
        COMENTARIO_ADICIONAL_DINAMICA: this.obtenerComentrarioAdicional(item)
      }));

      this.dataFiltrada = [...this.listData];
    } catch (error) {
      console.error('Error al cargar los datos:', error);
    } finally {
      this.isLoading = false;
    }
  }

  async aplicarFiltros(): Promise<void> {
    this.isLoading = true;
    try {
      const fechaInicio = this.formGestion.value.fechaInicio;
      const fechaFin = this.formGestion.value.fechaFin;
      const asesor = this.formGestion.value.Asesores;

      if (!fechaInicio || !fechaFin) {
        this.dataFiltrada = [];
        return;
      }

      this.listData = await lastValueFrom(this.service.getSheetDataCampo()); // Google Form campo/realzza

      // 🔹 Aplicamos la misma lógica de fecha dinámica al cargar nueva data
      this.listData = this.listData.map(item => ({
        ...item,
        FECHA_INTERES_DINAMICA: this.obtenerFechaInteres(item),
        COMENTARIO_ADICIONAL_DINAMICA: this.obtenerComentrarioAdicional(item)
      }));

      const desde = new Date(fechaInicio);
      desde.setHours(0, 0, 0, 0);

      const hasta = new Date(fechaFin);
      hasta.setHours(23, 59, 59, 999);

      let datosFiltrados = this.listData.filter(item => {
        const texto = item["Marca temporal"];
        if (!texto) return false;
        const fecha = this.parseMarcaTemporal(texto);
        if (!fecha) return false;
        return fecha >= desde && fecha <= hasta;
      });

      if (asesor) {
        const asesorNombre = this.asesores.find(a => a.value === asesor)?.viewValue?.trim().toUpperCase();
        datosFiltrados = datosFiltrados.filter(item => {
          const asesorEnDato = (item['ASESOR REALZZA'] || '').toString().trim().toUpperCase();
          return asesorEnDato === (asesorNombre || '');
        });
      }

      if (this.filtroDerivacionActivo) {
        const motivosValidos = [
          'VENTA DERIVADA PARA CIERRE A SEDE'
        ].map(x => x.toUpperCase());

        datosFiltrados = datosFiltrados.filter(item =>
          motivosValidos.includes((item["MOTIVO INTERÉS"] || '').toString().trim().toUpperCase())
        );
      }

      this.dataFiltrada = datosFiltrados;
    } catch (error) {
      console.error('Error al aplicar filtros:', error);
      this.dataFiltrada = [];
    } finally {
      this.isLoading = false;
    }
  }

  async filtrarPorFecha() {
    if (this.formGestion.controls['fechaInicio'].invalid || this.formGestion.controls['fechaFin'].invalid) {
      await this.cargasIniciales()
    } else {
      await this.aplicarFiltros();
    }
  }

  async onAsesorChanged(event: any): Promise<void> {
    this.formGestion.patchValue({ Asesores: event.value });
    this.aplicarFiltros();
  }

  exportar(): void {
    if (this.dataGrid) {
      this.excelService.exportarDesdeGrid("dataGestionCampo", this.dataGrid);
    }
  }

  // Parseo robusto de "Marca temporal" (dd/MM/yyyy [HH:mm[:ss]] [AM/PM])
  private parseMarcaTemporal(texto: string): Date | null {
    if (!texto || typeof texto !== 'string') return null;
    const regex = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?/;
    const m = texto.match(regex);
    if (!m) return null;

    let day = parseInt(m[1], 10);
    let month = parseInt(m[2], 10) - 1;
    const year = parseInt(m[3], 10);

    let hour = m[4] ? parseInt(m[4], 10) : 0;
    const minute = m[5] ? parseInt(m[5], 10) : 0;
    const second = m[6] ? parseInt(m[6], 10) : 0;
    const ampm = m[7]?.toUpperCase() ?? null;

    if (ampm) {
      if (ampm === 'PM' && hour < 12) hour += 12;
      if (ampm === 'AM' && hour === 12) hour = 0;
    }

    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;

    const d = new Date(year, month, day, hour, minute, second, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  onCellPrepared(e: any) {
    if (e.rowType === 'header') {
      e.cellElement.style.padding = "8px";
      e.cellElement.style.backgroundColor = "#293964";
      e.cellElement.style.color = "white";
      e.cellElement.style.textAlign = "center";
      e.cellElement.style.fontWeight = "bold";
      e.cellElement.style.whiteSpace = "normal";
      e.cellElement.style.height = "auto";
      e.cellElement.style.border = "1.5px solid black";
    }
  }
}
