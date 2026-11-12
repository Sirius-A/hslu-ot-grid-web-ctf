import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { ApiService } from './shared/api.service';
import { AppearanceService } from './shared/appearance.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet />`
})
export class AppComponent {
  private readonly api = inject(ApiService);

  constructor() {
    // Instantiated here so the color scheme is applied on every route,
    // including the sign-in page which renders without the app frame.
    inject(AppearanceService);
    this.api.loadConfig().subscribe({ error: () => undefined });
    this.api.loadSession().subscribe({ error: () => undefined });
  }
}
