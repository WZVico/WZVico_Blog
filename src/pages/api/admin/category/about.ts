import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { APIRoute } from 'astro';
import {
  ADMIN_JSON_HEADERS,
  createAdminWriteQueue,
  persistAdminFileTransaction,
  readAdminJsonRequestBody,
  validateAdminJsonWriteRequest
} from '../../../../lib/admin-console/admin-api';
import {
  ABOUT_CONTENT_RELATIVE_PATH,
  getAboutContent,
  normalizeAboutContent
} from '../../../../lib/about-content';

const DEV_ONLY_NOT_FOUND_RESPONSE = new Response('Not Found', { status: 404 });
const ABOUT_CONTENT_PATH = join(process.cwd(), ABOUT_CONTENT_RELATIVE_PATH);
const JSON_HEADERS = ADMIN_JSON_HEADERS;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const createJsonBody = (data: unknown): string => `${JSON.stringify(data, null, 2)}\n`;

const withAboutContentWriteLock = createAdminWriteQueue();

export const GET: APIRoute = async () => {
  if (!import.meta.env.DEV) {
    return DEV_ONLY_NOT_FOUND_RESPONSE.clone();
  }

  return new Response(
    JSON.stringify(
      {
        ok: true,
        content: getAboutContent(),
        relativePath: ABOUT_CONTENT_RELATIVE_PATH
      },
      null,
      2
    ),
    { headers: JSON_HEADERS }
  );
};

export const POST: APIRoute = async ({ request, url }) => {
  if (!import.meta.env.DEV) {
    return DEV_ONLY_NOT_FOUND_RESPONSE.clone();
  }

  const requestError = validateAdminJsonWriteRequest(request, url, 'About 页面文案');
  if (requestError) {
    return new Response(
      JSON.stringify(
        {
          ok: false,
          errors: [requestError.error]
        },
        null,
        2
      ),
      { status: requestError.status, headers: JSON_HEADERS }
    );
  }

  const bodyResult = await readAdminJsonRequestBody(request, {
    emptyBodyError: '请求体为空，请确认已发送 About 页面文案 JSON',
    parseTrimmedBody: true
  });
  if (!bodyResult.ok) {
    return new Response(
      JSON.stringify(
        {
          ok: false,
          errors: [bodyResult.error]
        },
        null,
        2
      ),
      { status: bodyResult.status, headers: JSON_HEADERS }
    );
  }

  if (!isRecord(bodyResult.body) || !Object.prototype.hasOwnProperty.call(bodyResult.body, 'content')) {
    return new Response(
      JSON.stringify(
        {
          ok: false,
          errors: ['请求体缺少 content 字段']
        },
        null,
        2
      ),
      { status: 400, headers: JSON_HEADERS }
    );
  }

  const content = normalizeAboutContent(bodyResult.body.content);

  return withAboutContentWriteLock(async () => {
    try {
      await persistAdminFileTransaction(
        [
          {
            id: 'about',
            filePath: ABOUT_CONTENT_PATH,
            content: createJsonBody(content)
          }
        ],
        {
          beforeWrite: async () => {
            await mkdir(dirname(ABOUT_CONTENT_PATH), { recursive: true });
          }
        }
      );

      return new Response(
        JSON.stringify(
          {
            ok: true,
            content,
            relativePath: ABOUT_CONTENT_RELATIVE_PATH
          },
          null,
          2
        ),
        { headers: JSON_HEADERS }
      );
    } catch (error) {
      console.error('[astro-whono] Failed to persist about content:', error);
      return new Response(
        JSON.stringify(
          {
            ok: false,
            errors: ['写入 About 页面文案失败，请检查本地文件权限或日志']
          },
          null,
          2
        ),
        { status: 500, headers: JSON_HEADERS }
      );
    }
  });
};

