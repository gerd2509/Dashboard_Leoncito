import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';

import { LimpiezaBbddComponent } from './limpieza-bbdd.component';

describe('LimpiezaBbddComponent', () => {
  let component: LimpiezaBbddComponent;
  let fixture: ComponentFixture<LimpiezaBbddComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LimpiezaBbddComponent, HttpClientTestingModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LimpiezaBbddComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
