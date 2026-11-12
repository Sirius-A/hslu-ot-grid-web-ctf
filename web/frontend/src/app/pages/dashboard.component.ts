import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SiCardComponent } from '@siemens/element-ng/card';
import { SiContentActionBarComponent } from '@siemens/element-ng/content-action-bar';
import type { ContentActionBarMainItem } from '@siemens/element-ng/content-action-bar';
import { SiEmptyStateComponent } from '@siemens/element-ng/empty-state';
import { SiSummaryWidgetComponent } from '@siemens/element-ng/summary-widget';

import { ApiService } from '../shared/api.service';
import { AssetMapComponent } from '../shared/asset-map.component';
import { PageComponent } from '../shared/page.component';
import { Site } from '../shared/models';

@Component({
  selector: 'app-dashboard',
  imports: [
    RouterLink,
    DatePipe,
    PageComponent,
    SiCardComponent,
    SiContentActionBarComponent,
    SiEmptyStateComponent,
    SiSummaryWidgetComponent,
    AssetMapComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page
      heading="Operations overview"
      subtitle="Registered OT assets of the regional distribution grid."
    >
      <si-content-action-bar actions class="si-layout-actions" viewType="expanded" [primaryActions]="actions" />

      <div class="row g-6 mb-6">
        <div class="col-6 col-xl-3">
          <si-summary-widget
            icon="element-plant"
            color="status-info"
            label="Registered assets"
            value="{{ sites().length }}"
            readonly
          />
        </div>
        <div class="col-6 col-xl-3">
          <si-summary-widget
            status="success"
            label="Validated"
            value="{{ countByStatus('approved') }}"
            readonly
          />
        </div>
        <div class="col-6 col-xl-3">
          <si-summary-widget
            status="caution"
            label="Awaiting supervisor"
            value="{{ pendingCount() }}"
            readonly
          />
        </div>
        <div class="col-6 col-xl-3">
          <si-summary-widget
            icon="element-substation"
            color="status-danger"
            label="High criticality"
            value="{{ highCriticality() }}"
            readonly
          />
        </div>
      </div>

      <div class="row g-6">
        <div class="col-12 col-xxl-8">
          <si-card heading="Regional asset map" subHeading="Live positions of all registered sites">
            <div body class="map-frame-lg">
              @if (sites().length) {
                <app-asset-map [sites]="sites()" [maxLabelLength]="maxLabelLength()" [zoomLevel]="5" />
              } @else {
                <si-empty-state
                  icon="element-map"
                  heading="No assets registered"
                  content="Register a site to populate the regional map."
                />
              }
            </div>
          </si-card>
        </div>

        <div class="col-12 col-xxl-4">
          <si-card heading="Latest registrations" [subHeading]="registerSubtitle()">
            <div body class="p-5">
              @if (recent().length) {
                <div class="list-group list-group-flush">
                  @for (site of recent(); track site.id) {
                    <a
                      class="list-group-item list-group-item-action bg-transparent px-0"
                      [routerLink]="['/sites', site.id]"
                    >
                      <div class="d-flex justify-content-between align-items-start gap-4">
                        <div class="text-truncate">
                          <div class="si-title-2 text-truncate">{{ site.name }}</div>
                          <div class="si-caption text-secondary">
                            {{ site.id }} &middot; {{ site.assetType }} &middot;
                            {{ site.createdAt | date: 'short' }}
                          </div>
                        </div>
                        <span class="badge" [class]="badgeClass(site)">{{ site.review.status }}</span>
                      </div>
                    </a>
                  }
                </div>
              } @else {
                <si-empty-state
                  icon="element-list"
                  heading="Register is empty"
                  content="No site has been submitted yet."
                />
              }
              <a class="btn btn-secondary w-100 mt-6" routerLink="/sites">Open asset register</a>
            </div>
          </si-card>
        </div>
      </div>
    </app-page>
  `
})
export class DashboardComponent {
  private readonly api = inject(ApiService);

  protected readonly sites = signal<Site[]>([]);
  protected readonly maxLabelLength = computed(() => this.api.config()?.maxLabelLength ?? -1);
  protected readonly recent = computed(() => this.sites().slice(0, 6));
  protected readonly pendingCount = computed(
    () =>
      this.sites().filter(
        site => site.review.status === 'queued' || site.review.status === 'reviewing'
      ).length
  );
  protected readonly highCriticality = computed(
    () => this.sites().filter(site => site.criticality === 'high').length
  );
  protected readonly registerSubtitle = computed(
    () => `${this.sites().length} sites, ${this.pendingCount()} awaiting review`
  );

  protected readonly actions: ContentActionBarMainItem[] = [
    { type: 'router-link', label: 'Register site', icon: 'element-plus', routerLink: '/register' },
    { type: 'router-link', label: 'Asset register', icon: 'element-list', routerLink: '/sites' }
  ];

  constructor() {
    this.api.listSites().subscribe(sites => this.sites.set(sites));
  }

  protected countByStatus(status: Site['review']['status']): number {
    return this.sites().filter(site => site.review.status === status).length;
  }

  protected badgeClass(site: Site): string {
    switch (site.review.status) {
      case 'approved':
        return 'bg-success';
      case 'failed':
        return 'bg-danger';
      case 'draft':
        return 'bg-secondary';
      default:
        return 'bg-warning';
    }
  }
}
