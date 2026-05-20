import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ComparativoVentasComponent } from './comparativo-ventas.component';

describe('ComparativoVentasComponent', () => {
  let component: ComparativoVentasComponent;
  let fixture: ComponentFixture<ComparativoVentasComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ComparativoVentasComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ComparativoVentasComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
