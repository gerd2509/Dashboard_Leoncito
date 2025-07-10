import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AnalisisGestionMensualComponent } from './analisis-gestion-mensual.component';

describe('AnalisisGestionMensualComponent', () => {
  let component: AnalisisGestionMensualComponent;
  let fixture: ComponentFixture<AnalisisGestionMensualComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnalisisGestionMensualComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AnalisisGestionMensualComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
