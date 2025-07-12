import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class SheetsService {
  // private apiUrl = 'http://localhost:3000/data';
  private apiUrl = 'https://api-leoncito.onrender.com/data'; 

  constructor(private http: HttpClient) { }

  getSheetData(): Observable<any[]> {
    return this.http.get<any[]>(this.apiUrl);
  }
}
