import { Injectable, inject, signal } from '@angular/core';
import { SiThemeService } from '@siemens/element-ng/theme';

const STORAGE_KEY = 'gridops-appearance';

/**
 * Thin wrapper around the Element theme service. Instantiated by the root
 * component so that every screen -- including the sign-in landing page, which
 * is rendered outside the application frame -- gets the same color scheme.
 */
@Injectable({ providedIn: 'root' })
export class AppearanceService {
  private readonly theme = inject(SiThemeService);

  readonly darkMode = signal(true);

  constructor() {
    this.darkMode.set(this.read() !== 'light');
    this.apply();
  }

  toggle(): void {
    this.darkMode.update(value => !value);
    try {
      localStorage.setItem(STORAGE_KEY, this.darkMode() ? 'dark' : 'light');
    } catch {
      /* private mode -- the choice simply is not remembered */
    }
    this.apply();
  }

  private apply(): void {
    this.theme.applyThemeType(this.darkMode() ? 'dark' : 'light');
  }

  private read(): string | null {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }
}
