import { describe, expect, it } from 'vitest';

import { parsePicksMarkdownStats } from '../src/lib/admin-console/picks';

describe('admin-console/picks', () => {
  it('does not treat picks page frontmatter as a content update when no picks exist', () => {
    const source = [
      '---',
      'title: 拾选',
      'date: 2026-05-19',
      'intro:',
      '  - 页面介绍',
      'draft: false',
      '---',
      ''
    ].join('\n');

    expect(parsePicksMarkdownStats(source)).toMatchObject({
      itemCount: 0,
      latestPickDateLabel: '未设置日期'
    });
  });

  it('keeps the legacy index-body date fallback only when body items exist', () => {
    const source = [
      '---',
      'title: 拾选',
      'date: 2026-05-19',
      'draft: false',
      '---',
      '',
      '## 2026',
      '',
      '### 《示例》',
      '',
      '推荐理由'
    ].join('\n');

    expect(parsePicksMarkdownStats(source)).toMatchObject({
      itemCount: 1,
      latestPickDateLabel: '2026-05-19'
    });
  });
});
