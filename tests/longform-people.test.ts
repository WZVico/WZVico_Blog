import { describe, expect, it } from 'vitest';
import { getLongformArticlePeople } from '../src/lib/longform-people';
import type { LongformEntry } from '../src/lib/content';
import type { ThemeSettings } from '../src/lib/theme-settings';

const settings = {
  page: {
    bits: {
      defaultAuthor: {
        name: 'WZVico',
        avatar: 'author/default.webp'
      }
    }
  }
} as unknown as ThemeSettings;

const createEntry = (data: Record<string, unknown>): LongformEntry =>
  ({ data }) as unknown as LongformEntry;

const withBase = (path: string): string => `/${path}`;

describe('longform people', () => {
  it('resolves each configured author avatar from the author library', () => {
    const people = getLongformArticlePeople(
      createEntry({
        authors: [
          { name: 'Alice' },
          { name: 'Bob' }
        ]
      }),
      settings,
      withBase,
      [
        { name: 'Alice', avatar: 'author/alice.webp' },
        { name: 'Bob', avatar: 'author/bob.webp' }
      ]
    );

    expect(people.authors).toEqual([
      { name: 'Alice', avatar: '/author/alice.webp', showAvatar: true },
      { name: 'Bob', avatar: '/author/bob.webp', showAvatar: true }
    ]);
  });

  it('keeps explicit article avatar and showAvatar settings ahead of the author library', () => {
    const people = getLongformArticlePeople(
      createEntry({
        authors: [
          { name: 'Alice', avatar: 'author/custom.webp', showAvatar: false }
        ]
      }),
      settings,
      withBase,
      [
        { name: 'Alice', avatar: 'author/alice.webp' }
      ]
    );

    expect(people.authors).toEqual([
      { name: 'Alice', avatar: '/author/custom.webp', showAvatar: false }
    ]);
  });
});