import { describe, expect, it } from 'vitest';

const {
  filterAdminContentItems,
  getAdminContentFilterState,
  getAdminContentPublicFallbackLabel
} = await import('../src/lib/admin-console/content');

type AdminContentIndexItem = import('../src/lib/admin-console/content').AdminContentIndexItem;

const createItem = (overrides: Partial<AdminContentIndexItem> = {}): AdminContentIndexItem => ({
  collection: 'longform',
  collectionLabel: '长文',
  id: '202606/example',
  publicEntryId: '202606/example',
  title: 'Example Entry',
  slug: 'example-entry',
  relativePath: 'src/content/longform/202606/example.md',
  publicHref: '/archive/example-entry/',
  isDraft: false,
  archive: true,
  date: new Date('2026-04-01T00:00:00.000Z'),
  dateLabel: '2026-04-01',
  year: 2026,
  tags: ['astro', 'admin'],
  searchHaystack: 'example entry example-entry astro admin',
  readonlyReason: null,
  sourceError: null,
  ...overrides
});

describe('admin-console/content', () => {
  it('normalizes scoped content filter state from URL search params', () => {
    const state = getAdminContentFilterState(new URLSearchParams([
      ['collection', 'longform'],
      ['q', '  Astro   Admin  '],
      ['draft', 'draft'],
      ['tag', 'astro'],
      ['year', '2026'],
      ['page', '3'],
      ['sort', 'title']
    ]));

    expect(state.collection).toBe('longform');
    expect(state.query).toBe('Astro   Admin');
    expect(state.queryTokens).toEqual(['astro', 'admin']);
    expect(state.draft).toBe('draft');
    expect(state.tag).toBe('astro');
    expect(state.year).toBe(2026);
    expect(state.page).toBe(3);
    expect(state.entryId).toBe('');
    expect(state.sort).toBe('title');
  });

  it('uses entryId as exact source-file定位 mode inside a collection scope', () => {
    const state = getAdminContentFilterState(new URLSearchParams([
      ['collection', 'longform'],
      ['entryId', '202606/example']
    ]));

    expect(state.collection).toBe('longform');
    expect(state.entryId).toBe('202606/example');
    expect(state.query).toBe('');
    expect(state.page).toBe(1);
  });

  it('filters content items by collection, query, draft, tag and year', () => {
    const items = [
      createItem(),
      createItem({
        id: '202505/draft',
        publicEntryId: '202505/draft',
        title: 'Draft Entry',
        slug: 'draft-entry',
        isDraft: true,
        tags: ['draft'],
        year: 2025,
        searchHaystack: 'draft entry draft-entry draft'
      }),
      createItem({
        id: '202606/note',
        publicEntryId: '202606/note',
        collection: 'bits',
        collectionLabel: '絮语',
        title: 'Bits Note',
        slug: 'bits-note',
        relativePath: 'src/content/bits/202606/note.md',
        tags: ['bits'],
        archive: null,
        searchHaystack: 'bits note bits-note bits'
      })
    ];

    const filtered = filterAdminContentItems(items, {
      collection: 'longform',
      query: 'example',
      queryTokens: ['example'],
      draft: 'published',
      tag: 'astro',
      year: 2026,
      page: 1,
      entryId: '',
      sort: 'recent'
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe('202606/example');
  });

  it('returns readable public fallback labels for non-public entries', () => {
    expect(getAdminContentPublicFallbackLabel(createItem({ isDraft: true, publicHref: null }))).toContain('draft');
    expect(
      getAdminContentPublicFallbackLabel(createItem({
        collection: 'picks',
        collectionLabel: '拾选',
        id: '202606/pick',
        publicEntryId: '202606/pick',
        publicHref: null,
        archive: null,
        relativePath: 'src/content/picks/202606/pick.md'
      }))
    ).toContain('/picks/');
    expect(
      getAdminContentPublicFallbackLabel(createItem({
        collection: 'materials',
        collectionLabel: '资料',
        id: '202606/material',
        publicEntryId: '202606/material',
        publicHref: null,
        archive: null,
        relativePath: 'src/content/materials/202606/material.md'
      }))
    ).toContain('/Materials/');
    expect(
      getAdminContentPublicFallbackLabel(createItem({
        collection: 'bits',
        collectionLabel: '絮语',
        id: '202606/example',
        publicEntryId: '202606/example',
        slug: 'bits-example',
        publicHref: null,
        archive: null,
        relativePath: 'src/content/bits/202606/example.md'
      }))
    ).toContain('bit-bits-example');
  });
});
