import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('astro:content', () => ({
  getCollection: vi.fn()
}));

import { getCollection } from 'astro:content';

const getCollectionMock = vi.mocked(getCollection);

const createLongform = (id: string, draft = false) => ({
  id,
  collection: 'longform',
  data: {
    title: id,
    date: new Date('2026-06-20T00:00:00.000Z'),
    tags: [],
    draft,
    archive: true
  }
});

const mockLongforms = (entries: object[]) => {
  getCollectionMock.mockImplementation(async (collection, filter) => {
    if (collection !== 'longform') return [] as never;
    const entryFilter = typeof filter === 'function'
      ? filter as (entry: object) => boolean
      : null;
    return (entryFilter ? entries.filter((entry) => entryFilter(entry)) : entries) as never;
  });
};

describe('longform public draft visibility', () => {
  beforeEach(() => {
    getCollectionMock.mockReset();
  });

  it('hides draft longforms by default in public longform queries', async () => {
    mockLongforms([
      createLongform('published-entry'),
      createLongform('draft-entry', true)
    ]);

    const { getVisibleLongforms } = await import('../src/lib/content');
    const visible = await getVisibleLongforms();

    expect(visible.map((entry) => entry.id)).toEqual(['published-entry']);
  });

  it('still allows maintainer callers to include draft longforms explicitly', async () => {
    mockLongforms([
      createLongform('published-entry'),
      createLongform('draft-entry', true)
    ]);

    const { getVisibleLongforms } = await import('../src/lib/content');
    const visible = await getVisibleLongforms({ includeDraft: true });

    expect(visible.map((entry) => entry.id)).toEqual(['published-entry', 'draft-entry']);
  });
});