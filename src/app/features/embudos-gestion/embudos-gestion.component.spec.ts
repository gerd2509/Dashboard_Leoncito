import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';

import { EmbudosGestionComponent } from './embudos-gestion.component';

describe('EmbudosGestionComponent', () => {
  let component: EmbudosGestionComponent;
  let fixture: ComponentFixture<EmbudosGestionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmbudosGestionComponent, HttpClientTestingModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EmbudosGestionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
