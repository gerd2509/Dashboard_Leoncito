import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';

import { RegistroGestionComponent } from './registro-gestion.component';

describe('RegistroGestionComponent', () => {
  let component: RegistroGestionComponent;
  let fixture: ComponentFixture<RegistroGestionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RegistroGestionComponent, HttpClientTestingModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RegistroGestionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
