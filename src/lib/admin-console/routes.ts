export type AdminRouteId = 'overview' | 'theme' | 'content' | 'category' | 'images' | 'checks' | 'data';

export type AdminRouteActiveMatch = 'exact' | 'prefix';

export type AdminRouteDefinition = {
  id: AdminRouteId;
  href:
    | '/admin/'
    | '/admin/theme/'
    | '/admin/content/'
    | '/admin/category/'
    | '/admin/images/'
    | '/admin/checks/'
    | '/admin/data/';
  label: string;
  sidebarLabel: string;
  description: string;
  activeMatch?: AdminRouteActiveMatch;
};

export const ADMIN_ROUTES: readonly AdminRouteDefinition[] = [
  {
    id: 'overview',
    href: '/admin/',
    label: 'Overview',
    sidebarLabel: '概览',
    description: '后台首页',
    activeMatch: 'exact'
  },
  {
    id: 'theme',
    href: '/admin/theme/',
    label: 'Theme',
    sidebarLabel: '主题',
    description: '主题设置'
  },
  {
    id: 'content',
    href: '/admin/content/',
    label: 'Content',
    sidebarLabel: '内容',
    description: '内容索引与 frontmatter 控制台'
  },
  {
    id: 'category',
    href: '/admin/category/',
    label: 'Category',
    sidebarLabel: '分类',
    description: '分类管理'
  },
  {
    id: 'images',
    href: '/admin/images/',
    label: 'Images',
    sidebarLabel: '图片',
    description: '图片浏览与路径辅助'
  },
  {
    id: 'checks',
    href: '/admin/checks/',
    label: 'Checks',
    sidebarLabel: '校验',
    description: '结构化诊断与发布前自检'
  },
  {
    id: 'data',
    href: '/admin/data/',
    label: 'Data',
    sidebarLabel: '快照',
    description: '设置导入导出'
  }
] as const;

export const isAdminRouteId = (value: string): value is AdminRouteId =>
  ADMIN_ROUTES.some((route) => route.id === value);

export const getAdminRoute = (id: AdminRouteId): AdminRouteDefinition =>
  ADMIN_ROUTES.find((route) => route.id === id) ?? ADMIN_ROUTES[0]!;

export const isAdminRoutePathActive = (
  pathname: string,
  href: string,
  match: AdminRouteActiveMatch = 'prefix'
): boolean =>
  match === 'exact'
    ? pathname === href
    : pathname === href || pathname.startsWith(href);
