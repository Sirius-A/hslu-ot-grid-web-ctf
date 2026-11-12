import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SiAboutComponent } from '@siemens/element-ng/about';
import { SiCardComponent } from '@siemens/element-ng/card';
import type { LicenseInfo } from '@siemens/element-ng/about';

import { ApiService } from '../shared/api.service';

/**
 * Open source disclosure page.
 *
 * Uses the Element `si-about` component in license "api" mode. The package
 * list, versions and license texts are served by the portal backend from an
 * inventory that is generated at build time from the installed dependency
 * tree, so the page reflects what actually ships.
 */
@Component({
  selector: 'app-about',
  imports: [SiAboutComponent, SiCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <si-about
      class="d-block pb-9"
      aboutTitle="About this application"
      iconName="element-plant"
      [appName]="appName()"
      [subheading]="subheading()"
      [licenseInfo]="licenseInfo"
    />

    <div class="mx-6 pb-6">
      <si-card heading="Training instance" subHeading="Values of this lab deployment">
        <div body class="p-7">
          <dl class="kv-grid si-body-2">
            <dt>Element / maps-ng</dt>
            <dd>{{ config()?.elementVersion }} / {{ config()?.mapsVersion }}</dd>
            <dt>Tooltip label limit</dt>
            <dd>
              {{ config()?.maxLabelLength === -1 ? 'unlimited' : config()?.maxLabelLength }}
            </dd>
            <dt>Request collector (from the portal)</dt>
            <dd>
              <code>{{ config()?.collectorInternal }}</code>
            </dd>
            <dt>Request collector (from your host)</dt>
            <dd>
              <!-- Only the host-reachable localhost URL is a link; the internal
                   docker address above is not resolvable from your browser. -->
              <a [href]="config()?.collectorPublic" target="_blank" rel="noopener">{{
                config()?.collectorPublic
              }}</a>
            </dd>
          </dl>
        </div>
      </si-card>
    </div>
  `
})
export class AboutComponent {
  private readonly api = inject(ApiService);

  protected readonly licenseInfo: LicenseInfo = {
    title: 'Open source components',
    api: '/api/licenses',
    icon: 'element-document'
  };

  protected readonly config = computed(() => this.api.config());

  protected readonly appName = computed(
    () => this.api.config()?.appName ?? 'GridOps Regional Asset Portal'
  );

  protected readonly subheading = computed(() => {
    const config = this.api.config();
    return [
      // A tagline belongs under the product name; the component versions used
      // to sit here, but the open source list below is where they belong.
      'Zero trust. Zero downtime. Zero incidents reported.',
      `Version ${config?.appVersion ?? '--'}`,
      `Angular ${config?.angularVersion ?? '--'}`,
      `${config?.openSourcePackages ?? 0} open source packages in use`
    ];
  });
}
