import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConvertidorExcelCsvComponent } from './convertidor-excel-csv.component';

describe('ConvertidorExcelCsvComponent', () => {
  let component: ConvertidorExcelCsvComponent;
  let fixture: ComponentFixture<ConvertidorExcelCsvComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConvertidorExcelCsvComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ConvertidorExcelCsvComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
