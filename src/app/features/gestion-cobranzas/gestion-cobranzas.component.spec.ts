import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GestionCobranzasComponent } from './gestion-cobranzas.component';

describe('GestionCobranzasComponent', () => {
  let component: GestionCobranzasComponent;
  let fixture: ComponentFixture<GestionCobranzasComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GestionCobranzasComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GestionCobranzasComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
