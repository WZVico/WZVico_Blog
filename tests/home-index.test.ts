import { describe, expect, it } from 'vitest';
import {
  HOME_INDEX_UPDATED_DATE_LABEL,
  getLongformHomeIndexArticleMetaSettings,
  getLongformHomeIndexDisplayDate,
  orderByLongformHomeIndexDisplayDate
} from '../src/lib/home-index';
import type { LongformEntry } from '../src/lib/content';
import type { ArticleMetaSettings } from '../src/lib/theme-settings';

const createEntry = (id: string, date: string, updatedAt?: string): LongformEntry =>
  ({
    id,
    data: {
      title: id,
      date: new Date(`${date}T00:00:00.000Z`),
      ...(updatedAt ? { updatedAt: new Date(`${updatedAt}T00:00:00.000Z`) } : {})
    }
  }) as unknown as LongformEntry;

const articleMetaSettings: ArticleMetaSettings = {
  showDate: true,
  dateLabel: '发布于：',
  showTags: true,
  showWordCount: true,
  showReadingTime: true
};

describe('home index longform dates', () => {
  it('sorts by updatedAt when present and date otherwise', () => {
    const entries = [
      createEntry('published-mid', '2026-06-20'),
      createEntry('updated-latest', '2026-06-01', '2026-06-22'),
      createEntry('published-latest', '2026-06-21')
    ];

    expect(entries.sort(orderByLongformHomeIndexDisplayDate).map((entry) => entry.id)).toEqual([
      'updated-latest',
      'published-latest',
      'published-mid'
    ]);
  });

  it('uses updatedAt as the displayed date when it exists', () => {
    const updatedEntry = createEntry('updated', '2026-06-01', '2026-06-22');
    const publishedEntry = createEntry('published', '2026-06-21');

    expect(getLongformHomeIndexDisplayDate(updatedEntry).toISOString()).toBe('2026-06-22T00:00:00.000Z');
    expect(getLongformHomeIndexDisplayDate(publishedEntry).toISOString()).toBe('2026-06-21T00:00:00.000Z');
  });

  it('switches the date label only for updated entries', () => {
    const updatedMeta = getLongformHomeIndexArticleMetaSettings(
      createEntry('updated', '2026-06-01', '2026-06-22'),
      articleMetaSettings
    );
    const publishedMeta = getLongformHomeIndexArticleMetaSettings(
      createEntry('published', '2026-06-21'),
      articleMetaSettings
    );

    expect(updatedMeta.dateLabel).toBe(HOME_INDEX_UPDATED_DATE_LABEL);
    expect(publishedMeta).toBe(articleMetaSettings);
  });
});
