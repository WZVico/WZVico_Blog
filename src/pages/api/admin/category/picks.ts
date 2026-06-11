import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { APIRoute } from 'astro';
import {
  ADMIN_JSON_HEADERS,
  createAdminWriteQueue,
  isAdminDryRunRequest,
  persistAdminFileTransaction,
  readAdminJsonRequestBody,
  validateAdminJsonWriteRequest
} from '../../../../lib/admin-console/admin-api';
import {
  assertNoDuplicatePick,
  buildPickMarkdownFile,
  getAvailablePickPath,
  getPicksIndexPath,
  normalizePickCreateInput,
  normalizePicksIntroInput,
  updatePicksIntroMarkdown
} from '../../../../lib/admin-console/picks';

const JSON_HEADERS = ADMIN_JSON_HEADERS;
const DEV_ONLY_NOT_FOUND_RESPONSE = new Response('Not Found', { status: 404 });
const METHOD_NOT_ALLOWED_RESPONSE = new Response('Method Not Allowed', {
  status: 405,
  headers: {
    allow: 'POST',
    'cache-control': 'no-store'
  }
});

const createJsonErrorResponse = (status: number, errors: readonly string[]): Response =>
  new Response(JSON.stringify({ ok: false, errors }, null, 2), {
    status,
    headers: JSON_HEADERS
  });

const withAdminPicksCreateLock = createAdminWriteQueue();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const GET: APIRoute = async () => {
  if (!import.meta.env.DEV && !process.env.VITEST) {
    return DEV_ONLY_NOT_FOUND_RESPONSE.clone();
  }

  return METHOD_NOT_ALLOWED_RESPONSE.clone();
};

export const POST: APIRoute = async ({ request, url }) => {
  if (!import.meta.env.DEV && !process.env.VITEST) {
    return DEV_ONLY_NOT_FOUND_RESPONSE.clone();
  }

  const requestError = validateAdminJsonWriteRequest(request, url, 'Category Console 拾选创建');
  if (requestError) {
    return createJsonErrorResponse(requestError.status, [requestError.error]);
  }

  const bodyResult = await readAdminJsonRequestBody(request, {
    emptyBodyError: '请求体为空，请确认已发送 JSON 字符串'
  });
  if (!bodyResult.ok) {
    return createJsonErrorResponse(bodyResult.status, [bodyResult.error]);
  }

  return withAdminPicksCreateLock(async () => {
    try {
      const body = bodyResult.body;

      if (isRecord(body) && body.action === 'updateIntro') {
        const { intro, errors } = normalizePicksIntroInput(body);
        if (errors.length > 0 || !intro) {
          return createJsonErrorResponse(400, errors);
        }

        const filePath = getPicksIndexPath();
        const sourceText = await readFile(filePath, 'utf8').catch(() =>
          ['---', 'title: 拾选', 'draft: false', '---', '', ''].join('\n')
        );
        const content = updatePicksIntroMarkdown(sourceText, intro);
        const relativePath = 'src/content/picks/index.md';

        if (isAdminDryRunRequest(url)) {
          return new Response(
            JSON.stringify(
              {
                ok: true,
                result: {
                  dryRun: true,
                  relativePath,
                  intro,
                  markdown: content
                }
              },
              null,
              2
            ),
            { headers: JSON_HEADERS }
          );
        }

        await persistAdminFileTransaction([
          {
            id: 'picks-intro',
            filePath,
            content
          }
        ], {
          beforeWrite: async () => {
            await mkdir(dirname(filePath), { recursive: true });
          },
          commitStrategy: 'overwrite-existing'
        });

        return new Response(
          JSON.stringify(
            {
              ok: true,
              result: {
                relativePath,
                intro
              }
            },
            null,
            2
          ),
          { headers: JSON_HEADERS }
        );
      }

      const { item, errors } = normalizePickCreateInput(body);
      if (errors.length > 0 || !item) {
        return createJsonErrorResponse(400, errors);
      }

      await assertNoDuplicatePick(item);
      const { filePath, relativePath } = await getAvailablePickPath(item);
      const markdown = buildPickMarkdownFile(item);
      const snippet = markdown;

      if (isAdminDryRunRequest(url)) {
        return new Response(
          JSON.stringify(
            {
              ok: true,
              result: {
                dryRun: true,
                relativePath,
                snippet,
                markdown
              }
            },
            null,
            2
          ),
          { headers: JSON_HEADERS }
        );
      }

      await persistAdminFileTransaction([
        {
          id: 'picks',
          filePath,
          content: markdown
        }
      ], {
        beforeWrite: async () => {
          await mkdir(dirname(filePath), { recursive: true });
        }
      });

      return new Response(
        JSON.stringify(
          {
            ok: true,
            result: {
              relativePath,
              snippet
            }
          },
          null,
          2
        ),
        { headers: JSON_HEADERS }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建拾选失败';
      const isDuplicate = message.includes('已存在');
      if (isDuplicate) {
        return createJsonErrorResponse(409, [message]);
      }

      console.error('[astro-whono] Failed to create picks entry:', error);
      return createJsonErrorResponse(500, ['创建拾选失败，请检查本地文件权限或日志']);
    }
  });
};
