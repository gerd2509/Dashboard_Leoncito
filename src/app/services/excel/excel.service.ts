import { Injectable } from '@angular/core';
import { Workbook } from 'exceljs';
import * as FileSaver from 'file-saver';
import { DxDataGridComponent } from 'devextreme-angular/ui/data-grid';

@Injectable({
  providedIn: 'root'
})
export class ExcelExportService {
  constructor() { }

  /**
   * Exporta los datos visibles de un DxDataGrid a un archivo Excel.
   * @param nombreArchivo Nombre del archivo sin extensión
   * @param dataGrid Instancia de DxDataGridComponent
   */
  async exportarDesdeGrid(nombreArchivo: string, dataGrid: DxDataGridComponent): Promise<void> {
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet(nombreArchivo);

    // Obtener columnas visibles del grid
    const columnas = dataGrid.instance.getVisibleColumns();
    const encabezados = columnas.map(col => col.caption || col.dataField || '');
    worksheet.addRow(encabezados);

    // Obtener los datos filtrados sin paginación
    const store = dataGrid.instance.getDataSource().store();
    const loadOptions = { filter: dataGrid.instance.getCombinedFilter() };
    const result = await store.load(loadOptions);

    // Validación segura del tipo de resultado
    let datos: any[] = [];

    if (Array.isArray(result)) {
      datos = result;
    } else if (
      result &&
      typeof result === 'object' &&
      'data' in result &&
      Array.isArray((result as any).data)
    ) {
      datos = (result as any).data;
    }

    // Agregar filas al Excel
    datos.forEach(item => {
      const fila = columnas.map(col => col.dataField ? item[col.dataField] : '');
      worksheet.addRow(fila);
    });

    // Ajustar ancho de columnas automáticamente
    worksheet.columns.forEach(col => {
      if (!col || !col.values) return;

      const lengths = col.values
        .filter(v => v != null)
        .map(v => v.toString().length + 2);

      col.width = lengths.length > 0 ? Math.max(12, ...lengths) : 12;
    });

    // Exportar el archivo
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    FileSaver.saveAs(blob, `${nombreArchivo}.xlsx`);
  }
}
