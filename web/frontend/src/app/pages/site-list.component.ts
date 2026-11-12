import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SiCardComponent } from '@siemens/element-ng/card';
import { SiContentActionBarComponent } from '@siemens/element-ng/content-action-bar';
import type { ContentActionBarMainItem } from '@siemens/element-ng/content-action-bar';
import { SiEmptyStateComponent } from '@siemens/element-ng/empty-state';
import { SiSearchBarComponent } from '@siemens/element-ng/search-bar';

import { ApiService } from '../shared/api.service';
import { PageComponent } from '../shared/page.component';
import { Site } from '../shared/models';

const STATUS_BADGE: Record<string, string> = {
  approved: 'bg-success',
  failed: 'bg-danger',
  draft: 'bg-secondary',
  queued: 'bg-warning',
  reviewing: 'bg-warning'
};

const CRITICALITY_BADGE: Record<string, string> = {
  high: 'bg-danger',
  medium: 'bg-caution',
  low: 'bg-success'
};

@Component({
  selector: 'app-site-list',
  imports: [
    RouterLink,
    DatePipe,
    PageComponent,
    SiCardComponent,
    SiContentActionBarComponent,
    SiEmptyStateComponent,
    SiSearchBarComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page
      heading="Asset register"
      subtitle="All OT sites known to the regional operations centre."
    >
      <si-content-action-bar actions class="si-layout-actions" viewType="expanded" [primaryActions]="actions" />

      <si-card heading="Sites" [subHeading]="summary()">
        <div body class="p-5">
          <si-search-bar
            class="mb-5"
            placeholder="Filter by name, operator or identifier"
            colorVariant="base-0"
            [showIcon]="true"
            (searchChange)="filter.set($event)"
          />

          @if (filtered().length) {
            <div class="table-responsive">
              <table class="table table-hover align-middle">
                <thead>
                  <tr>
                    <th scope="col">Identifier</th>
                    <th scope="col">Site</th>
                    <th scope="col">Type</th>
                    <th scope="col">Criticality</th>
                    <th scope="col">Operator</th>
                    <th scope="col">Validation</th>
                    <th scope="col">Registered</th>
                  </tr>
                </thead>
                <tbody>
                  @for (site of filtered(); track site.id) {
                    <tr>
                      <td class="text-nowrap">
                        <a class="focus-inside" [routerLink]="['/sites', site.id]">{{ site.id }}</a>
                      </td>
                      <td class="site-name">
                        <div class="d-flex align-items-center gap-3">
                          <div class="text-truncate">{{ site.name }}</div>
                          @if (site.restricted) {
                            <span class="badge bg-caution">restricted</span>
                          }
                        </div>
                        @if (site.description) {
                          <div class="si-caption text-secondary text-truncate">
                            {{ site.description }}
                          </div>
                        }
                      </td>
                      <td class="text-nowrap">{{ site.assetType }}</td>
                      <td>
                        <span class="badge" [class]="criticalityBadge(site)">
                          {{ site.criticality }}
                        </span>
                      </td>
                      <td class="text-nowrap">{{ site.operator }}</td>
                      <td>
                        <span class="badge" [class]="statusBadge(site)">{{ site.review.status }}</span>
                      </td>
                      <td class="text-nowrap">{{ site.createdAt | date: 'short' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <si-empty-state
              icon="element-list"
              heading="No matching sites"
              content="Adjust the filter or register a new site."
            />
          }
        </div>
      </si-card>
    </app-page>
  `,
  styles: `
    .site-name {
      max-inline-size: 420px;
    }
  `
})
export class SiteListComponent {
  private readonly api = inject(ApiService);

  protected readonly sites = signal<Site[]>([]);
  protected readonly filter = signal('');

  protected readonly filtered = computed(() => {
    const needle = this.filter().trim().toLowerCase();
    if (!needle) {
      return this.sites();
    }
    return this.sites().filter(site =>
      [site.id, site.name, site.operator, site.assetType, site.description]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  });

  protected readonly summary = computed(
    () => `${this.filtered().length} of ${this.sites().length} sites`
  );

  protected readonly actions: ContentActionBarMainItem[] = [
    { type: 'router-link', label: 'Register site', icon: 'element-plus', routerLink: '/register' },
    { type: 'router-link', label: 'Map view', icon: 'element-map', routerLink: '/' }
  ];

  constructor() {
    this.api.listSites().subscribe(sites => this.sites.set(sites));
  }

  protected statusBadge(site: Site): string {
    return STATUS_BADGE[site.review.status] ?? 'bg-secondary';
  }

  protected criticalityBadge(site: Site): string {
    return CRITICALITY_BADGE[site.criticality] ?? 'bg-secondary';
  }
}
