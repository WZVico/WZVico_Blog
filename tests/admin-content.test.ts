import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/content', () => ({
  getLongformDerivedText: vi.fn(),
  getLongformSlug: vi.fn(),
  getReadsDerivedText: vi.fn(),
  getPageSlice: vi.fn(),
  getPublished: vi.fn(),
  getSortedLongforms: vi.fn(),
  getTotalPages: vi.fn(),
  isPicksIndexEntryId: (id: string) => id.replace(/\\/g, '/').replace(/\.md$/i, '') === 'index'
}));

vi.mock('../src/lib/bits', () => ({
  getBitAnchorId: (key: string) => `bit-${key}`,
  getBitSlug: vi.fn(),
  getBitsDerivedText: vi.fn(),
  getBitsSearchIndex: vi.fn(),
  getSortedBits: vi.fn()
}));

const contentLib = await import('../src/lib/content');
const bitsLib = await import('../src/lib/bits');
const {
  filterAdminContentItems,
  getAdminContentFilterState,
  getAdminContentOverviewData,
  getAdminContentPublicFallbackLabel
} = await import('../src/lib/admin-console/content');

type AdminContentIndexItem = import('../src/lib/admin-console/content').AdminContentIndexItem;

const mockGetLongformDerivedText = vi.mocked(contentLib.getLongformDerivedText);
const mockGetReadsDerivedText = vi.mocked(contentLib.getReadsDerivedText);
const mockGetPublished = vi.mocked(contentLib.getPublished);
const mockGetSortedLongforms = vi.mocked(contentLib.getSortedLongforms);
const mockGetBitsDerivedText = vi.mocked(bitsLib.getBitsDerivedText);
const mockGetBitsSearchIndex = vi.mocked(bitsLib.getBitsSearchIndex);
const mockGetSortedBits = vi.mocked(bitsLib.getSortedBits);

const createItem = (overrides: Partial<AdminContentIndexItem> = {}): AdminContentIndexItem => ({
  collection: 'longform',
  collectionLabel: '长文',
  id: 'longform/example.md',
  title: 'Example Entry',
  slug: 'example-entry',
  relativePath: 'src/content/longform/example.md',
  publicHref: '/archive/example-entry/',
  excerpt: 'Example summary',
  isDraft: false,
  archive: true,
  date: new Date('2026-04-01T08:00:00.000Z'),
  dateLabel: '2026-04-01 08:00',
  dateValue: '2026-04-01',
  year: 2026,
  tags: ['astro', 'admin'],
  frontmatterFields: [],
  searchHaystack: 'example entry example-entry astro admin',
  ...overrides
});

describe('admin-console/content', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes content filter state from URL search params', () => {
    const state = getAdminContentFilterState(new URLSearchParams([
      ['q', '  Astro   Admin  '],
      ['draft', 'draft'],
      ['tag', 'astro'],
      ['year', '2026'],
      ['page', '3'],
      ['entry', 'longform/example.md'],
      ['sort', 'title']
    ]));

    expect(state.query).toBe('Astro   Admin');
    expect(state.queryTokens).toEqual(['astro', 'admin']);
    expect(state.draft).toBe('draft');
    expect(state.tag).toBe('astro');
    expect(state.year).toBe(2026);
    expect(state.page).toBe(3);
    expect(state.entry).toBe('longform/example.md');
    expect(state.sort).toBe('title');
  });

  it('filters content items by query, draft, tag and year', () => {
    const items = [
      createItem(),
      createItem({
        id: 'longform/draft.md',
        title: 'Draft Entry',
        slug: 'draft-entry',
        isDraft: true,
        tags: ['draft'],
        year: 2025,
        dateValue: '2025-03-01',
        searchHaystack: 'draft entry draft-entry draft'
      }),
      createItem({
        id: 'bits/note.md',
        collection: 'bits',
        collectionLabel: '絮语',
        title: 'Bits Note',
        slug: 'bits-note',
        relativePath: 'src/content/bits/note.md',
        tags: ['bits'],
        searchHaystack: 'bits note bits-note bits'
      })
    ];

    const filtered = filterAdminContentItems(items, {
      query: 'example',
      queryTokens: ['example'],
      draft: 'published',
      tag: 'astro',
      year: 2026,
      page: 1,
      entry: '',
      sort: 'recent'
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe('longform/example.md');
  });

  it('builds overview summaries from metadata without deriving body text', async () => {
    mockGetLongformDerivedText.mockImplementation(() => {
      throw new Error('overview should not derive longform body text');
    });
    mockGetBitsDerivedText.mockImplementation(() => {
      throw new Error('overview should not derive bits body text');
    });
    mockGetBitsSearchIndex.mockImplementation(() => {
      throw new Error('overview should not build bits search index');
    });

    mockGetSortedLongforms.mockResolvedValue([
      {
        id: 'longform/latest.md',
        data: {
          date: new Date('2026-04-03T08:00:00.000Z'),
          draft: false
        }
      } as never,
      {
        id: 'longform/draft.md',
        data: {
          date: new Date('2026-03-01T08:00:00.000Z'),
          draft: true
        }
      } as never
    ]);
    mockGetSortedBits.mockResolvedValue([
      {
        id: 'bits/latest.md',
        data: {
          date: new Date('2026-04-02T08:00:00.000Z'),
          draft: false
        }
      } as never,
      {
        id: 'bits/draft.md',
        data: {
          date: new Date('2026-02-01T08:00:00.000Z'),
          draft: true
        }
      } as never
    ]);
    mockGetPublished.mockResolvedValue([
      {
        id: 'index',
        data: {
          date: new Date('2026-05-19T08:00:00.000Z'),
          draft: false
        }
      } as never,
      {
        id: 'picks/latest.md',
        data: {
          date: new Date('2026-01-15T08:00:00.000Z'),
          draft: false
        }
      } as never,
      {
        id: 'picks/draft.md',
        data: {
          date: null,
          draft: true
        }
      } as never
    ]);

    const overview = await getAdminContentOverviewData();
    const summaryByKey = Object.fromEntries(overview.summaries.map((summary) => [summary.key, summary]));

    expect(summaryByKey.longform).toMatchObject({
      key: 'longform',
      label: '长文',
      totalCount: 2,
      draftCount: 1
    });
    expect(summaryByKey.bits).toMatchObject({
      key: 'bits',
      label: '絮语',
      totalCount: 2,
      draftCount: 1
    });
    expect(summaryByKey.picks).toMatchObject({
      key: 'picks',
      label: '拾选',
      totalCount: 2,
      draftCount: 1
    });
    expect(summaryByKey.longform?.latestDateLabel).not.toBe('未设置日期');
    expect(summaryByKey.bits?.latestDateLabel).not.toBe('未设置日期');
    expect(summaryByKey.picks?.latestDateLabel).not.toBe('未设置日期');

    expect(mockGetLongformDerivedText).not.toHaveBeenCalled();
    expect(mockGetReadsDerivedText).not.toHaveBeenCalled();
    expect(mockGetBitsDerivedText).not.toHaveBeenCalled();
    expect(mockGetBitsSearchIndex).not.toHaveBeenCalled();
  });

  it('returns readable public fallback labels for non-public entries', () => {
    expect(getAdminContentPublicFallbackLabel(createItem({ isDraft: true, publicHref: null }))).toContain('draft');
    expect(
      getAdminContentPublicFallbackLabel(createItem({
        collection: 'picks',
        collectionLabel: '拾选',
        id: 'picks/index.md',
        publicHref: null,
        relativePath: 'src/content/picks/index.md'
      }))
    ).toContain('/picks/');
    expect(
      getAdminContentPublicFallbackLabel(createItem({
        collection: 'bits',
        collectionLabel: '絮语',
        id: 'bits/example.md',
        slug: 'bits-example',
        publicHref: null,
        relativePath: 'src/content/bits/example.md'
      }))
    ).toContain('bit-bits-example');
  });
});
