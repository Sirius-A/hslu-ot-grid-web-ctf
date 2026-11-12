export type AssetType = 'substation' | 'rtu' | 'plc' | 'sensor' | 'gateway';
export type Criticality = 'low' | 'medium' | 'high';
export type ReviewStatus = 'draft' | 'queued' | 'reviewing' | 'approved' | 'failed';

export interface ReviewState {
  status: ReviewStatus;
  requestedAt: string | null;
  finishedAt: string | null;
  note: string;
}

export interface ControlSystem {
  product: string;
  version: string;
  url: string;
  internalUrl: string;
  note: string;
}

export interface WebshopProduct {
  name: string;
  price: string;
  blurb: string;
  badge?: string;
}

export interface Webshop {
  shopName: string;
  tagline: string;
  products: WebshopProduct[];
}

export interface Site {
  id: string;
  name: string;
  description: string;
  operator: string;
  assetType: AssetType;
  criticality: Criticality;
  lat: number;
  lon: number;
  createdAt: string;
  restricted?: boolean;
  controlSystem?: ControlSystem;
  webshop?: Webshop;
  review: ReviewState;
}

export interface SiteDraft {
  name: string;
  description: string;
  operator: string;
  assetType: AssetType;
  criticality: Criticality;
  lat: number;
  lon: number;
}

export interface PortalConfig {
  appName: string;
  appVersion: string;
  elementVersion: string;
  mapsVersion: string;
  angularVersion: string;
  openSourcePackages: number;
  maxLabelLength: number;
  collectorInternal: string;
  collectorPublic: string;
}

export interface AdminOverview {
  supervisor: string;
  emergencyOverrideKey: string;
  queueLength: number;
  pending: { id: string; name: string; requestedAt: string | null }[];
  totalSites: number;
  controlSystem: {
    enabled: boolean;
    siteId: string;
    url: string;
    note: string;
  };
}
