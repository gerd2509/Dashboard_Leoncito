import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PostVentaComponent } from './post-venta.component';

describe('PostVentaComponent', () => {
  let component: PostVentaComponent;
  let fixture: ComponentFixture<PostVentaComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PostVentaComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PostVentaComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
