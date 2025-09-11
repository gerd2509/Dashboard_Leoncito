import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VentasCampoComponent } from './ventas-campo.component';

describe('VentasCampoComponent', () => {
  let component: VentasCampoComponent;
  let fixture: ComponentFixture<VentasCampoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VentasCampoComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VentasCampoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
