import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VentasSedesComponent } from './ventas-sedes.component';

describe('VentasSedesComponent', () => {
  let component: VentasSedesComponent;
  let fixture: ComponentFixture<VentasSedesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VentasSedesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VentasSedesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
