import { ChangeDetectionStrategy, Component, computed, input, viewChild } from '@angular/core';
import { MapPoint, SiMapComponent, SiMapTooltipComponent } from '@siemens/maps-ng';

import { Site } from './models';

/** Siemens status colours (Element data reference palette). */
const MARKER_COLORS: Record<string, string> = {
  high: '#ff2640',
  medium: '#ff9000',
  low: '#00d7a0'
};

/**
 * Shared Element map wrapper used by the operator views and by the supervisor
 * review screen. Tooltips are enabled so the duty supervisor can read the site
 * name without clicking through every marker.
 */
@Component({
  selector: 'app-asset-map',
  imports: [SiMapComponent, SiMapTooltipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="map-surface">
      <si-map
        [points]="points()"
        [styleJson]="styleUrl"
        [displayTooltipOnHover]="true"
        [displayPopoverOnClick]="false"
        [cluster]="false"
        [markerAnimation]="false"
        (pointsRefreshed)="onPointsRefreshed()"
      >
        <si-map-tooltip [maxLabelLength]="maxLabelLength()" />
      </si-map>
    </div>
  `
})
export class AssetMapComponent {
  readonly sites = input.required<Site[]>();
  /** -1 keeps the full site name in the tooltip. */
  readonly maxLabelLength = input<number>(-1);
  readonly zoomLevel = input<number>(11);

  protected readonly styleUrl = '/assets/map-style.json';
  private readonly map = viewChild(SiMapComponent);

  protected readonly points = computed<MapPoint[]>(() =>
    this.sites().map(site => ({
      name: site.name,
      description: site.description,
      lat: site.lat,
      lon: site.lon,
      marker: { type: 'dot', color: MARKER_COLORS[site.criticality] ?? MARKER_COLORS['medium'] },
      extraProperties: { id: site.id }
    }))
  );

  protected onPointsRefreshed(): void {
    const points = this.points();
    if (points.length) {
      this.map()?.zoomToPoints(points, this.zoomLevel());
    }
  }
}
