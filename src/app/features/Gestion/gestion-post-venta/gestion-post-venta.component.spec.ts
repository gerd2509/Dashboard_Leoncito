import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GestionPostVentaComponent } from './gestion-post-venta.component';

describe('GestionPostVentaComponent', () => {
  let component: GestionPostVentaComponent;
  let fixture: ComponentFixture<GestionPostVentaComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GestionPostVentaComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GestionPostVentaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
