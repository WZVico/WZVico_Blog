import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const createJsonRequest = (url: string, payload: unknown, method = 'POST') =>
  new Request(url, {
    method,
    headers: {
      origin: new URL(url).origin,
      'content-type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify(payload)
  });

describe('admin content write api', () => {
  let tempRoot = '';

  beforeEach(async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), 'astro-whono-content-'));
    process.env.ASTRO_WHONO_INTERNAL_TEST_PROJECT_ROOT = tempRoot;

    await mkdir(path.join(tempRoot, 'src', 'content', 'longform'), { recursive: true });
    await mkdir(path.join(tempRoot, 'src', 'content', 'bits'), { recursive: true });
    await mkdir(path.join(tempRoot, 'src', 'content', 'picks'), { recursive: true });
    await mkdir(path.join(tempRoot, 'src', 'content', 'materials'), { recursive: true });
    await mkdir(path.join(tempRoot, 'public', 'author'), { recursive: true });

    await writeFile(path.join(tempRoot, 'public', 'author', 'alice.webp'), 'avatar');
    await writeFile(
      path.join(tempRoot, 'src', 'content', 'longform', 'demo.md'),
      ['---', 'title: Demo Longform', 'date: 2026-03-18', 'draft: false', '---', '', '# Longform', '', '正文保持不变。', ''].join('\n'),
      'utf8'
    );
    await writeFile(
      path.join(tempRoot, 'src', 'content', 'longform', 'other.md'),
      ['---', 'title: Other Longform', 'date: 2026-03-20', 'slug: existing-longform', '---', '', '# Other', '', 'duplicate guard', ''].join('\n'),
      'utf8'
    );
    await writeFile(
      path.join(tempRoot, 'src', 'content', 'bits', 'demo.md'),
      [
        '---',
        'date: 2025-02-03T01:01:45+08:00',
        'tags:',
        '  - Markdown',
        'images:',
        '  - src: bits/demo.webp',
        '    width: 800',
        '    height: 600',
        '---',
        '',
        'Bits body',
        ''
      ].join('\n'),
      'utf8'
    );
    await writeFile(
      path.join(tempRoot, 'src', 'content', 'picks', 'index.md'),
      ['---', 'title: picks', 'date: 2026-01-10', '---', '', 'picks body', ''].join('\n'),
      'utf8'
    );
    await mkdir(path.join(tempRoot, 'src', 'content', 'picks', '202606'), { recursive: true });
    await writeFile(
      path.join(tempRoot, 'src', 'content', 'picks', '202606', 'pick.md'),
      [
        '---',
        'title: 《旧书》',
        'date: 2026-06-01T12:00:00+08:00',
        'year: 2026',
        'authors:',
        '  - 旧作者',
        'tags:',
        '  - 旧',
        'draft: false',
        '---',
        '',
        '旧推荐。',
        ''
      ].join('\n'),
      'utf8'
    );
    await mkdir(path.join(tempRoot, 'src', 'content', 'materials', '202606'), { recursive: true });
    await writeFile(
      path.join(tempRoot, 'src', 'content', 'materials', '202606', 'material.md'),
      [
        '---',
        'title: 旧资料',
        'href: "https://example.com/old"',
        'date: 2026-06-02',
        'label: OLD',
        'description: 旧描述',
        '---',
        '',
        'legacy body',
        ''
      ].join('\n'),
      'utf8'
    );
  });

  afterEach(async () => {
    vi.useRealTimers();
    delete process.env.ASTRO_WHONO_INTERNAL_TEST_PROJECT_ROOT;
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('loads editable payload for longform entries', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const payload = await readAdminContentEntryEditorPayload('longform', 'demo');

    expect(payload.writable).toBe(true);
    expect(payload.values.title).toBe('Demo Longform');
    expect(payload.values.date).toBe('2026-03-18');
    if (payload.collection === 'longform') {
      expect(payload.values.publishedAt).toBe('');
    }
  });

  it('loads legacy longform datetime dates for compatibility', async () => {
    await writeFile(
      path.join(tempRoot, 'src', 'content', 'longform', 'legacy-datetime.md'),
      [
        '---',
        'title: Legacy Datetime',
        'date: 2024-11-23T18:00:00+08:00',
        'draft: false',
        '---',
        '',
        'legacy body',
        ''
      ].join('\n'),
      'utf8'
    );

    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const payload = await readAdminContentEntryEditorPayload('longform', 'legacy-datetime');

    if (payload.collection === 'longform') {
      expect(payload.values.date).toBe('2024-11-23');
      expect(payload.values.publishedAt).toBe('2024-11-23T18:00:00+08:00');
    }
  });

  it('loads editable payloads for picks and materials entries', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');

    const pickPayload = await readAdminContentEntryEditorPayload('picks', '202606/pick');
    expect(pickPayload.writable).toBe(true);
    if (pickPayload.collection === 'picks') {
      expect(pickPayload.values.title).toBe('《旧书》');
      expect(pickPayload.values.year).toBe('2026');
      expect(pickPayload.values.status).toBe('shared');
      expect(pickPayload.values.authorsText).toBe('旧作者');
      expect(pickPayload.bodyText).toContain('旧推荐');
    }

    const materialPayload = await readAdminContentEntryEditorPayload('materials', '202606/material');
    expect(materialPayload.writable).toBe(true);
    if (materialPayload.collection === 'materials') {
      expect(materialPayload.values.title).toBe('旧资料');
      expect(materialPayload.values.href).toBe('https://example.com/old');
      expect(materialPayload.values.label).toBe('OLD');
    }
  });

  it('returns structured json errors for invalid write inputs', async () => {
    const { POST } = await import('../src/pages/api/admin/content/entry');

    const cases = [
      {
        body: { collection: 'page', entryId: 'demo', revision: 'stale', frontmatter: {} },
        status: 400,
        issuePath: 'collection',
        message: '不支持的 content collection'
      },
      {
        body: { collection: 'picks', entryId: '202606/pick', revision: 'stale' },
        status: 400,
        issuePath: 'frontmatter',
        message: '请求体缺少 frontmatter 字段'
      },
      {
        body: { collection: 'longform', entryId: '../secret', revision: 'stale', frontmatter: {} },
        status: 400,
        issuePath: 'entryId',
        message: 'entryId'
      },
      {
        body: { collection: 'longform', entryId: 'missing', revision: 'stale', frontmatter: {} },
        status: 404,
        issuePath: 'entryId',
        message: '未找到 content 源文件'
      },
      {
        body: { collection: 'longform', entryId: 'demo', revision: 'stale', frontmatter: [] },
        status: 400,
        issuePath: 'frontmatter',
        message: 'frontmatter 必须是对象'
      }
    ];

    for (const testCase of cases) {
      const response = await POST({
        request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1', testCase.body),
        url: new URL('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1')
      } as never);

      expect(response.status).toBe(testCase.status);
      const payload = JSON.parse(await response.text());
      expect(payload.ok).toBe(false);
      expect(payload.errors[0]).toContain(testCase.message);
      expect(payload.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: testCase.issuePath
          })
        ])
      );
    }
  });

  it('supports dry-run and real writes for longform frontmatter without changing body', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const { POST } = await import('../src/pages/api/admin/content/entry');

    const current = await readAdminContentEntryEditorPayload('longform', 'demo');
    const nextValues = {
      ...current.values,
      title: 'Edited Longform',
      tagsText: 'astro\nadmin'
    };

    const dryRunResponse = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1', {
        collection: 'longform',
        entryId: 'demo',
        revision: current.revision,
        frontmatter: nextValues
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1')
    } as never);

    expect(dryRunResponse.status).toBe(200);
    const dryRunPayload = JSON.parse(await dryRunResponse.text());
    expect(dryRunPayload.ok).toBe(true);
    expect(dryRunPayload.dryRun).toBe(true);
    expect(dryRunPayload.result.changedFields).toEqual(['title', 'tags']);

    const before = await readFile(path.join(tempRoot, 'src', 'content', 'longform', 'demo.md'), 'utf8');

    const writeResponse = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry', {
        collection: 'longform',
        entryId: 'demo',
        revision: current.revision,
        frontmatter: nextValues
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry')
    } as never);

    expect(writeResponse.status).toBe(200);
    const writePayload = JSON.parse(await writeResponse.text());
    expect(writePayload.ok).toBe(true);
    expect(writePayload.result.written).toBe(true);

    const after = await readFile(path.join(tempRoot, 'src', 'content', 'longform', 'demo.md'), 'utf8');
    expect(after).toContain('title: Edited Longform');
    expect(after).toContain('tags:');
    expect(after.endsWith('# Longform\n\n正文保持不变。\n')).toBe(true);
    expect(after).not.toBe(before);
  });

  it('writes longform author and translation metadata', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const { POST } = await import('../src/pages/api/admin/content/entry');

    const current = await readAdminContentEntryEditorPayload('longform', 'demo');
    const nextValues = {
      ...current.values,
      authorName: 'Alice',
      authorAvatar: 'author/alice.webp',
      authorShowAvatar: false,
      translationTranslator: 'WZVico',
      translationSource: 'Original Essay',
      translationSourceUrl: 'https://example.com/original'
    };

    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry', {
        collection: 'longform',
        entryId: 'demo',
        revision: current.revision,
        frontmatter: nextValues
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry')
    } as never);

    expect(response.status).toBe(200);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(true);
    expect(payload.result.changedFields).toEqual(['author', 'translation']);

    const after = await readFile(path.join(tempRoot, 'src', 'content', 'longform', 'demo.md'), 'utf8');
    expect(after).toContain('author:');
    expect(after).toContain('name: Alice');
    expect(after).toContain('avatar: author/alice.webp');
    expect(after).toContain('showAvatar: false');
    expect(after).toContain('translation:');
    expect(after).toContain('translator: WZVico');
    expect(after).toContain('source: Original Essay');
    expect(after).toContain('sourceUrl: https://example.com/original');
  });

  it('normalizes legacy longform datetime dates to date plus publishedAt on save', async () => {
    const legacyPath = path.join(tempRoot, 'src', 'content', 'longform', 'legacy-datetime.md');
    await writeFile(
      legacyPath,
      [
        '---',
        'title: Legacy Datetime',
        'date: 2024-11-23T18:00:00+08:00',
        'draft: false',
        '---',
        '',
        'legacy body',
        ''
      ].join('\n'),
      'utf8'
    );

    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const { POST } = await import('../src/pages/api/admin/content/entry');

    const current = await readAdminContentEntryEditorPayload('longform', 'legacy-datetime');
    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry', {
        collection: 'longform',
        entryId: 'legacy-datetime',
        revision: current.revision,
        frontmatter: {
          ...current.values,
          title: 'Legacy Datetime Updated'
        }
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry')
    } as never);

    expect(response.status).toBe(200);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(true);
    expect(payload.result.changedFields).toEqual(['title', 'date', 'publishedAt']);

    const after = await readFile(legacyPath, 'utf8');
    expect(after).toContain('title: Legacy Datetime Updated');
    expect(after).toContain('date: 2024-11-23');
    expect(after).toContain('publishedAt: 2024-11-23T18:00:00+08:00');
    expect(after).not.toContain('date: 2024-11-23T18:00:00+08:00');
  });

  it('writes explicit longform publishedAt without forcing date datetime syntax', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const { POST } = await import('../src/pages/api/admin/content/entry');

    const current = await readAdminContentEntryEditorPayload('longform', 'demo');
    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry', {
        collection: 'longform',
        entryId: 'demo',
        revision: current.revision,
        frontmatter: {
          ...current.values,
          publishedAt: '2026-03-18T19:30:00+08:00'
        }
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry')
    } as never);

    expect(response.status).toBe(200);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(true);
    expect(payload.result.changedFields).toEqual(['publishedAt']);

    const after = await readFile(path.join(tempRoot, 'src', 'content', 'longform', 'demo.md'), 'utf8');
    expect(after).toContain('date: 2026-03-18');
    expect(after).toContain('publishedAt: 2026-03-18T19:30:00+08:00');
  });

  it('rejects impossible longform publishedAt calendar dates before writing', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const { POST } = await import('../src/pages/api/admin/content/entry');

    const current = await readAdminContentEntryEditorPayload('longform', 'demo');
    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1', {
        collection: 'longform',
        entryId: 'demo',
        revision: current.revision,
        frontmatter: {
          ...current.values,
          publishedAt: '2026-02-31T19:30:00+08:00'
        }
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1')
    } as never);

    expect(response.status).toBe(400);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(false);
    expect(payload.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'publishedAt'
        })
      ])
    );
  });

  it('returns field issues for invalid bits author avatar paths', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const { POST } = await import('../src/pages/api/admin/content/entry');
    const current = await readAdminContentEntryEditorPayload('bits', 'demo');

    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1', {
        collection: 'bits',
        entryId: 'demo',
        revision: current.revision,
        frontmatter: {
          ...current.values,
          authorAvatar: 'https://example.com/avatar.webp'
        }
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1')
    } as never);

    expect(response.status).toBe(400);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(false);
    expect(payload.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'authorAvatar'
        })
      ])
    );
  });

  it('accepts missing bits image dimensions and missing local avatar files as non-blocking content data', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const { POST } = await import('../src/pages/api/admin/content/entry');
    const current = await readAdminContentEntryEditorPayload('bits', 'demo');

    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1', {
        collection: 'bits',
        entryId: 'demo',
        revision: current.revision,
        frontmatter: {
          ...current.values,
          authorAvatar: 'author/missing.webp',
          imagesText: JSON.stringify([
            {
              src: 'bits/demo.webp',
              alt: 'demo without dimensions'
            }
          ])
        }
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1')
    } as never);

    expect(response.status).toBe(200);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(true);
    expect(payload.result.changedFields).toEqual(
      expect.arrayContaining(['author', 'images'])
    );
  });

  it('rejects non-https bits image URLs instead of treating them as local files', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const { POST } = await import('../src/pages/api/admin/content/entry');
    const current = await readAdminContentEntryEditorPayload('bits', 'demo');

    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1', {
        collection: 'bits',
        entryId: 'demo',
        revision: current.revision,
        frontmatter: {
          ...current.values,
          imagesText: JSON.stringify([
            {
              src: 'http://example.com/demo.png',
              width: 800,
              height: 600
            }
          ])
        }
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1')
    } as never);

    expect(response.status).toBe(400);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(false);
    expect(payload.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'images[0].src',
          message: expect.stringContaining('https://')
        })
      ])
    );
  });

  it('rejects reserved longform slugs before writing invalid content', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const { POST } = await import('../src/pages/api/admin/content/entry');
    const current = await readAdminContentEntryEditorPayload('longform', 'demo');

    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1', {
        collection: 'longform',
        entryId: 'demo',
        revision: current.revision,
        frontmatter: {
          ...current.values,
          slug: 'tag'
        }
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1')
    } as never);

    expect(response.status).toBe(400);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(false);
    expect(payload.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'slug'
        })
      ])
    );
  });

  it('rejects duplicate public longform slugs before writing invalid content', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const { POST } = await import('../src/pages/api/admin/content/entry');
    const current = await readAdminContentEntryEditorPayload('longform', 'demo');

    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1', {
        collection: 'longform',
        entryId: 'demo',
        revision: current.revision,
        frontmatter: {
          ...current.values,
          slug: 'existing-longform'
        }
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1')
    } as never);

    expect(response.status).toBe(400);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(false);
    expect(payload.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'slug'
        })
      ])
    );
  });

  it('rejects malformed longform frontmatter payloads with field errors instead of 500', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const { POST } = await import('../src/pages/api/admin/content/entry');
    const current = await readAdminContentEntryEditorPayload('longform', 'demo');

    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1', {
        collection: 'longform',
        entryId: 'demo',
        revision: current.revision,
        frontmatter: {
          ...current.values,
          title: 42
        }
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1')
    } as never);

    expect(response.status).toBe(400);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(false);
    expect(payload.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'title'
        })
      ])
    );
  });

  it('supports dry-run and real writes for picks frontmatter and body', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const { POST } = await import('../src/pages/api/admin/content/entry');
    const current = await readAdminContentEntryEditorPayload('picks', '202606/pick');
    if (current.collection !== 'picks') throw new Error('Expected picks payload');

    const nextValues = {
      ...current.values,
      title: '《新书》',
      tagsText: '阅读\n新'
    };

    const dryRunResponse = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1', {
        collection: 'picks',
        entryId: '202606/pick',
        revision: current.revision,
        frontmatter: nextValues,
        body: '新的推荐理由。\n'
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1')
    } as never);

    expect(dryRunResponse.status).toBe(200);
    const dryRunPayload = JSON.parse(await dryRunResponse.text());
    expect(dryRunPayload.ok).toBe(true);
    expect(dryRunPayload.result.changedFields).toEqual(['title', 'tags', 'body']);

    const writeResponse = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry', {
        collection: 'picks',
        entryId: '202606/pick',
        revision: current.revision,
        frontmatter: nextValues,
        body: '新的推荐理由。\n'
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry')
    } as never);

    expect(writeResponse.status).toBe(200);
    const writePayload = JSON.parse(await writeResponse.text());
    expect(writePayload.ok).toBe(true);
    expect(writePayload.result.written).toBe(true);
    expect(writePayload.payload.values.title).toBe('《新书》');

    const after = await readFile(path.join(tempRoot, 'src', 'content', 'picks', '202606', 'pick.md'), 'utf8');
    expect(after).toContain('title: 《新书》');
    expect(after).toContain('tags:\n  - 阅读\n  - 新');
    expect(after.endsWith('新的推荐理由。\n')).toBe(true);
  });

  it('validates shared picks body and clears body for planned picks', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const { POST } = await import('../src/pages/api/admin/content/entry');
    const current = await readAdminContentEntryEditorPayload('picks', '202606/pick');
    if (current.collection !== 'picks') throw new Error('Expected picks payload');

    const invalidSharedResponse = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1', {
        collection: 'picks',
        entryId: '202606/pick',
        revision: current.revision,
        frontmatter: current.values,
        body: ''
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry?dryRun=1')
    } as never);

    expect(invalidSharedResponse.status).toBe(400);
    const invalidPayload = JSON.parse(await invalidSharedResponse.text());
    expect(invalidPayload.ok).toBe(false);
    expect(invalidPayload.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'body' })
      ])
    );

    const plannedResponse = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry', {
        collection: 'picks',
        entryId: '202606/pick',
        revision: current.revision,
        frontmatter: {
          ...current.values,
          status: 'planned'
        },
        body: '不应保存。'
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry')
    } as never);

    expect(plannedResponse.status).toBe(200);
    const plannedPayload = JSON.parse(await plannedResponse.text());
    expect(plannedPayload.ok).toBe(true);
    expect(plannedPayload.result.changedFields).toEqual(['status', 'body']);

    const after = await readFile(path.join(tempRoot, 'src', 'content', 'picks', '202606', 'pick.md'), 'utf8');
    expect(after).toContain('status: planned');
    expect(after).not.toContain('旧推荐');
    expect(after).not.toContain('不应保存');
    expect(after.trim().endsWith('---')).toBe(true);
  });

  it('writes materials frontmatter through content editor and normalizes links', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const { POST } = await import('../src/pages/api/admin/content/entry');
    const current = await readAdminContentEntryEditorPayload('materials', '202606/material');
    if (current.collection !== 'materials') throw new Error('Expected materials payload');

    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry', {
        collection: 'materials',
        entryId: '202606/material',
        revision: current.revision,
        frontmatter: {
          ...current.values,
          title: '新资料',
          href: 'example.com/new',
          label: 'PDF',
          description: '新描述'
        }
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry')
    } as never);

    expect(response.status).toBe(200);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(true);
    expect(payload.result.changedFields).toEqual(['title', 'href', 'label', 'description', 'body']);
    expect(payload.payload.values.href).toBe('https://example.com/new');

    const after = await readFile(path.join(tempRoot, 'src', 'content', 'materials', '202606', 'material.md'), 'utf8');
    expect(after).toContain('title: 新资料');
    expect(after).toContain('https://example.com/new');
    expect(after).toContain('label: PDF');
    expect(after).toContain('description: 新描述');
    expect(after).not.toContain('legacy body');
  });

  it('rejects stale revisions for picks content editor writes', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const { POST } = await import('../src/pages/api/admin/content/entry');
    const sourcePath = path.join(tempRoot, 'src', 'content', 'picks', '202606', 'pick.md');
    const current = await readAdminContentEntryEditorPayload('picks', '202606/pick');
    if (current.collection !== 'picks') throw new Error('Expected picks payload');

    await writeFile(
      sourcePath,
      [
        '---',
        'title: 《外部更新》',
        'date: 2026-06-01T12:00:00+08:00',
        'year: 2026',
        'authors:',
        '  - 旧作者',
        '---',
        '',
        '外部正文。',
        ''
      ].join('\n'),
      'utf8'
    );

    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry', {
        collection: 'picks',
        entryId: '202606/pick',
        revision: current.revision,
        frontmatter: {
          ...current.values,
          title: '《本地更新》'
        },
        body: '本地正文。'
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry')
    } as never);

    expect(response.status).toBe(409);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(false);
    expect(payload.errors[0]).toContain('外部更新');
    expect(payload.payload.values.title).toBe('《外部更新》');
    expect(await readFile(sourcePath, 'utf8')).toContain('外部正文');
  });
  it('creates longform entries through content console inside monthly folders', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 4, 9, 12, 13));

    const { POST } = await import('../src/pages/api/admin/content/create');
    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/create', {
        collection: 'longform',
        entryId: 'content-console-longform',
        frontmatter: {
          title: 'Content Console Longform',
          description: 'created from content console',
          date: '2026-06-04',
          publishedAt: '',
          updatedAt: '',
          tagsText: 'admin\ncontent',
          draft: false,
          archive: true,
          slug: '',
          cover: '',
          badge: '',
          authorsText: '',
          authorName: '',
          authorAvatar: '',
          authorShowAvatar: true,
          translationTranslator: '',
          translationAvatar: '',
          translationShowAvatar: true,
          translationSource: '',
          translationSourceUrl: ''
        }
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/create')
    } as never);

    expect(response.status).toBe(200);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(true);
    expect(payload.result.relativePath).toBe('src/content/longform/202606/content-console-longform.md');
    expect(payload.editHref).toBe('/admin/content/longform/_edit/202606/content-console-longform/');
    expect(payload.payload.collection).toBe('longform');

    const after = await readFile(path.join(tempRoot, payload.result.relativePath), 'utf8');
    expect(after).toContain('title: Content Console Longform');
    expect(after).toContain('draft: true');
    expect(after).toContain('slug: content-console-longform');
    expect(after).toContain('tags: [ admin, content ]');
  });

  it('creates picks entries through content console inside the current month folder', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 4, 17, 28, 50));

    const { POST } = await import('../src/pages/api/admin/content/create');
    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/create', {
        collection: 'picks',
        frontmatter: {
          title: '新书',
          status: 'shared',
          authorsText: '新作者',
          reason: '新的推荐理由。',
          tagsText: '经济\n阅读'
        }
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/create')
    } as never);

    expect(response.status).toBe(200);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(true);
    expect(payload.result.relativePath).toBe('src/content/picks/202606/2026-06-04-172850.md');
    expect(payload.editHref).toBe('/admin/content/picks/_edit/202606/2026-06-04-172850/');
    expect(payload.payload.collection).toBe('picks');

    const after = await readFile(path.join(tempRoot, payload.result.relativePath), 'utf8');
    expect(after).toContain('title: 《新书》');
    expect(after).toContain('authors:\n  - 新作者');
    expect(after).toContain('新的推荐理由。');
    expect(after).toContain('tags:\n  - 经济\n  - 阅读');
  });

  it('creates materials entries through content console inside the current month folder', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 4, 17, 28, 50));

    const { POST } = await import('../src/pages/api/admin/content/create');
    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/create', {
        collection: 'materials',
        frontmatter: {
          title: '年度资料',
          href: 'example.com/material',
          label: 'PDF',
          description: '资料描述'
        }
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/create')
    } as never);

    expect(response.status).toBe(200);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(true);
    expect(payload.result.relativePath).toBe('src/content/materials/202606/年度资料-2026-06-04-172850.md');
    expect(payload.editHref).toBe('/admin/content/materials/_edit/202606/%E5%B9%B4%E5%BA%A6%E8%B5%84%E6%96%99-2026-06-04-172850/');
    expect(payload.payload.collection).toBe('materials');
    expect(payload.payload.values.href).toBe('https://example.com/material');

    const after = await readFile(path.join(tempRoot, payload.result.relativePath), 'utf8');
    expect(after).toContain('title: 年度资料');
    expect(after).toContain('href: https://example.com/material');
    expect(after).toContain('label: PDF');
  });
  it('creates picks entries as monthly single-entry markdown files', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 4, 17, 28, 50));

    const picksPath = path.join(tempRoot, 'src', 'content', 'picks', 'index.md');
    await writeFile(
      picksPath,
      [
        '---',
        'title: picks',
        'date: 2026-01-10',
        '---',
        '',
        '## 2025',
        '',
        '### 《旧书》 - 作者',
        '',
        '旧推荐。',
        '',
        '<p class="pick-tags" aria-label="标签"><span class="pick-tag">#旧</span></p>',
        ''
      ].join('\n'),
      'utf8'
    );

    const { POST } = await import('../src/pages/api/admin/category/picks');
    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/category/picks', {
        item: {
          year: '2026',
          title: '新书',
          authors: '新作者',
          reason: '新的推荐理由。',
          tags: '经济 阅读'
        }
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/category/picks')
    } as never);

    expect(response.status).toBe(200);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(true);
    expect(payload.result.relativePath).toBe('src/content/picks/202606/2026-06-04-172850.md');

    const createdPath = path.join(tempRoot, payload.result.relativePath);
    const after = await readFile(createdPath, 'utf8');
    expect(after).toContain('title: 《新书》');
    expect(after).toContain('authors:\n  - 新作者');
    expect(after).toContain('新的推荐理由。');
    expect(after).toContain('tags:\n  - 经济\n  - 阅读');
  });

  it('rejects duplicate picks entries in the same year', async () => {
    const picksPath = path.join(tempRoot, 'src', 'content', 'picks', 'index.md');
    await writeFile(
      picksPath,
      [
        '---',
        'title: picks',
        'date: 2026-01-10',
        '---',
        '',
        '## 2026',
        '',
        '### 《新书》- 新作者',
        '',
        '已有推荐。',
        ''
      ].join('\n'),
      'utf8'
    );

    const { POST } = await import('../src/pages/api/admin/category/picks');
    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/category/picks', {
        item: {
          year: '2026',
          title: '《新书》',
          authors: '新作者',
          reason: '重复推荐。',
          tags: '阅读'
        }
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/category/picks')
    } as never);

    expect(response.status).toBe(409);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(false);
    expect(payload.errors[0]).toContain('已存在');
  });

  it('rejects duplicate picks entries stored in a monthly folder from the same year', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 4, 17, 28, 50));

    const monthlyDir = path.join(tempRoot, 'src', 'content', 'picks', '202606');
    await mkdir(monthlyDir, { recursive: true });
    await writeFile(
      path.join(monthlyDir, '2026-06-01-120000.md'),
      [
        '---',
        'title: 《新书》',
        'date: 2026-06-01T12:00:00+08:00',
        'year: 2026',
        'authors:',
        '  - 新作者',
        '---',
        '',
        '已有推荐。',
        ''
      ].join('\n'),
      'utf8'
    );

    const { POST } = await import('../src/pages/api/admin/category/picks');
    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/category/picks', {
        item: {
          title: '《新书》',
          authors: '新作者',
          reason: '重复推荐。',
          tags: '阅读'
        }
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/category/picks')
    } as never);

    expect(response.status).toBe(409);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(false);
    expect(payload.errors[0]).toContain('已存在');
  });

  it('creates materials entries inside the current month folder', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 4, 17, 28, 50));

    const { POST } = await import('../src/pages/api/admin/category/materials');
    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/category/materials', {
        item: {
          title: '年度资料',
          href: 'example.com/material',
          label: 'PDF',
          description: '资料描述'
        }
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/category/materials')
    } as never);

    expect(response.status).toBe(200);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(true);
    expect(payload.result.relativePath).toBe('src/content/materials/202606/年度资料-2026-06-04-172850.md');

    const after = await readFile(path.join(tempRoot, payload.result.relativePath), 'utf8');
    expect(after).toContain('title: 年度资料');
    expect(after).toContain('href: "https://example.com/material"');
    expect(after).toContain('label: PDF');
  });

  it('creates bits entries inside the current month folder', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 4, 17, 28, 50));

    const markdown = ['---', 'date: 2026-05-20T12:00:00+08:00', '---', '', '新的絮语', ''].join('\n');
    const { POST } = await import('../src/pages/api/admin/category/bits');
    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/category/bits', {
        markdown
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/category/bits')
    } as never);

    expect(response.status).toBe(200);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(true);
    expect(payload.result.relativePath).toBe('src/content/bits/202606/bits-2026-06-04-1728.md');

    const after = await readFile(path.join(tempRoot, payload.result.relativePath), 'utf8');
    expect(after).toBe(markdown);
  });

  it('creates longform entries from the server creation date with draft off by default', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 4, 9, 12, 13));

    const { POST } = await import('../src/pages/api/admin/category/longform');
    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/category/longform', {
        item: {
          title: '我的长文草稿',
          slug: 'my-longform-draft',
          description: '用于测试长文创建。',
          date: '1999-01-01',
          publishedAt: '1999-01-01T12:00:00+08:00',
          cover: '/images/archive/legacy-cover.webp',
          badge: '草稿',
          tags: '写作 Markdown',
          authors: [
            {
              name: 'Alice',
              avatar: 'author/alice.webp',
              showAvatar: false
            },
            {
              name: 'Bob',
              avatar: 'author/bob.webp'
            }
          ],
          translationPerson: {
            name: 'WZVico',
            avatar: 'author/alice.webp',
            showAvatar: false
          },
          translationSource: 'Original Essay',
          translationSourceUrl: 'https://example.com/original',
          body: '第一段。\n\n<!-- more -->\n\n后续正文。'
        }
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/category/longform')
    } as never);

    expect(response.status).toBe(200);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(true);
    expect(payload.result.relativePath).toBe('src/content/longform/202606/my-longform-draft.md');
    expect(payload.result.publicHref).toBe('/archive/my-longform-draft/');

    const after = await readFile(path.join(tempRoot, payload.result.relativePath), 'utf8');
    expect(after).toContain('title: 我的长文草稿');
    expect(after).toContain('description: 用于测试长文创建。');
    expect(after).toContain('date: 2026-06-04');
    expect(after).not.toContain('publishedAt:');
    expect(after).not.toContain('cover:');
    expect(after).toContain('slug: my-longform-draft');
    expect(after).toContain('badge: 草稿');
    expect(after).toContain('tags:\n  - 写作\n  - Markdown');
    expect(after).toContain('draft: false');
    expect(after).toContain('archive: true');
    expect(after).toContain('authors:\n  - name: Alice\n    avatar: author/alice.webp\n    showAvatar: false\n  - name: Bob\n    avatar: author/bob.webp');
    expect(after).toContain('translation:\n  translator: WZVico\n  avatar: author/alice.webp\n  showAvatar: false\n  source: Original Essay\n  sourceUrl: https://example.com/original');
    expect(after).toContain('<!-- more -->');
    expect(after.endsWith('后续正文。\n')).toBe(true);
  });

  it('preserves existing longform cover when category edits omit the cover field', async () => {
    const sourcePath = path.join(tempRoot, 'src', 'content', 'longform', 'demo.md');
    await writeFile(
      sourcePath,
      [
        '---',
        'title: Demo Longform',
        'date: 2026-03-18',
        'cover: /images/archive/existing-cover.webp',
        'draft: false',
        '---',
        '',
        '# Longform',
        '',
        '正文保持不变。',
        ''
      ].join('\n'),
      'utf8'
    );

    const { readAdminCategoryEntryPayload } = await import('../src/lib/admin-console/category-entry');
    const { POST } = await import('../src/pages/api/admin/category/entry');
    const current = await readAdminCategoryEntryPayload('longform', 'demo');
    const fieldsWithoutCover = { ...current.values };
    delete fieldsWithoutCover.cover;

    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/category/entry', {
        collection: 'longform',
        entryId: 'demo',
        revision: current.revision,
        fields: {
          ...fieldsWithoutCover,
          title: 'Edited Without Cover Field'
        }
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/category/entry')
    } as never);

    expect(response.status).toBe(200);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(true);

    const after = await readFile(sourcePath, 'utf8');
    expect(after).toContain('title: Edited Without Cover Field');
    expect(after).toContain('cover: /images/archive/existing-cover.webp');
  });

  it('deletes category content files only when the revision matches', async () => {
    const sourcePath = path.join(tempRoot, 'src', 'content', 'longform', 'demo.md');
    const { readAdminCategoryEntryPayload } = await import('../src/lib/admin-console/category-entry');
    const { DELETE } = await import('../src/pages/api/admin/category/entry');
    const current = await readAdminCategoryEntryPayload('longform', 'demo');

    const response = await DELETE({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/category/entry', {
        collection: 'longform',
        entryId: 'demo',
        revision: current.revision
      }, 'DELETE'),
      url: new URL('http://127.0.0.1:4321/api/admin/category/entry')
    } as never);

    expect(response.status).toBe(200);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(true);
    expect(payload.result.deleted).toBe(true);
    expect(payload.result.relativePath).toBe('src/content/longform/demo.md');
    await expect(readFile(sourcePath, 'utf8')).rejects.toThrow();
  });

  it('rejects stale revisions before deleting category content files', async () => {
    const sourcePath = path.join(tempRoot, 'src', 'content', 'longform', 'demo.md');
    const { readAdminCategoryEntryPayload } = await import('../src/lib/admin-console/category-entry');
    const { DELETE } = await import('../src/pages/api/admin/category/entry');
    const current = await readAdminCategoryEntryPayload('longform', 'demo');

    await writeFile(
      sourcePath,
      ['---', 'title: External Delete Guard', 'date: 2026-03-18', '---', '', 'changed body', ''].join('\n'),
      'utf8'
    );

    const response = await DELETE({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/category/entry', {
        collection: 'longform',
        entryId: 'demo',
        revision: current.revision
      }, 'DELETE'),
      url: new URL('http://127.0.0.1:4321/api/admin/category/entry')
    } as never);

    expect(response.status).toBe(409);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(false);
    expect(payload.errors[0]).toContain('外部更新');
    expect(payload.payload.values.title).toBe('External Delete Guard');
    expect(await readFile(sourcePath, 'utf8')).toContain('External Delete Guard');
  });

  it('saves the managed author library for longform author and translator options', async () => {
    const { POST } = await import('../src/pages/api/admin/category/authors');
    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/category/authors', {
        authors: [
          {
            name: 'Alice',
            avatar: 'author/alice.webp'
          },
          {
            name: 'WZVico',
            avatar: ''
          }
        ]
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/category/authors')
    } as never);

    expect(response.status).toBe(200);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(true);
    expect(payload.result.relativePath).toBe('src/data/authors.json');

    const after = JSON.parse(await readFile(path.join(tempRoot, 'src', 'data', 'authors.json'), 'utf8'));
    expect(after).toEqual([
      {
        name: 'Alice',
        avatar: 'author/alice.webp'
      },
      {
        name: 'WZVico',
        avatar: ''
      }
    ]);
  });

  it('rejects duplicate longform slugs before creating files', async () => {
    const { POST } = await import('../src/pages/api/admin/category/longform');
    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/category/longform', {
        item: {
          title: '重复长文',
          slug: 'existing-longform',
          date: '2026-05-20',
          body: '正文。'
        }
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/category/longform')
    } as never);

    expect(response.status).toBe(409);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(false);
    expect(payload.errors[0]).toContain('已被占用');
  });

  it('rejects stale revisions after the source file changes externally', async () => {
    const { readAdminContentEntryEditorPayload } = await import('../src/lib/admin-console/content-shared');
    const { POST } = await import('../src/pages/api/admin/content/entry');
    const current = await readAdminContentEntryEditorPayload('longform', 'demo');

    await writeFile(
      path.join(tempRoot, 'src', 'content', 'longform', 'demo.md'),
      ['---', 'title: External Change', 'date: 2026-03-18', '---', '', 'changed body', ''].join('\n'),
      'utf8'
    );

    const response = await POST({
      request: createJsonRequest('http://127.0.0.1:4321/api/admin/content/entry', {
        collection: 'longform',
        entryId: 'demo',
        revision: current.revision,
        frontmatter: {
          ...current.values,
          title: 'Local Change'
        }
      }),
      url: new URL('http://127.0.0.1:4321/api/admin/content/entry')
    } as never);

    expect(response.status).toBe(409);
    const payload = JSON.parse(await response.text());
    expect(payload.ok).toBe(false);
    expect(payload.errors[0]).toContain('外部更新');
    expect(payload.payload.values.title).toBe('External Change');
  });
});
