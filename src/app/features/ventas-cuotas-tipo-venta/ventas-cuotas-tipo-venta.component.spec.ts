import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VentasCuotasTipoVentaComponent } from './ventas-cuotas-tipo-venta.component';

describe('VentasCuotasTipoVentaComponent', () => {
  let component: VentasCuotasTipoVentaComponent;
  let fixture: ComponentFixture<VentasCuotasTipoVentaComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VentasCuotasTipoVentaComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VentasCuotasTipoVentaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
