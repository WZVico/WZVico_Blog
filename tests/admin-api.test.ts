import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { persistAdminFileTransaction } from '../src/lib/admin-console/admin-api';

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describe('admin-api file persistence', () => {
  let tempRoot = '';

  afterEach(async () => {
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
      tempRoot = '';
    }
  });

  it('can overwrite existing files without leaving transient artifacts', async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), 'astro-whono-admin-api-'));
    const filePath = path.join(tempRoot, 'entry.md');
    await writeFile(filePath, 'before\n', 'utf8');

    await persistAdminFileTransaction([
      {
        id: 'entry',
        filePath,
        content: 'after\n'
      }
    ], {
      commitStrategy: 'overwrite-existing'
    });

    expect(await readFile(filePath, 'utf8')).toBe('after\n');
    expect(await readdir(tempRoot)).toEqual(['entry.md']);
  });

  it('skips no-op overwrites so unchanged content does not trigger file watchers', async () => {
    tempRoot = await mkdtemp(path.join(tmpdir(), 'astro-whono-admin-api-'));
    const filePath = path.join(tempRoot, 'entry.md');
    await writeFile(filePath, 'same\n', 'utf8');
    const before = await stat(filePath);

    await wait(20);
    await persistAdminFileTransaction([
      {
        id: 'entry',
        filePath,
        content: 'same\n'
      }
    ], {
      commitStrategy: 'overwrite-existing'
    });

    const after = await stat(filePath);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });
});
