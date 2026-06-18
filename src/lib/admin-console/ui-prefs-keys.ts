export const ADMIN_SIDEBAR_NAV_MODE_STORAGE_KEY = 'astro-whono:admin-sidebar:nav-mode';

export type AdminSidebarNavMode = 'public' | 'admin';

export const ADMIN_SIDEBAR_NAV_PUBLIC: AdminSidebarNavMode = 'public';
export const ADMIN_SIDEBAR_NAV_ADMIN: AdminSidebarNavMode = 'admin';

export const isAdminSidebarNavMode = (value: string | undefined | null): value is AdminSidebarNavMode =>
  value === ADMIN_SIDEBAR_NAV_PUBLIC || value === ADMIN_SIDEBAR_NAV_ADMIN;
