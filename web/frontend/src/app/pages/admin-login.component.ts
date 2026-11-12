import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  SiLandingPageComponent,
  SiLoginBasicComponent
} from '@siemens/element-ng/landing-page';
import type { AlertConfig, UsernamePassword } from '@siemens/element-ng/landing-page';
import type { Link } from '@siemens/element-ng/link';

import { ApiService } from '../shared/api.service';

/**
 * Supervisor sign-in, built on the Element landing page layout. Rendered
 * outside the application frame, like every Element authentication screen.
 */
@Component({
  selector: 'app-admin-login',
  imports: [SiLandingPageComponent, SiLoginBasicComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <si-landing-page
      heading="GridOps"
      subheading="Regional Asset Portal"
      subtitle="Sign in with your regional operations account."
      [version]="version()"
      [links]="links"
      [loginAlert]="alert()"
      [announcement]="announcement"
    >
      <si-login-basic
        usernameLabel="Operations account"
        loginButtonLabel="Sign in"
        [loading]="busy()"
        (login)="submit($event)"
      />
    </si-landing-page>
  `,
  styles: `
    /*
     * si-login-basic 49.16.0 always renders its "forgot password" and
     * "register now" links, even when no link is configured. The portal has
     * neither self-service, so they are hidden.
     */
    :host ::ng-deep si-login-basic form > .login-basic-second-step--container a,
    :host ::ng-deep si-login-basic > .si-body {
      display: none;
    }
  `
})
export class AdminLoginComponent {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  protected readonly busy = signal(false);
  protected readonly alert = signal<AlertConfig | undefined>(undefined);
  protected readonly version = computed(() => this.api.config()?.appVersion);

  protected readonly links: Link[] = [{ title: 'About & open source', link: '/about' }];
  protected readonly announcement: AlertConfig = {
    severity: 'info',
    heading: 'Training environment',
    message: 'Isolated lab instance. Do not use production credentials.'
  };

  protected submit(credentials: UsernamePassword): void {
    this.alert.set(undefined);
    this.busy.set(true);
    this.api.adminLogin(credentials.username ?? '', credentials.password ?? '').subscribe({
      next: () => {
        this.busy.set(false);
        this.router.navigate(['/admin']);
      },
      error: err => {
        this.busy.set(false);
        this.alert.set({
          severity: 'danger',
          heading: 'Sign in failed',
          message: err?.error?.error ?? 'Unexpected error.'
        });
      }
    });
  }
}
