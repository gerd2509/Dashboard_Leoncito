import { Component } from '@angular/core';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

@Component({
  selector: 'app-convertidor-excel-csv',
  imports: [],
  templateUrl: './convertidor-excel-csv.component.html',
  styleUrl: './convertidor-excel-csv.component.css'
})
export class ConvertidorExcelCsvComponent {
  onFileChange(evt: Event): void {
    const target = evt.target as HTMLInputElement;

    if (!target.files || target.files.length === 0) {
      return;
    }

    const files: FileList = target.files;

    Array.from(files).forEach((file: File) => {
      const reader: FileReader = new FileReader();

      reader.onload = (e: ProgressEvent<FileReader>) => {
        const arrayBuffer = e.target?.result;
        if (!arrayBuffer) return;

        const data: Uint8Array = new Uint8Array(arrayBuffer as ArrayBuffer);
        const workbook: XLSX.WorkBook = XLSX.read(data, { type: 'array' });

        const sheetName = workbook.SheetNames[0];
        const worksheet: XLSX.WorkSheet = workbook.Sheets[sheetName];

        const jsonData: unknown[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        const csvData: string = jsonData
          .map((row: unknown[]) =>
            row
              .map((cell: unknown) =>
                cell !== null && cell !== undefined
                  ? String(cell).replace(/,/g, '')
                  : ''
              )
              .join(',')
          )
          .join('\n');

        const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
        const fileName = file.name.replace(/\.[^/.]+$/, '') + '.csv';
        saveAs(blob, fileName);
      };

      reader.readAsArrayBuffer(file);
    });

    // Limpia el input por si suben los mismos archivos otra vez
    target.value = '';
  }
}
