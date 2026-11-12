import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SiCardComponent } from '@siemens/element-ng/card';
import { SiFormItemComponent } from '@siemens/element-ng/form';
import { SiInlineNotificationComponent } from '@siemens/element-ng/inline-notification';

import { ApiService } from '../shared/api.service';
import { PageComponent } from '../shared/page.component';
import { AssetType, Criticality, SiteDraft } from '../shared/models';

@Component({
  selector: 'app-register-site',
  imports: [
    FormsModule,
    PageComponent,
    SiCardComponent,
    SiFormItemComponent,
    SiInlineNotificationComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page
      heading="Register OT site"
      subtitle="New entries are validated by the duty supervisor before they become part of the register."
    >
      <div class="row g-6">
        <div class="col-12 col-xl-8">
          <si-card heading="Site master data">
            <div body class="p-7">
              @if (error()) {
                <si-inline-notification
                  class="mb-6 d-block"
                  severity="danger"
                  heading="Registration failed"
                  [message]="error()!"
                />
              }

              <si-form-item label="Site name">
                <input
                  class="form-control"
                  type="text"
                  name="name"
                  autocomplete="off"
                  placeholder="UW Example 110/16 kV"
                  [(ngModel)]="draft.name"
                />
              </si-form-item>

              <si-form-item label="Description">
                <textarea
                  class="form-control"
                  rows="3"
                  name="description"
                  [(ngModel)]="draft.description"
                ></textarea>
              </si-form-item>

              <si-form-item label="Operator">
                <input class="form-control" type="text" name="operator" [(ngModel)]="draft.operator" />
              </si-form-item>

              <div class="row">
                <div class="col-12 col-md-6">
                  <si-form-item label="Asset type">
                    <select class="form-select" name="assetType" [(ngModel)]="draft.assetType">
                      @for (type of assetTypes; track type) {
                        <option [value]="type">{{ type }}</option>
                      }
                    </select>
                  </si-form-item>
                </div>
                <div class="col-12 col-md-6">
                  <si-form-item label="Criticality">
                    <select class="form-select" name="criticality" [(ngModel)]="draft.criticality">
                      @for (level of criticalities; track level) {
                        <option [value]="level">{{ level }}</option>
                      }
                    </select>
                  </si-form-item>
                </div>
              </div>

              <div class="row">
                <div class="col-12 col-md-6">
                  <si-form-item label="Latitude">
                    <input
                      class="form-control"
                      type="number"
                      step="0.0001"
                      name="lat"
                      [(ngModel)]="draft.lat"
                    />
                  </si-form-item>
                </div>
                <div class="col-12 col-md-6">
                  <si-form-item label="Longitude">
                    <input
                      class="form-control"
                      type="number"
                      step="0.0001"
                      name="lon"
                      [(ngModel)]="draft.lon"
                    />
                  </si-form-item>
                </div>
              </div>
            </div>

            <div footer class="d-flex justify-content-end gap-5 px-7 pb-7">
              <button class="btn btn-secondary" type="button" (click)="reset()">Reset</button>
              <button class="btn btn-primary" type="button" [disabled]="busy()" (click)="submit()">
                Register site
              </button>
            </div>
          </si-card>
        </div>

        <div class="col-12 col-xl-4">
          <si-card heading="Validation workflow">
            <div body class="p-7 si-body-2">
              <ol class="ps-6 mb-0">
                <li class="mb-4">The site is stored as a draft in the regional asset register.</li>
                <li class="mb-4">
                  You request validation from the site record. The request enters the supervisor
                  queue.
                </li>
                <li class="mb-4">
                  The duty supervisor opens the review map and inspects the marker before approving.
                </li>
                <li>The record becomes visible as a validated asset.</li>
              </ol>
            </div>
          </si-card>
        </div>
      </div>
    </app-page>
  `
})
export class RegisterSiteComponent {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  protected readonly assetTypes: AssetType[] = ['substation', 'rtu', 'plc', 'sensor', 'gateway'];
  protected readonly criticalities: Criticality[] = ['low', 'medium', 'high'];
  protected readonly error = signal<string | undefined>(undefined);
  protected readonly busy = signal(false);

  protected draft: SiteDraft = this.emptyDraft();

  protected submit(): void {
    this.error.set(undefined);
    this.busy.set(true);
    this.api
      .createSite({ ...this.draft, lat: Number(this.draft.lat), lon: Number(this.draft.lon) })
      .subscribe({
        next: site => this.router.navigate(['/sites', site.id]),
        error: err => {
          this.busy.set(false);
          this.error.set(err?.error?.error ?? 'Unexpected error.');
        }
      });
  }

  protected reset(): void {
    this.draft = this.emptyDraft();
    this.error.set(undefined);
  }

  private emptyDraft(): SiteDraft {
    return {
      name: '',
      description: '',
      operator: 'Field Service',
      assetType: 'substation',
      criticality: 'medium',
      lat: 47.0502,
      lon: 8.3093
    };
  }
}
