import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GestionFerrenafeComponent } from './gestion-ferrenafe.component';

describe('GestionFerrenafeComponent', () => {
  let component: GestionFerrenafeComponent;
  let fixture: ComponentFixture<GestionFerrenafeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GestionFerrenafeComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(GestionFerrenafeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
