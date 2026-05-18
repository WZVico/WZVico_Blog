import rss from '@astrojs/rss';
import { getLongformSlug, getVisibleLongforms } from '../../lib/content';
import { createWithBase } from '../../utils/format';
import { getThemeSettings } from '../../lib/theme-settings';

const base = import.meta.env.BASE_URL ?? '/';
const withBase = createWithBase(base);
const { settings } = getThemeSettings();

export async function GET(context) {
  const visibleLongforms = await getVisibleLongforms({
    includeDraft: false
  });

  return rss({
    title: `${settings.site.title} · 长文`,
    description: '长文与杂记更新',
    site: context.site,
    items: visibleLongforms.map((entry) => ({
      title: entry.data.title,
      pubDate: entry.data.date,
      description: entry.data.description,
      link: withBase(`/archive/${getLongformSlug(entry)}/`)
    }))
  });
}
