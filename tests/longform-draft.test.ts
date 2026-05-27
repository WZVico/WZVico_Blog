import { describe, expect, it } from 'vitest';
import { parseInitialPerson } from '../src/scripts/longform-draft';

describe('longform draft editor', () => {
  it('parses an existing translator from the edit payload object', () => {
    expect(
      parseInitialPerson(
        JSON.stringify({
          name: 'WZVico',
          avatar: 'author/avatar.webp',
          showAvatar: false
        })
      )
    ).toEqual({
      name: 'WZVico',
      avatar: 'author/avatar.webp',
      showAvatar: false
    });
  });

  it('keeps compatibility with array-shaped initial people payloads', () => {
    expect(
      parseInitialPerson(
        JSON.stringify([
          {
            name: 'Alice',
            avatar: 'author/alice.webp'
          }
        ])
      )
    ).toEqual({
      name: 'Alice',
      avatar: 'author/alice.webp',
      showAvatar: true
    });
  });
});
