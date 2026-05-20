import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GestionKommoComponent } from './gestion-kommo.component';

describe('GestionKommoComponent', () => {
  let component: GestionKommoComponent;
  let fixture: ComponentFixture<GestionKommoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GestionKommoComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GestionKommoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
