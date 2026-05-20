import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EvolucionTipoClienteComponent } from './evolucion-tipo-cliente.component';

describe('EvolucionTipoClienteComponent', () => {
  let component: EvolucionTipoClienteComponent;
  let fixture: ComponentFixture<EvolucionTipoClienteComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EvolucionTipoClienteComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EvolucionTipoClienteComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
