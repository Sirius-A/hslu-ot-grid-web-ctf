import { ApplicationConfig } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { SI_COPYRIGHT_DETAILS } from '@siemens/element-ng/copyright-notice';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    provideHttpClient(withFetch()),
    {
      provide: SI_COPYRIGHT_DETAILS,
      useValue: { startYear: 2019, lastUpdateYear: new Date().getFullYear(), company: 'Regional Grid North' }
    }
  ]
};
