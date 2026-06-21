import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyMarkdownToolToText } from '../src/components/admin/editor/markdown/editor-markdown-transforms';

describe('admin editor markdown transforms', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('wraps inline superscript and subscript text', () => {
    expect(applyMarkdownToolToText('H2O', { from: 1, to: 2 }, 'subscript')).toMatchObject({
      from: 1,
      to: 2,
      insert: '<sub>2</sub>',
      selection: { from: 6, to: 7 }
    });

    expect(applyMarkdownToolToText('x2', { from: 1, to: 2 }, 'superscript')).toMatchObject({
      from: 1,
      to: 2,
      insert: '<sup>2</sup>',
      selection: { from: 6, to: 7 }
    });
  });

  it('inserts the longform source quote block from selected text', () => {
    const edit = applyMarkdownToolToText('before\n重要句子\nafter', { from: 7, to: 11 }, 'pullquote');

    expect(edit.insert).toBe(
      '\n<blockquote class="pullquote">\n  重要句子\n  <cite>— 来源</cite>\n</blockquote>\n'
    );
  });

  it('creates a page anchor link and copies the matching target snippet', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_781_817_600_000);
    vi.spyOn(Math, 'random').mockReturnValue(0.123456);

    const edit = applyMarkdownToolToText('jump here', { from: 0, to: 9 }, 'pageAnchor');

    expect(edit.insert).toBe('[jump here](#user-content-jump-here-mqk06z9c-4fzyo)');
    expect(edit.clipboardText).toBe('<span id="jump-here-mqk06z9c-4fzyo" class="page-anchor"></span>');
    expect(edit.selection).toEqual({ from: 0, to: edit.insert.length });
  });
});
