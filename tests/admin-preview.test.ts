import { describe, expect, it } from 'vitest';
import { renderAdminMarkdownPreview } from '../src/lib/admin-console/preview';

describe('admin markdown preview', () => {
  it('renders longform preview as the edited markdown body only', async () => {
    const result = await renderAdminMarkdownPreview({
      collection: 'longform',
      source: [
        '## 编辑器正文标题',
        '',
        '这段文字来自编辑器，包含 *斜体*、**加粗** 和 [链接](https://example.com)。',
        '',
        ':::tip[一个提示]',
        '这里是 callout 内容。',
        ':::',
        '',
        '```ts',
        'console.log("preview");',
        '```'
      ].join('\n')
    });

    expect(result.collection).toBe('longform');
    expect(result.html).toContain('<h2 data-admin-outline-key');
    expect(result.html).toMatch(/<h2[^>]+data-admin-source-start="0"[^>]+data-admin-source-end="10"/);
    expect(result.html).toMatch(/<p[^>]+data-admin-source-start="12"[^>]+data-admin-source-end=/);
    expect(result.html).toContain('编辑器正文标题');
    expect(result.html).toContain('<em>斜体</em>');
    expect(result.html).toContain('<strong>加粗</strong>');
    expect(result.html).toContain('class="callout tip"');
    expect(result.html).toContain('class="shiki');
    expect(result.html).not.toContain('class="article-header reader-exit-anchor"');
    expect(result.html).not.toContain('class="meta-line');
    expect(result.html).not.toContain('class="article-source-line"');
    expect(result.html).not.toContain('class="prose heti"');
    expect(result.html).not.toContain('编辑器里的长文标题');
    expect(result.html).not.toContain('*斜体*');
    expect(result.html).not.toContain('**加粗**');
    expect(result.html).not.toContain(':::tip');
  });

  it('adds source ranges to rendered blocks without exposing them outside the admin preview', async () => {
    const result = await renderAdminMarkdownPreview({
      collection: 'longform',
      source: [
        '第一段正文。',
        '',
        '- 列表项目一',
        '- 列表项目二',
        '',
        '```ts',
        'const answer = 42;',
        '```'
      ].join('\n')
    });

    expect(result.html).toMatch(/<p data-admin-source-start="0" data-admin-source-end="6">/);
    expect(result.html).toMatch(/<ul[^>]+data-admin-source-start="8"[^>]+data-admin-source-end=/);
    expect(result.html).toMatch(/<li[^>]+data-admin-source-start="8"[^>]+data-admin-source-end=/);
    expect(result.html).toMatch(/<div class="code-block"[^>]+data-admin-source-start=/);
  });

  it('keeps longform preview independent from article info/frontmatter', async () => {
    const result = await renderAdminMarkdownPreview({
      collection: 'longform',
      source: '正文 **只渲染正文**'
    });

    expect(result.html).toContain('<strong>只渲染正文</strong>');
    expect(result.html).not.toContain('class="article-header reader-exit-anchor"');
    expect(result.html).not.toContain('class="meta-line');
  });
});
