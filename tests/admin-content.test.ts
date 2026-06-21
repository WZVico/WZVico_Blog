import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const {
  filterAdminContentItems,
  getAdminContentFilterHref,
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

  it('keeps materials sort, year and page filters without enabling draft-only filters', () => {
    const state = getAdminContentFilterState(new URLSearchParams([
      ['collection', 'materials'],
      ['q', ' reference '],
      ['draft', 'draft'],
      ['tag', 'astro'],
      ['year', '2026'],
      ['page', '2'],
      ['sort', 'title']
    ]));

    expect(state.collection).toBe('materials');
    expect(state.query).toBe('reference');
    expect(state.queryTokens).toEqual(['reference']);
    expect(state.draft).toBe('all');
    expect(state.tag).toBe('');
    expect(state.year).toBe(2026);
    expect(state.page).toBe(2);
    expect(state.sort).toBe('title');
    expect(getAdminContentFilterHref(state, {}, '/admin/content/')).toBe('/admin/content/?q=reference&collection=materials&sort=title&year=2026');
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

  it('does not treat picks as a draft-status collection for filters', () => {
    const state = getAdminContentFilterState(new URLSearchParams([
      ['collection', 'picks'],
      ['draft', 'draft']
    ]));

    expect(state.draft).toBe('all');
    expect(getAdminContentFilterHref(state, {}, '/admin/content/')).toBe('/admin/content/?collection=picks');
  });

  it('filters materials by year without applying draft status filters', () => {
    const items = [
      createItem({
        collection: 'materials',
        collectionLabel: '资料',
        id: '202606/reference',
        publicEntryId: '202606/reference',
        title: 'Reference 2026',
        slug: 'https://example.com/reference-2026',
        relativePath: 'src/content/materials/202606/reference.md',
        publicHref: 'https://example.com/reference-2026',
        isDraft: false,
        archive: null,
        year: 2026,
        tags: [],
        searchHaystack: 'reference 2026'
      }),
      createItem({
        collection: 'materials',
        collectionLabel: '资料',
        id: '202505/reference',
        publicEntryId: '202505/reference',
        title: 'Reference 2025',
        slug: 'https://example.com/reference-2025',
        relativePath: 'src/content/materials/202505/reference.md',
        publicHref: 'https://example.com/reference-2025',
        isDraft: false,
        archive: null,
        year: 2025,
        tags: [],
        searchHaystack: 'reference 2025'
      })
    ];

    const filtered = filterAdminContentItems(items, {
      collection: 'materials',
      query: '',
      queryTokens: [],
      draft: 'draft',
      tag: 'astro',
      year: 2026,
      page: 1,
      entryId: '',
      sort: 'recent'
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe('202606/reference');
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
    ).toContain('缺少可打开的链接');
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

  it('keeps browser editor adapters away from the server-only about contract', async () => {
    const source = await readFile(
      new URL('../src/components/admin/editor/shared/content-editor-adapters.ts', import.meta.url),
      'utf8'
    );

    expect(source).toContain('content-about-shared');
    expect(source).not.toContain('content-about-contract');
  });

  it('passes the initial info panel state to bits editor props', async () => {
    const {
      buildAdminContentEditorIslandProps,
      createEmptyAdminContentEditorOutlines
    } = await import('../src/components/admin/admin-content-editor-registry');

    const props = buildAdminContentEditorIslandProps({
      payload: {
        collection: 'bits',
        entryId: '202606/bits-demo',
        publicEntryId: '202606/bits-demo',
        defaultPublicSlug: 'bits-demo',
        revision: 'revision',
        relativePath: 'src/content/bits/202606/bits-demo.md',
        writable: true,
        readonlyReason: null,
        bodyText: 'demo body',
        values: {
          title: 'Bits Demo',
          description: '',
          date: '2026-06-04T12:00:00+08:00',
          tagsText: '',
          draft: false,
          authorName: '',
          authorAvatar: '',
          imagesText: ''
        }
      },
      endpoints: {
        endpoint: '/api/admin/content/entry/',
        exportEndpoint: '/api/admin/content/export/',
        deleteEndpoint: '/api/admin/content/delete/',
        previewEndpoint: '/api/admin/preview/',
        imageUploadEndpoint: '/api/admin/images/upload/'
      },
      returnHref: '/admin/content/?collection=bits',
      defaultAuthor: {},
      outlines: createEmptyAdminContentEditorOutlines(),
      initialArticleInfoOpen: true,
      authorProfiles: []
    });

    expect(props).toMatchObject({
      initialArticleInfoOpen: true
    });
  });

  it('returns from the longform editor to the scoped longform content list', async () => {
    const { getAdminContentEditorPageRegistration } = await import('../src/components/admin/admin-content-editor-registry');
    const { getAdminContentEntryListHref } = await import('../src/lib/admin-console/content-routes');

    const collectionHref = getAdminContentEntryListHref('longform');
    const registration = getAdminContentEditorPageRegistration('longform');

    expect(registration.resolveReturnHref({
      withBase: (path: string) => path,
      collectionHref
    })).toBe(collectionHref);
    expect(collectionHref).toBe('/admin/content/?collection=longform');
  });
});
