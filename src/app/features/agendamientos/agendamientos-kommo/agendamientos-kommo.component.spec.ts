import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AgendamientosKommoComponent } from './agendamientos-kommo.component';

describe('AgendamientosKommoComponent', () => {
  let component: AgendamientosKommoComponent;
  let fixture: ComponentFixture<AgendamientosKommoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgendamientosKommoComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AgendamientosKommoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
