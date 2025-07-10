import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CierreGestionComponent } from './cierre-gestion.component';

describe('CierreGestionComponent', () => {
  let component: CierreGestionComponent;
  let fixture: ComponentFixture<CierreGestionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CierreGestionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CierreGestionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
