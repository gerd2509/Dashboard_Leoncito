import { TestBed } from '@angular/core/testing';

import { ServiceGoogleService } from './service-google.service';

describe('ServiceGoogleService', () => {
  let service: ServiceGoogleService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ServiceGoogleService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
