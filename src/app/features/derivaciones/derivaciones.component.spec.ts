import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DerivacionesComponent } from './derivaciones.component';

describe('DerivacionesComponent', () => {
  let component: DerivacionesComponent;
  let fixture: ComponentFixture<DerivacionesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DerivacionesComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DerivacionesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
