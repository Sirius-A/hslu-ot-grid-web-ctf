import { ChangeDetectionStrategy, Component, computed, inject, signal, OnDestroy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SiCardComponent } from '@siemens/element-ng/card';
import { SiContentActionBarComponent } from '@siemens/element-ng/content-action-bar';
import type { ContentActionBarMainItem } from '@siemens/element-ng/content-action-bar';
import { SiInlineNotificationComponent } from '@siemens/element-ng/inline-notification';
import { SiLoadingSpinnerComponent } from '@siemens/element-ng/loading-spinner';

import { ApiService } from '../shared/api.service';
import { AssetMapComponent } from '../shared/asset-map.component';
import { PageComponent } from '../shared/page.component';
import { Site } from '../shared/models';

@Component({
  selector: 'app-site-detail',
  imports: [
    RouterLink,
    DatePipe,
    PageComponent,
    SiCardComponent,
    SiContentActionBarComponent,
    SiInlineNotificationComponent,
    SiLoadingSpinnerComponent,
    AssetMapComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (site(); as current) {
      <app-page [heading]="current.id" [subtitle]="current.operator + ' -- ' + current.assetType">
        <si-content-action-bar actions class="si-layout-actions" viewType="expanded" [primaryActions]="actions()" />

        <div class="row g-6">
          <div class="col-12 col-xl-7">
            <si-card
              heading="Site location"
              subHeading="Hover the marker to see the tooltip the supervisor will read."
            >
              <div body class="map-frame">
                <app-asset-map
                  [sites]="[current]"
                  [maxLabelLength]="maxLabelLength()"
                  [zoomLevel]="7"
                />
              </div>
            </si-card>
          </div>

          <div class="col-12 col-xl-5">
            <si-card heading="Site record">
              <div body class="p-7">
                <dl class="kv-grid si-body-2">
                  <dt>Name</dt>
                  <dd class="text-break">{{ current.name }}</dd>
                  <dt>Description</dt>
                  <dd>{{ current.description || '--' }}</dd>
                  <dt>Operator</dt>
                  <dd>{{ current.operator }}</dd>
                  <dt>Asset type</dt>
                  <dd>{{ current.assetType }}</dd>
                  <dt>Criticality</dt>
                  <dd>{{ current.criticality }}</dd>
                  <dt>Coordinates</dt>
                  <dd>{{ current.lat }}, {{ current.lon }}</dd>
                  <dt>Registered</dt>
                  <dd>{{ current.createdAt | date: 'medium' }}</dd>
                </dl>

                <hr class="my-6" />

                <si-inline-notification
                  class="d-block"
                  [severity]="severity()"
                  heading="Validation status"
                  [message]="current.review.status + ' -- ' + current.review.note"
                />

                @if (error()) {
                  <si-inline-notification
                    class="d-block mt-5"
                    severity="danger"
                    heading="Request rejected"
                    [message]="error()!"
                  />
                }

                @if (!current.restricted) {
                  <div class="d-flex align-items-center gap-5 mt-6">
                    <button
                      class="btn btn-primary"
                      type="button"
                      [disabled]="busy()"
                      (click)="requestReview()"
                    >
                      Request supervisor validation
                    </button>
                    @if (pending()) {
                      <si-loading-spinner />
                    }
                  </div>
                }
                <a class="btn btn-tertiary mt-4 px-0" routerLink="/sites">Back to asset register</a>
              </div>
            </si-card>
          </div>

          @if (current.webshop; as shop) {
            <div class="col-12">
              <si-card [heading]="shop.shopName" [subHeading]="shop.tagline">
                <div body class="p-7">
                  <div class="d-flex flex-wrap align-items-center justify-content-between gap-4 mb-6">
                    <span class="si-body-2 text-secondary">
                      Free delivery on orders over CHF 50. Catch of the day while stocks last.
                    </span>
                    <div class="d-flex align-items-center gap-5">
                      <span class="badge bg-secondary">Cart: {{ cart() }}</span>
                      <button
                        class="btn btn-secondary"
                        type="button"
                        [disabled]="shopBusy()"
                        (click)="checkout()"
                      >
                        Checkout
                      </button>
                    </div>
                  </div>

                  @if (shopNotice()) {
                    <si-inline-notification
                      class="d-block mb-6"
                      severity="success"
                      heading="Order confirmed"
                      [message]="shopNotice()!"
                    />
                  }

                  <div class="row g-5">
                    @for (product of shop.products; track product.name) {
                      <div class="col-12 col-sm-6 col-xl-4">
                        <div class="shop-item h-100 d-flex flex-column p-6">
                          <div class="d-flex align-items-start justify-content-between gap-4">
                            <h4 class="si-title-2 mb-0 text-break">{{ product.name }}</h4>
                            @if (product.badge) {
                              <span class="badge bg-info flex-shrink-0">{{ product.badge }}</span>
                            }
                          </div>
                          <p class="si-body-2 text-secondary mt-4 mb-5 flex-grow-1">
                            {{ product.blurb }}
                          </p>
                          <div class="d-flex align-items-center justify-content-between gap-4">
                            <span class="si-title-2 mb-0">{{ product.price }}</span>
                            <button
                              class="btn btn-primary"
                              type="button"
                              [disabled]="shopBusy()"
                              (click)="addToCart(current.id, product.name)"
                            >
                              Add to cart
                            </button>
                          </div>
                        </div>
                      </div>
                    }
                  </div>
                </div>
              </si-card>
            </div>
          }

          @if (current.controlSystem; as cs) {
            <div class="col-12">
              <si-card
                heading="Control system"
                [subHeading]="cs.product + ' ' + cs.version + ' operator console'"
              >
                <div body class="p-7">
                  <si-inline-notification
                    class="d-block mb-5"
                    severity="warning"
                    heading="Classified asset"
                    message="This record is restricted to supervisor accounts. Do not share the console address."
                  />
                  <dl class="kv-grid si-body-2">
                    <dt>Console</dt>
                    <dd>
                      <a [href]="cs.url" target="_blank" rel="noopener">{{ cs.url }}</a>
                    </dd>
                    <dt>From the operations network</dt>
                    <dd>
                      <code>{{ cs.internalUrl }}</code>
                    </dd>
                    <dt>Product</dt>
                    <dd>{{ cs.product }} {{ cs.version }}</dd>
                  </dl>
                  <p class="si-body-2 text-secondary mt-5 mb-0">{{ cs.note }}</p>
                  <a class="btn btn-primary mt-6" [href]="cs.url" target="_blank" rel="noopener">
                    Open dispatch console
                  </a>
                </div>
              </si-card>
            </div>
          }
        </div>
      </app-page>
    }
  `,
  styles: `
    .shop-item {
      border: 1px solid var(--element-ui-4);
      border-radius: var(--element-radius-2, 4px);
      background: var(--element-base-1);
    }
  `
})
export class SiteDetailComponent implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private pollTimer?: ReturnType<typeof setInterval>;

  protected readonly site = signal<Site | undefined>(undefined);
  protected readonly error = signal<string | undefined>(undefined);
  protected readonly busy = signal(false);
  // Storefront state. The cart lives server-side (/api/shop/*); these mirror it.
  protected readonly cart = signal(0);
  protected readonly shopBusy = signal(false);
  protected readonly shopNotice = signal<string | undefined>(undefined);
  protected readonly maxLabelLength = computed(() => this.api.config()?.maxLabelLength ?? -1);
  protected readonly pending = computed(() => {
    const status = this.site()?.review.status;
    return status === 'queued' || status === 'reviewing';
  });
  protected readonly severity = computed(() => {
    switch (this.site()?.review.status) {
      case 'approved':
        return 'success' as const;
      case 'failed':
        return 'danger' as const;
      case 'draft':
        return 'info' as const;
      default:
        return 'warning' as const;
    }
  });
  protected readonly actions = computed<ContentActionBarMainItem[]>(() =>
    this.site()?.restricted
      ? [{ type: 'router-link', label: 'Asset register', icon: 'element-list', routerLink: '/sites' }]
      : [
          {
            type: 'action',
            label: 'Request validation',
            icon: 'element-checked',
            disabled: this.busy(),
            action: () => this.requestReview()
          },
          { type: 'router-link', label: 'Asset register', icon: 'element-list', routerLink: '/sites' }
        ]
  );

  constructor() {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    this.reload(id);
    this.pollTimer = setInterval(() => this.reload(id), 4000);
  }

  ngOnDestroy(): void {
    clearInterval(this.pollTimer);
  }

  private reload(id: string): void {
    this.api.getSite(id).subscribe({
      next: site => this.site.set(site),
      error: () => undefined
    });
  }

  protected addToCart(siteId: string, product: string): void {
    this.shopNotice.set(undefined);
    this.shopBusy.set(true);
    this.api.addToCart(siteId, product).subscribe({
      next: result => {
        this.shopBusy.set(false);
        this.cart.set(result.count);
      },
      error: () => this.shopBusy.set(false)
    });
  }

  protected checkout(): void {
    this.shopBusy.set(true);
    this.api.checkout().subscribe({
      next: result => {
        this.shopBusy.set(false);
        this.cart.set(0);
        this.shopNotice.set(result.message);
      },
      error: () => {
        this.shopBusy.set(false);
        this.shopNotice.set('Checkout could not be completed. Please try again.');
      }
    });
  }

  protected requestReview(): void {
    const current = this.site();
    if (!current) {
      return;
    }
    this.error.set(undefined);
    this.busy.set(true);
    this.api.requestReview(current.id).subscribe({
      next: review => {
        this.busy.set(false);
        this.site.set({ ...current, review });
      },
      error: err => {
        this.busy.set(false);
        this.error.set(err?.error?.error ?? 'Unexpected error.');
      }
    });
  }
}
