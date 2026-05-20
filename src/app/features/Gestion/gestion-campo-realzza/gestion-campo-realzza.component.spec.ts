import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GestionCampoRealzzaComponent } from './gestion-campo-realzza.component';

describe('GestionCampoRealzzaComponent', () => {
  let component: GestionCampoRealzzaComponent;
  let fixture: ComponentFixture<GestionCampoRealzzaComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GestionCampoRealzzaComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GestionCampoRealzzaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
