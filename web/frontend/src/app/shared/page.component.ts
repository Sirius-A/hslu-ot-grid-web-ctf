import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { SiBreadcrumbRouterComponent } from '@siemens/element-ng/breadcrumb-router';

/**
 * Standard Element content page: breadcrumb, page header with title, subtitle
 * and an action slot, followed by the page body.
 *
 * See https://element.siemens.io/fundamentals/layouts/content-page/
 */
@Component({
  selector: 'app-page',
  imports: [SiBreadcrumbRouterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="si-layout-main-padding pb-9">
      <si-breadcrumb-router class="si-layout-breadcrumb si-layout-top-element" />

      <div class="si-layout-header">
        <h1 class="si-layout-title">{{ heading() }}</h1>
        @if (subtitle()) {
          <p class="si-layout-subtitle">{{ subtitle() }}</p>
        }
        <!-- The projected action bar carries .si-layout-actions itself, so the
             auto-collapsing content action bar measures the full header width. -->
        <ng-content select="[actions]" />
      </div>

      <ng-content />
    </div>
  `
})
export class PageComponent {
  readonly heading = input.required<string>();
  readonly subtitle = input<string>();
}
