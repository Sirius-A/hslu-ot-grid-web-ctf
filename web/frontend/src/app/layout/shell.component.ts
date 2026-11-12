import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import type { Link } from '@siemens/element-ng/link';
import {
  SiAccountDetailsComponent,
  SiApplicationHeaderComponent,
  SiHeaderAccountItemComponent,
  SiHeaderActionItemComponent,
  SiHeaderActionsDirective,
  SiHeaderBrandDirective,
  SiHeaderCollapsibleActionsComponent,
  SiHeaderLogoDirective,
  SiLaunchpadFactoryComponent
} from '@siemens/element-ng/application-header';
import type { App } from '@siemens/element-ng/application-header';
import { SiFooterComponent } from '@siemens/element-ng/footer';
import {
  SiHeaderDropdownComponent,
  SiHeaderDropdownItemComponent,
  SiHeaderDropdownTriggerDirective
} from '@siemens/element-ng/header-dropdown';
import { SiNavbarVerticalComponent } from '@siemens/element-ng/navbar-vertical';
import type { NavbarVerticalItem } from '@siemens/element-ng/navbar-vertical';
import { ApiService } from '../shared/api.service';
import { AppearanceService } from '../shared/appearance.service';

/**
 * Application frame: Element application header, vertical navigation and
 * footer. Every routed page of the portal is rendered inside the navbar's
 * `si-layout-inner` main area.
 */
@Component({
  selector: 'app-shell',
  imports: [
    RouterLink,
    RouterOutlet,
    SiAccountDetailsComponent,
    SiApplicationHeaderComponent,
    SiHeaderAccountItemComponent,
    SiHeaderActionItemComponent,
    SiHeaderActionsDirective,
    SiHeaderBrandDirective,
    SiHeaderCollapsibleActionsComponent,
    SiHeaderLogoDirective,
    SiHeaderDropdownComponent,
    SiHeaderDropdownItemComponent,
    SiHeaderDropdownTriggerDirective,
    SiLaunchpadFactoryComponent,
    SiNavbarVerticalComponent,
    SiFooterComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'has-application-header' },
  template: `
    <si-application-header class="app-header" [launchpad]="launchpad">
      <si-header-brand>
        <a class="header-logo focus-inside" routerLink="/" siHeaderLogo></a>
        <span class="application-name text-truncate">{{ appName() }}</span>
      </si-header-brand>

      <si-header-actions>
        <si-header-collapsible-actions>
          <button
            type="button"
            si-header-action-item
            [icon]="darkMode() ? 'element-sun' : 'element-darker'"
            (click)="toggleTheme()"
          >
            {{ darkMode() ? 'Light appearance' : 'Dark appearance' }}
          </button>
          <a si-header-action-item icon="element-info" routerLink="/about">About</a>
        </si-header-collapsible-actions>

        <button
          type="button"
          si-header-account-item
          [name]="accountName()"
          [siHeaderDropdownTriggerFor]="accountMenu"
        ></button>
      </si-header-actions>
    </si-application-header>

    <ng-template #accountMenu>
      <si-header-dropdown>
        <si-account-details
          [name]="accountName()"
          company="Regional Grid North"
          [userRole]="accountRole()"
        />
        @if (isSupervisor()) {
          <a si-header-dropdown-item icon="element-key" routerLink="/admin">Supervisor dashboard</a>
          <button si-header-dropdown-item icon="element-logout" (click)="signOut()">Sign out</button>
        } @else {
          <a si-header-dropdown-item icon="element-login" routerLink="/admin/login">
            Supervisor sign in
          </a>
        }
        <a si-header-dropdown-item icon="element-info" routerLink="/about">About this application</a>
      </si-header-dropdown>
    </ng-template>

    <ng-template #launchpad>
      <si-launchpad-factory
        titleText="GridOps modules"
        subtitleText="Regional operations landscape"
        [apps]="apps"
      />
    </ng-template>

    <si-navbar-vertical [items]="navItems()">
      <div class="app-main">
        <router-outlet />
      </div>
      <si-footer class="app-footer" [copyright]="copyright" [links]="footerLinks" />
    </si-navbar-vertical>
  `,
  styles: `
    :host {
      display: block;
    }

    .application-name {
      max-inline-size: 60vw;
    }

    .app-main {
      min-block-size: calc(100vh - 160px);
    }
  `
})
export class ShellComponent {
  private readonly api = inject(ApiService);
  private readonly appearance = inject(AppearanceService);

  protected readonly darkMode = this.appearance.darkMode;
  /** The brand wordmark already reads "GridOps", so the header shows the module name only. */
  protected readonly appName = computed(() =>
    (this.api.config()?.appName ?? 'GridOps Regional Asset Portal').replace(/^GridOps\s+/, '')
  );
  protected readonly isSupervisor = computed(() => this.api.role() === 'admin');
  protected readonly accountName = computed(() =>
    this.isSupervisor() ? 'Duty supervisor' : 'Guest operator'
  );
  protected readonly accountRole = computed(() =>
    this.isSupervisor() ? 'Operations supervisor' : 'Read-only / field service'
  );

  protected readonly copyright = 'Regional Grid North';
  protected readonly footerLinks: Link[] = [{ title: 'About & open source', link: '/about' }];

  protected readonly apps: App[] = [
    {
      type: 'router-link',
      name: 'Asset Portal',
      systemName: 'GridOps',
      iconClass: 'element-plant',
      routerLink: '/',
      favorite: true
    },
    {
      type: 'router-link',
      name: 'Asset Register',
      systemName: 'GridOps',
      iconClass: 'element-list',
      routerLink: '/sites'
    },
    {
      type: 'router-link',
      name: 'Supervisor Desk',
      systemName: 'GridOps',
      iconClass: 'element-key',
      routerLink: '/admin'
    }
  ];

  protected readonly navItems = computed<NavbarVerticalItem[]>(() => [
    { type: 'header', label: 'Operations' },
    {
      type: 'router-link',
      label: 'Overview',
      icon: 'element-dashboard',
      routerLink: '/',
      activeMatchOptions: { exact: true }
    },
    { type: 'router-link', label: 'Asset register', icon: 'element-list', routerLink: '/sites' },
    { type: 'divider' },
    { type: 'header', label: 'Administration' },
    {
      type: 'router-link',
      label: 'Supervisor desk',
      icon: 'element-key',
      routerLink: '/admin'
    },
    { type: 'router-link', label: 'About', icon: 'element-info', routerLink: '/about' }
  ]);

  protected toggleTheme(): void {
    this.appearance.toggle();
  }

  protected signOut(): void {
    this.api.adminLogout().subscribe({ error: () => undefined });
  }
}
