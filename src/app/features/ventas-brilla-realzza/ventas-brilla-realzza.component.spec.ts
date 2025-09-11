import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VentasBrillaRealzzaComponent } from './ventas-brilla-realzza.component';

describe('VentasBrillaRealzzaComponent', () => {
  let component: VentasBrillaRealzzaComponent;
  let fixture: ComponentFixture<VentasBrillaRealzzaComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VentasBrillaRealzzaComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VentasBrillaRealzzaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
