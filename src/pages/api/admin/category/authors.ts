import { mkdir } from 'node:fs/promises';
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
  ADMIN_AUTHOR_LIBRARY_RELATIVE_PATH,
  getAdminAuthorLibraryFilePath,
  normalizeAdminAuthorProfiles,
  serializeAdminAuthorProfiles
} from '../../../../lib/admin-console/authors';

const JSON_HEADERS = ADMIN_JSON_HEADERS;
const DEV_ONLY_NOT_FOUND_RESPONSE = new Response('Not Found', { status: 404 });
const METHOD_NOT_ALLOWED_RESPONSE = new Response('Method Not Allowed', {
  status: 405,
  headers: {
    allow: 'POST',
    'cache-control': 'no-store'
  }
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const createJsonErrorResponse = (status: number, errors: readonly string[]): Response =>
  new Response(JSON.stringify({ ok: false, errors }, null, 2), {
    status,
    headers: JSON_HEADERS
  });

const normalizeRequestInput = (body: unknown) => {
  const rawAuthors = isRecord(body) && 'authors' in body ? body.authors : body;
  return normalizeAdminAuthorProfiles(rawAuthors);
};

const withAdminAuthorLibraryWriteLock = createAdminWriteQueue();

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

  const requestError = validateAdminJsonWriteRequest(request, url, 'Category Console 作者库');
  if (requestError) {
    return createJsonErrorResponse(requestError.status, [requestError.error]);
  }

  const bodyResult = await readAdminJsonRequestBody(request, {
    emptyBodyError: '请求体为空，请确认已发送 JSON 字符串'
  });
  if (!bodyResult.ok) {
    return createJsonErrorResponse(bodyResult.status, [bodyResult.error]);
  }

  const { authors, errors } = normalizeRequestInput(bodyResult.body);
  if (errors.length > 0) {
    return createJsonErrorResponse(400, errors);
  }

  return withAdminAuthorLibraryWriteLock(async () => {
    try {
      const content = serializeAdminAuthorProfiles(authors);
      const filePath = getAdminAuthorLibraryFilePath();

      if (isAdminDryRunRequest(url)) {
        return new Response(
          JSON.stringify(
            {
              ok: true,
              result: {
                dryRun: true,
                relativePath: ADMIN_AUTHOR_LIBRARY_RELATIVE_PATH,
                authors,
                content
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
          id: 'authors',
          filePath,
          content
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
              relativePath: ADMIN_AUTHOR_LIBRARY_RELATIVE_PATH,
              authors
            }
          },
          null,
          2
        ),
        { headers: JSON_HEADERS }
      );
    } catch (error) {
      return createJsonErrorResponse(500, [
        `作者库写入失败：${error instanceof Error ? error.message : 'unknown error'}`
      ]);
    }
  });
};
