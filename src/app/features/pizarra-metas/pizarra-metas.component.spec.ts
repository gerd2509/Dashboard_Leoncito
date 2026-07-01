import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PizarraMetasComponent } from './pizarra-metas.component';

describe('PizarraMetasComponent', () => {
  let component: PizarraMetasComponent;
  let fixture: ComponentFixture<PizarraMetasComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PizarraMetasComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PizarraMetasComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
