import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { SiCardComponent } from '@siemens/element-ng/card';
import { SiInlineNotificationComponent } from '@siemens/element-ng/inline-notification';

import { ApiService } from '../shared/api.service';
import { AssetMapComponent } from '../shared/asset-map.component';
import { PageComponent } from '../shared/page.component';
import { Site } from '../shared/models';

/**
 * Supervisor review screen. The duty supervisor opens this page from the review
 * queue and hovers the marker to read the submitted site name before approving.
 */
@Component({
  selector: 'app-admin-review',
  imports: [
    DatePipe,
    PageComponent,
    SiCardComponent,
    SiInlineNotificationComponent,
    AssetMapComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (site(); as current) {
      <app-page [heading]="'Review ' + current.id">
        <div class="row g-6">
          <div class="col-12 col-xxl-8">
            <si-card heading="Submitted position" subHeading="Hover the marker to read the label">
              <div body class="map-frame-lg" data-review-map>
                <app-asset-map
                  [sites]="[current]"
                  [maxLabelLength]="maxLabelLength()"
                  [zoomLevel]="7"
                />
              </div>
            </si-card>
          </div>

          <div class="col-12 col-xxl-4">
            <si-card heading="Registration details">
              <div body class="p-7">
                <si-inline-notification
                  class="d-block mb-5"
                  severity="caution"
                  heading="Pending validation"
                  message="Check the marker position and the site label before approving."
                />
                <dl class="kv-grid si-body-2">
                  <dt>Operator</dt>
                  <dd>{{ current.operator }}</dd>
                  <dt>Asset type</dt>
                  <dd>{{ current.assetType }}</dd>
                  <dt>Criticality</dt>
                  <dd>{{ current.criticality }}</dd>
                  <dt>Coordinates</dt>
                  <dd>{{ current.lat }}, {{ current.lon }}</dd>
                  <dt>Submitted</dt>
                  <dd>{{ current.createdAt | date: 'medium' }}</dd>
                </dl>
              </div>
            </si-card>
          </div>
        </div>
      </app-page>
    }
  `
})
export class AdminReviewComponent {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  protected readonly site = signal<Site | undefined>(undefined);
  protected readonly maxLabelLength = computed(() => this.api.config()?.maxLabelLength ?? -1);

  constructor() {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.api.getSite(id).subscribe({
      next: site => this.site.set(site),
      error: () => undefined
    });
  }
}
