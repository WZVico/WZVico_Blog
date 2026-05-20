import type { APIRoute } from 'astro';
import { getArchiveLongforms, getLongformDerivedText, getLongformSlug } from '../../lib/content';
import { getLongformArticleAuthorNames } from '../../lib/longform-people';
import { getThemeSettings } from '../../lib/theme-settings';

export const prerender = true;

export const GET: APIRoute = async () => {
  const archiveItems = await getArchiveLongforms();
  const { settings } = getThemeSettings();
  const index = archiveItems.map((entry) => {
    const { text } = getLongformDerivedText(entry);
    return {
      slug: getLongformSlug(entry),
      href: `/archive/${getLongformSlug(entry)}/`,
      title: entry.data.title ?? '',
      description: entry.data.description ?? '',
      tags: entry.data.tags ?? [],
      authors: getLongformArticleAuthorNames(entry, settings),
      text,
      date: entry.data.date ? entry.data.date.toISOString() : null
    };
  });
  const cacheControl = import.meta.env.DEV
    ? 'no-store'
    : 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400';

  return new Response(JSON.stringify(index), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl
    }
  });
};
