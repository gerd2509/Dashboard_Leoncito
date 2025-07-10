import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProyeccionComparativoComponent } from './proyeccion-comparativo.component';

describe('ProyeccionComparativoComponent', () => {
  let component: ProyeccionComparativoComponent;
  let fixture: ComponentFixture<ProyeccionComparativoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProyeccionComparativoComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ProyeccionComparativoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
