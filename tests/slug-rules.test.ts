import { describe, expect, it } from 'vitest';
import {
  LONGFORM_PUBLIC_SLUG_RE,
  normalizeLongformSlugInput
} from '../src/utils/slug-rules';

describe('longform slug input', () => {
  it('lowercases English text and replaces whitespace runs with hyphens', () => {
    expect(normalizeLongformSlugInput('The End Of  Reading')).toBe('the-end-of-reading');
  });

  it('keeps a trailing separator while the user continues typing', () => {
    expect(normalizeLongformSlugInput('Hello ')).toBe('hello-');
    expect(normalizeLongformSlugInput('Hello World')).toMatch(LONGFORM_PUBLIC_SLUG_RE);
  });
});
