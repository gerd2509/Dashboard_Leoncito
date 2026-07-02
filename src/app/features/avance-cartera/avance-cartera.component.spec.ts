import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';

import { AvanceCarteraComponent } from './avance-cartera.component';

describe('AvanceCarteraComponent', () => {
  let component: AvanceCarteraComponent;
  let fixture: ComponentFixture<AvanceCarteraComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AvanceCarteraComponent, HttpClientTestingModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AvanceCarteraComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
