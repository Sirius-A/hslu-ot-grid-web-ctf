import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { AdminOverview, PortalConfig, ReviewState, Site, SiteDraft } from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  readonly config = signal<PortalConfig | undefined>(undefined);
  readonly role = signal<'anonymous' | 'admin'>('anonymous');

  loadConfig(): Observable<PortalConfig> {
    return this.http.get<PortalConfig>('/api/config').pipe(tap(cfg => this.config.set(cfg)));
  }

  loadSession(): Observable<{ role: 'anonymous' | 'admin' }> {
    return this.http
      .get<{ role: 'anonymous' | 'admin' }>('/api/session')
      .pipe(tap(session => this.role.set(session.role)));
  }

  listSites(): Observable<Site[]> {
    return this.http.get<Site[]>('/api/sites');
  }

  getSite(id: string): Observable<Site> {
    return this.http.get<Site>(`/api/sites/${encodeURIComponent(id)}`);
  }

  createSite(draft: SiteDraft): Observable<Site> {
    return this.http.post<Site>('/api/sites', draft);
  }

  requestReview(id: string): Observable<ReviewState> {
    return this.http.post<ReviewState>(`/api/sites/${encodeURIComponent(id)}/review`, {});
  }

  adminLogin(username: string, password: string): Observable<{ role: 'admin' }> {
    return this.http
      .post<{ role: 'admin' }>('/api/admin/login', { username, password })
      .pipe(tap(() => this.role.set('admin')));
  }

  adminLogout(): Observable<unknown> {
    return this.http.post('/api/admin/logout', {}).pipe(tap(() => this.role.set('anonymous')));
  }

  adminOverview(): Observable<AdminOverview> {
    return this.http.get<AdminOverview>('/api/admin/overview');
  }

  addToCart(siteId: string, product: string): Observable<{ count: number }> {
    return this.http.post<{ count: number }>('/api/shop/cart', { siteId, product });
  }

  checkout(): Observable<{ ok: boolean; count: number; message: string }> {
    return this.http.post<{ ok: boolean; count: number; message: string }>('/api/shop/checkout', {});
  }
}
