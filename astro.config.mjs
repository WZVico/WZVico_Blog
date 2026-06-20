import { promises as nodeFsPromises } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import svelte from '@astrojs/svelte';
import { createPublicMarkdownConfig } from './src/plugins/markdown-pipeline.mjs';
import { site, hasSiteUrl } from './site.config.mjs';

const ASTRO_DATA_STORE_RENAME_RETRY_KEY = Symbol.for('astro-whono.astroDataStoreRenameRetry');

const normalizePathLike = (value) => String(value).replace(/\\/g, '/');

const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

const isRetryableRenameError = (error) =>
  error
  && typeof error === 'object'
  && ['EPERM', 'EACCES', 'EBUSY'].includes(error.code)
  && (!error.syscall || error.syscall === 'rename');

const shouldRetryAstroDataStoreRename = (oldPath, newPath, error) =>
  process.platform === 'win32'
  && isRetryableRenameError(error)
  && normalizePathLike(oldPath).endsWith('/data-store.json.tmp')
  && normalizePathLike(newPath).endsWith('/data-store.json');

const installAstroDataStoreRenameRetry = () => {
  if (globalThis[ASTRO_DATA_STORE_RENAME_RETRY_KEY]) return;
  globalThis[ASTRO_DATA_STORE_RENAME_RETRY_KEY] = true;

  const originalRename = nodeFsPromises.rename.bind(nodeFsPromises);
  nodeFsPromises.rename = async (oldPath, newPath) => {
    const delays = [40, 80, 160, 320, 640, 960];
    let lastError;

    for (let attempt = 0; attempt <= delays.length; attempt += 1) {
      try {
        return await originalRename(oldPath, newPath);
      } catch (error) {
        lastError = error;
        if (attempt >= delays.length || !shouldRetryAstroDataStoreRename(oldPath, newPath, error)) {
          throw error;
        }

        await sleep(delays[attempt]);
      }
    }

    throw lastError;
  };
};

installAstroDataStoreRenameRetry();

const SITEMAP_ROUTE_ROOTS = new Set(['about', 'admin', 'archive', 'bits', 'checks', 'longform', 'Materials', 'picks']);

const normalizeSitemapPathname = (page) => {
  let pathname = '/';

  try {
    pathname = new URL(page).pathname;
  } catch {
    [pathname = '/'] = page.split(/[?#]/, 1);
  }

  const normalizedPathname = pathname.replace(/\/+$/, '') || '/';
  const segments = normalizedPathname.split('/').filter(Boolean);
  const routeRootIndex = segments.findIndex((segment) => SITEMAP_ROUTE_ROOTS.has(segment));

  if (routeRootIndex > 0) {
    return `/${segments.slice(routeRootIndex).join('/')}`;
  }

  return normalizedPathname;
};

const isExcludedSitemapPathname = (pathname) =>
  pathname === '/admin'
  || pathname.startsWith('/admin/')
  || pathname === '/checks'
  || pathname.startsWith('/checks/')
  || pathname === '/bits/draft-dialog'
  || /^\/longform\/[^/]+$/.test(pathname);

const isExcludedSitemapEntry = (page) => isExcludedSitemapPathname(normalizeSitemapPathname(page));

export default defineConfig({
  // Required for RSS generation. Prefer SITE_URL; fallback keeps build passing.
  site: site.url,
  // DEV 使用 server output 允许 Theme Console 的 /api/admin/settings/ 处理读写；
  // 构建阶段回到 static，让 /admin/ 保持只读提示，并避免把该路径当作生产公开 API。
  output: process.env.NODE_ENV === 'production' ? 'static' : 'server',
  integrations: [
    ...(hasSiteUrl ? [sitemap({ filter: (page) => !isExcludedSitemapEntry(page) })] : []),
    ...(process.env.NODE_ENV === 'production' ? [] : [svelte()])
  ],
  trailingSlash: 'always',
  build: {
    inlineStylesheets: 'auto'
  },
  vite: {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    optimizeDeps: {
      include: [
        'emoji-picker-element',
        '@lucide/svelte/icons/*',
        '@codemirror/commands',
        '@codemirror/lang-markdown',
        '@codemirror/language',
        '@codemirror/state',
        '@codemirror/view',
        '@lezer/highlight'
      ]
    }
  },
  markdown: createPublicMarkdownConfig()
});
