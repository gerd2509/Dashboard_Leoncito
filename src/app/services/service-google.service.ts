import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SheetsService {
  private apiUrlCall = 'http://localhost:3000/data/call';
  private apiUrlCampo = 'http://localhost:3000/data/campo';
  private apiUrlPostVenta = 'http://localhost:3000/data/postVenta';
  private apiUrlpvCobranza = 'http://localhost:3000/data/pvCobranza';
  private apiUrlpvControlInterno = 'http://localhost:3000/data/pvControlInterno';
  private apiUrlpvCreditos = 'http://localhost:3000/data/pvCreditos';
  private apiUrlpvLogistica = 'http://localhost:3000/data/pvLogistica';
  private apiUrlpvOperaciones = 'http://localhost:3000/data/pvOperaciones';
  private apiUrlpvServicioTecnico = 'http://localhost:3000/data/pvServicioTecnico';
  private apiUrlpvVentas = 'http://localhost:3000/data/pvVentas';
  private apiUrlKOMMO = 'http://localhost:3000/data/kommo';
  // private apiUrl = 'https://api-leoncito.onrender.com/data'; 

  constructor(private http: HttpClient) { }

  getSheetData(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlCall);
  }

  getSheetDataCampo(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlCampo);
  }
  
  getSheetDataPostVenta(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlPostVenta);
  }

  getSheetDataPcCobranza(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlpvCobranza);
  }

  getSheetDataPcControlInterno(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlpvControlInterno);
  }

  getSheetDataPcCreditos(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlpvCreditos);
  }

  getSheetDataPcLogistica(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlpvLogistica);
  }

  getSheetDataPcOperaciones(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlpvOperaciones);
  }

  getSheetDataPcServicioTecnico(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlpvServicioTecnico);
  }

  getSheetDataPcVentas(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlpvVentas);
  }

  getSheetKOMMO(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlKOMMO);
  }
}
