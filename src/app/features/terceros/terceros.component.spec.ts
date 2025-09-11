import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TercerosComponent } from './terceros.component';

describe('TercerosComponent', () => {
  let component: TercerosComponent;
  let fixture: ComponentFixture<TercerosComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TercerosComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TercerosComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
