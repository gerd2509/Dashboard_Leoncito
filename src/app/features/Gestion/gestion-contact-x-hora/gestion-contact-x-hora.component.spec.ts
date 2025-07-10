import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GestionContactXHoraComponent } from './gestion-contact-x-hora.component';

describe('GestionContactXHoraComponent', () => {
  let component: GestionContactXHoraComponent;
  let fixture: ComponentFixture<GestionContactXHoraComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GestionContactXHoraComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GestionContactXHoraComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
