import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AgendamientosCampoComponent } from './agendamientos-campo.component';

describe('AgendamientosCampoComponent', () => {
  let component: AgendamientosCampoComponent;
  let fixture: ComponentFixture<AgendamientosCampoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgendamientosCampoComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AgendamientosCampoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
