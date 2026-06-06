import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SheetsService {
  // 1. Defines la ruta base de tu API en Render (descomentas y usas tu línea 18)
  private baseUrl = 'https://api-leoncito.onrender.com/data';

  // Si algún día quieres probar en local otra vez, solo comentas la de arriba y descomentas esta:
  // private baseUrl = 'http://localhost:3000/data';
  //cambios

  // 2. Armas las rutas concatenando la base con el endpoint específico
  private apiUrlCall = `${this.baseUrl}/call`;
  private apiUrlCampo = `${this.baseUrl}/campo`;
  private apiUrlPostVenta = `${this.baseUrl}/postVenta`;
  private apiUrlpvCobranza = `${this.baseUrl}/pvCobranza`;
  private apiUrlpvControlInterno = `${this.baseUrl}/pvControlInterno`;
  private apiUrlpvCreditos = `${this.baseUrl}/pvCreditos`;
  private apiUrlpvLogistica = `${this.baseUrl}/pvLogistica`;
  private apiUrlpvOperaciones = `${this.baseUrl}/pvOperaciones`;
  private apiUrlpvServicioTecnico = `${this.baseUrl}/pvServicioTecnico`;
  private apiUrlpvVentas = `${this.baseUrl}/pvVentas`;
  private apiUrlKOMMO = `${this.baseUrl}/kommo`;
  private apiUrlFerre = `${this.baseUrl}/ferre`; // formulario de gestión de Ferreñafe
  private apiUrlSedes = `${this.baseUrl}/sedes`;

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

  getSheetDataBySede(endpointKey: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/${endpointKey}`);
  }

  // 🏬 Sheet unificado de gestión de todas las sedes
  getSheetDataSedes(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlSedes);
  }

  // 📞 Formulario de gestión de Ferreñafe (contacto / no contacto)
  getSheetDataFerre(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrlFerre);
  }
}
