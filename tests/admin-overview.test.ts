import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('astro:content', () => ({
  getCollection: vi.fn()
}));

import { getCollection } from 'astro:content';
import {
  buildAdminOverviewBitsHrefById,
  buildAdminOverviewMaintainerSummary,
  buildAdminOverviewPublicSummary,
  countAdminOverviewWords,
  getAdminOverviewData,
  type AdminOverviewMaintainerSource,
  type AdminOverviewPublicSource
} from '../src/lib/admin-console/overview';

const getCollectionMock = vi.mocked(getCollection);
const date = (value: string) => new Date(value);

const longform = (id: string, options: Record<string, unknown> = {}) => ({
  id,
  collection: 'longform',
  data: {
    title: `Longform ${id}`,
    date: date('2026-01-10T00:00:00.000Z'),
    tags: [] as string[],
    draft: false,
    archive: true,
    ...options
  }
});

const bit = (id: string, options: Record<string, unknown> = {}) => ({
  id,
  collection: 'bits',
  data: {
    title: `Bit ${id}`,
    date: date('2026-01-09T12:00:00.000Z'),
    tags: [] as string[],
    draft: false,
    ...options
  }
});

const picks = (id: string, options: Record<string, unknown> = {}) => ({
  id,
  collection: 'picks',
  data: {
    title: `picks ${id}`,
    date: date('2026-01-08T00:00:00.000Z'),
    draft: false,
    ...options
  }
});

const material = (id: string, options: Record<string, unknown> = {}) => ({
  id,
  collection: 'materials',
  data: {
    title: `Material ${id}`,
    href: `/Materials/${id}/`,
    date: date('2026-01-13T00:00:00.000Z'),
    description: '',
    ...options
  }
});

const withBody = <T extends object>(entry: T, body: string): T & { body: string } => ({
  ...entry,
  body
});

const mockCollections = (collections: Record<string, object[]>) => {
  getCollectionMock.mockImplementation(async (collection, filter) => {
    const entries = collections[String(collection)] ?? [];
    const entryFilter = typeof filter === 'function'
      ? filter as (entry: object) => boolean
      : null;
    return (entryFilter
      ? entries.filter((entry) => entryFilter(entry))
      : entries) as never;
  });
};

describe('admin-console/overview', () => {
  beforeEach(() => {
    getCollectionMock.mockReset();
  });

  it('builds public summary from published source and archive-only tag source', () => {
    const publicSource = {
      longforms: [
        longform('archive-longform', { tags: ['Design', 'Astro'] }),
        longform('longform-only', { archive: false, tags: ['Hidden'] })
      ],
      archiveLongforms: [
        longform('archive-longform', { tags: ['Design', 'Astro'] })
      ],
      bits: [bit('published-bit', { date: date('2026-01-12T12:00:00.000Z') })],
      picks: [picks('published-picks')],
      materials: [
        {
          slug: 'material-latest',
          title: 'Material latest',
          href: '/Materials/material-latest/',
          date: date('2026-01-13T00:00:00.000Z'),
          dateValue: '2026-01-13'
        }
      ],
      bitsHrefById: new Map([['published-bit', '/bits/#bit-published-bit']])
    } as unknown as AdminOverviewPublicSource;

    const summary = buildAdminOverviewPublicSummary(publicSource, {
      now: date('2026-01-20T06:00:00.000Z')
    });

    expect(summary.stats.publishedCount).toBe(5);
    expect(summary.stats.tagCount).toBe(2);
    expect(summary.stats.wordCount).toBe(0);
    expect(summary.stats.lastUpdate?.date.toISOString()).toBe('2026-01-13T00:00:00.000Z');
    expect(summary.recentPublications[0]).toMatchObject({
      collection: 'materials',
      title: 'Material latest',
      href: '/Materials/material-latest/'
    });
    expect(summary.topTags.map((tag) => tag.label)).toEqual(['Astro', 'Design']);
    expect(summary).not.toHaveProperty('archiveYears');
    expect(summary.writingActivity).toHaveLength(90);
    expect(summary.writingActivity.at(-1)).toMatchObject({
      date: '2026-01-20',
      count: 0,
      level: 0
    });
    expect(summary.writingActivity.find((day) => day.date === '2026-01-12')).toMatchObject({
      count: 1,
      level: 1
    });
  });

  it('includes materials in recent publications without affecting writing activity', async () => {
    mockCollections({
      longform: [],
      bits: [],
      picks: [],
      materials: [
        material('guide', {
          title: 'Resource Guide',
          href: 'https://example.com/guide',
          date: date('2026-05-20T00:00:00.000Z'),
          description: 'External resource'
        })
      ]
    });

    const data = await getAdminOverviewData({
      includeMaintainer: true,
      includeDraftInRecent: true,
      now: date('2026-05-24T00:00:00.000Z')
    });

    expect(data.stats.publishedCount).toBe(1);
    expect(data.stats.lastUpdate?.date.toISOString()).toBe('2026-05-20T00:00:00.000Z');
    expect(data.collections.find((summary) => summary.key === 'materials')).toMatchObject({
      count: 1,
      percentage: 100
    });
    expect(data.recentPublications).toEqual([
      expect.objectContaining({
        collection: 'materials',
        collectionLabel: 'Materials',
        title: 'Resource Guide',
        href: 'https://example.com/guide',
        isDraft: false
      })
    ]);
    expect(data.writingActivity).toEqual([]);
    expect(data.maintainerSummary?.collectionDrafts.find((summary) => summary.key === 'materials')).toMatchObject({
      totalCount: 1,
      draftCount: 0
    });
  });

  it('does not count the picks page metadata entry as published content', async () => {
    mockCollections({
      longform: [],
      bits: [],
      picks: [
        picks('index', {
          title: '拾选',
          subtitle: '页面说明',
          date: date('2026-05-19T00:00:00.000Z')
        })
      ]
    });

    const data = await getAdminOverviewData({
      includeMaintainer: true,
      includeDraftInRecent: true,
      now: date('2026-05-24T00:00:00.000Z')
    });

    expect(data.stats.publishedCount).toBe(0);
    expect(data.stats.lastUpdate).toBeNull();
    expect(data.collections.find((summary) => summary.key === 'picks')).toMatchObject({
      count: 0,
      percentage: 0
    });
    expect(data.recentPublications).toEqual([]);
    expect(data.writingActivity).toEqual([]);
    expect(data.maintainerSummary?.collectionDrafts.find((summary) => summary.key === 'picks')).toMatchObject({
      totalCount: 0,
      draftCount: 0
    });
  });

  it('counts CJK characters and English or numeric runs from cleaned markdown', () => {
    const markdown = [
      '# 标题',
      '中文 and English 2026，标点！42',
      '[链接](https://example.com) ![图片](./image.png)',
      '```js',
      'const ignored = 100;',
      '```'
    ].join('\n');

    expect(countAdminOverviewWords(markdown)).toBe(12);
    expect(countAdminOverviewWords('')).toBe(0);
    expect(countAdminOverviewWords('，。、；:!? -')).toBe(0);
  });

  it('excludes draft bodies from word count while maintainer data can still include drafts', async () => {
    const publicWordCount = [
      '中文 alpha 123',
      'beta test 42',
      'かな picks'
    ].reduce((total, body) => total + countAdminOverviewWords(body), 0);
    const draftWordCount = [
      '草稿 draft 999',
      '草稿 bit 888',
      '草稿 picks 777'
    ].reduce((total, body) => total + countAdminOverviewWords(body), 0);

    mockCollections({
      longform: [
        withBody(longform('published-longform'), '中文 alpha 123'),
        withBody(longform('draft-longform', { draft: true }), '草稿 draft 999')
      ],
      bits: [
        withBody(bit('published-bit'), 'beta test 42'),
        withBody(bit('draft-bit', { draft: true }), '草稿 bit 888')
      ],
      picks: [
        withBody(picks('published-picks'), 'かな picks'),
        withBody(picks('draft-picks', { draft: true }), '草稿 picks 777')
      ]
    });

    const data = await getAdminOverviewData({
      includeMaintainer: true,
      includeDraftInRecent: true
    });

    expect(data.stats.wordCount).toBe(publicWordCount);
    expect(data.stats.wordCount).not.toBe(publicWordCount + draftWordCount);
    expect(data.maintainerSummary?.draftCount).toBe(3);
    expect(data.recentPublications.some((entry) => entry.isDraft)).toBe(true);
  });

  it('keeps draft recent items unlinkable while published bits use the public href map', () => {
    const maintainerSource = {
      longforms: [],
      bits: [
        bit('draft-bit', {
          title: 'Draft Bit',
          draft: true,
          date: date('2026-01-13T12:00:00.000Z')
        }),
        bit('published-bit', {
          title: 'Published Bit',
          date: date('2026-01-12T12:00:00.000Z')
        })
      ],
      picks: [],
      materials: []
    } as unknown as AdminOverviewMaintainerSource;

    const summary = buildAdminOverviewMaintainerSummary(
      maintainerSource,
      new Map([['published-bit', '/bits/#bit-published-bit']])
    );

    expect(summary?.draftCount).toBe(1);
    expect(summary?.recentPublications[0]).toMatchObject({
      title: 'Draft Bit',
      isDraft: true,
      href: null
    });
    expect(summary?.recentPublications[1]).toMatchObject({
      title: 'Published Bit',
      isDraft: false,
      href: '/bits/#bit-published-bit'
    });
  });

  it('builds bits hrefs from the published bits order and page size', () => {
    const bits = Array.from({ length: 21 }, (_, index) => bit(`bit-${index}`));
    const hrefById = buildAdminOverviewBitsHrefById(bits as unknown as AdminOverviewPublicSource['bits']);

    expect(hrefById.get('bit-0')).toBe('/bits/#bit-bit-0');
    expect(hrefById.get('bit-20')).toBe('/bits/page/2/#bit-bit-20');
  });
});
