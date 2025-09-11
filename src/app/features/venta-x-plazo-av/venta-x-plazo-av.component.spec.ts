import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VentaXPlazoAvComponent } from './venta-x-plazo-av.component';

describe('VentaXPlazoAvComponent', () => {
  let component: VentaXPlazoAvComponent;
  let fixture: ComponentFixture<VentaXPlazoAvComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VentaXPlazoAvComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VentaXPlazoAvComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
