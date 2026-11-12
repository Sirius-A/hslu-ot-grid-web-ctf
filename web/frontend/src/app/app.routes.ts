import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    // The sign-in screen uses the Element landing page layout, so it is
    // rendered outside of the application frame.
    path: 'admin/login',
    loadComponent: () => import('./pages/admin-login.component').then(m => m.AdminLoginComponent)
  },
  {
    path: '',
    loadComponent: () => import('./layout/shell.component').then(m => m.ShellComponent),
    data: { siBreadcrumb: [{ title: 'GridOps', link: '/' }] },
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/dashboard.component').then(m => m.DashboardComponent),
        data: { siBreadcrumb: [{ title: 'Operations overview', link: '/' }] }
      },
      {
        path: 'sites',
        loadComponent: () => import('./pages/site-list.component').then(m => m.SiteListComponent),
        data: { siBreadcrumb: [{ title: 'Asset register', link: '/sites' }] }
      },
      {
        path: 'sites/:id',
        loadComponent: () => import('./pages/site-detail.component').then(m => m.SiteDetailComponent),
        data: { siBreadcrumb: [{ title: 'Asset register', link: '/sites' }] }
      },
      {
        path: 'register',
        loadComponent: () =>
          import('./pages/register-site.component').then(m => m.RegisterSiteComponent),
        data: { siBreadcrumb: [{ title: 'Register site', link: '/register' }] }
      },
      {
        path: 'about',
        loadComponent: () => import('./pages/about.component').then(m => m.AboutComponent),
        data: { siBreadcrumb: [{ title: 'About', link: '/about' }] }
      },
      {
        path: 'admin/review/:id',
        loadComponent: () =>
          import('./pages/admin-review.component').then(m => m.AdminReviewComponent),
        data: { siBreadcrumb: [{ title: 'Supervisor desk', link: '/admin' }] }
      },
      {
        path: 'admin',
        loadComponent: () => import('./pages/admin.component').then(m => m.AdminComponent),
        data: { siBreadcrumb: [{ title: 'Supervisor desk', link: '/admin' }] }
      },
      { path: '**', redirectTo: '' }
    ]
  }
];
