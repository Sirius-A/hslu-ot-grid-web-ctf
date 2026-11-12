import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SiCardComponent } from '@siemens/element-ng/card';
import { SiContentActionBarComponent } from '@siemens/element-ng/content-action-bar';
import type { ContentActionBarMainItem } from '@siemens/element-ng/content-action-bar';
import { SiEmptyStateComponent } from '@siemens/element-ng/empty-state';
import { SiInlineNotificationComponent } from '@siemens/element-ng/inline-notification';
import { SiStatusBarComponent } from '@siemens/element-ng/status-bar';
import type { StatusBarItem } from '@siemens/element-ng/status-bar';

import { ApiService } from '../shared/api.service';
import { PageComponent } from '../shared/page.component';
import { AdminOverview } from '../shared/models';

@Component({
  selector: 'app-admin',
  imports: [
    RouterLink,
    DatePipe,
    PageComponent,
    SiCardComponent,
    SiContentActionBarComponent,
    SiEmptyStateComponent,
    SiInlineNotificationComponent,
    SiStatusBarComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page heading="Supervisor desk" [subtitle]="subtitle()">
      @if (overview()) {
        <si-content-action-bar actions class="si-layout-actions" viewType="expanded" [primaryActions]="actions" />
      }

      @if (overview(); as data) {
        <si-status-bar class="si-layout-status d-block mb-6" [items]="statusItems()" />

        <div class="row g-6">
          <div class="col-12 col-xl-6">
            <si-card
              heading="Emergency breaker override"
              [subHeading]="'Signed in as ' + data.supervisor"
            >
              <div body class="p-7">
                <si-inline-notification
                  class="d-block mb-5"
                  severity="critical"
                  heading="Restricted credential"
                  message="This key authorises manual breaker operation on every substation in the region."
                />
                <div class="flag-box">{{ data.emergencyOverrideKey }}</div>
              </div>
            </si-card>
          </div>

          <div class="col-12 col-xl-6">
            <si-card heading="Central control system" subHeading="Regional load dispatch centre">
              <div body class="p-7">
                @if (data.controlSystem.enabled) {
                  <dl class="kv-grid si-body-2">
                    <dt>Asset record</dt>
                    <dd>
                      <a [routerLink]="['/sites', data.controlSystem.siteId]">
                        {{ data.controlSystem.siteId }}
                      </a>
                    </dd>
                    <dt>Console</dt>
                    <dd>
                      <code>{{ data.controlSystem.url }}</code>
                    </dd>
                  </dl>
                  <p class="si-body-2 text-secondary mt-5 mb-0">{{ data.controlSystem.note }}</p>
                  <a
                    class="btn btn-secondary mt-6"
                    [routerLink]="['/sites', data.controlSystem.siteId]"
                  >
                    Open asset record
                  </a>
                } @else {
                  <si-inline-notification
                    class="d-block"
                    severity="info"
                    heading="Not deployed"
                    [message]="data.controlSystem.note"
                  />
                }
              </div>
            </si-card>
          </div>

          <div class="col-12">
            <si-card heading="Review queue" [subHeading]="queueSubtitle()">
              <div body class="p-5">
                @if (data.pending.length) {
                  <div class="table-responsive">
                    <table class="table table-hover align-middle">
                      <thead>
                        <tr>
                          <th scope="col">Identifier</th>
                          <th scope="col">Requested</th>
                          <th scope="col" class="text-end">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (item of data.pending; track item.id) {
                          <tr>
                            <td class="text-nowrap">{{ item.id }}</td>
                            <td class="text-nowrap">{{ item.requestedAt | date: 'medium' }}</td>
                            <td class="text-end">
                              <a
                                class="btn btn-secondary btn-sm"
                                [routerLink]="['/admin/review', item.id]"
                              >
                                Open review map
                              </a>
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                } @else {
                  <si-empty-state
                    icon="element-checked"
                    heading="Queue empty"
                    content="No registrations are waiting for validation."
                  />
                }
              </div>
            </si-card>
          </div>
        </div>
      } @else if (denied()) {
        <div class="row justify-content-center">
          <div class="col-12 col-md-7">
            <si-card heading="Supervisor session required">
              <div body class="p-7">
                <si-empty-state
                  icon="element-lock"
                  heading="Not signed in"
                  content="Open the supervisor desk with an operations account."
                />
                <div class="text-center mt-6">
                  <a class="btn btn-primary" routerLink="/admin/login">Go to sign in</a>
                </div>
              </div>
            </si-card>
          </div>
        </div>
      }
    </app-page>
  `
})
export class AdminComponent {
  private readonly api = inject(ApiService);

  protected readonly overview = signal<AdminOverview | undefined>(undefined);
  protected readonly denied = signal(false);

  protected readonly subtitle = computed(() =>
    this.overview()
      ? 'Validation queue and restricted operations credentials.'
      : 'Restricted area of the regional asset portal.'
  );
  protected readonly statusItems = computed<StatusBarItem[]>(() => {
    const data = this.overview();
    return [
      { title: 'Registered sites', value: data?.totalSites ?? 0, status: 'info' },
      { title: 'Waiting for review', value: data?.queueLength ?? 0, status: 'caution' },
      {
        title: 'Validated',
        value: (data?.totalSites ?? 0) - (data?.pending.length ?? 0),
        status: 'success'
      }
    ];
  });

  protected readonly queueSubtitle = computed(() => {
    const count = this.overview()?.pending.length ?? 0;
    return count === 1 ? '1 registration waiting' : `${count} registrations waiting`;
  });

  protected readonly actions: ContentActionBarMainItem[] = [
    {
      type: 'action',
      label: 'Refresh',
      icon: 'element-refresh',
      action: () => this.load()
    },
    {
      type: 'action',
      label: 'Sign out',
      icon: 'element-logout',
      action: () => this.logout()
    }
  ];

  constructor() {
    this.load();
  }

  protected load(): void {
    this.api.adminOverview().subscribe({
      next: data => {
        this.overview.set(data);
        this.denied.set(false);
      },
      error: () => {
        this.overview.set(undefined);
        this.denied.set(true);
      }
    });
  }

  protected logout(): void {
    this.api.adminLogout().subscribe(() => {
      this.overview.set(undefined);
      this.denied.set(true);
    });
  }
}
