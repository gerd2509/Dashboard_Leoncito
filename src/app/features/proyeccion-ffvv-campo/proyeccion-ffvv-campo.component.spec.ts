import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ProyeccionFfvvCampoComponent } from './proyeccion-ffvv-campo.component';

describe('ProyeccionFfvvCampoComponent', () => {
  let component: ProyeccionFfvvCampoComponent;
  let fixture: ComponentFixture<ProyeccionFfvvCampoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProyeccionFfvvCampoComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ProyeccionFfvvCampoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
