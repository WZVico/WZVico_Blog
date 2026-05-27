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
  AdminCategoryEntryError,
  buildAdminCategoryEntryContent,
  isAdminCategoryEntryCollection,
  readAdminCategoryEntryPayload,
  type AdminCategoryEntryCollection
} from '../../../../lib/admin-console/category-entry';

const JSON_HEADERS = ADMIN_JSON_HEADERS;
const DEV_ONLY_NOT_FOUND_RESPONSE = new Response('Not Found', { status: 404 });
const METHOD_NOT_ALLOWED_RESPONSE = new Response('Method Not Allowed', {
  status: 405,
  headers: {
    allow: 'GET, POST',
    'cache-control': 'no-store'
  }
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const createJsonErrorResponse = (
  status: number,
  errors: readonly string[],
  issues: readonly { path: string; message: string }[] = []
): Response =>
  new Response(
    JSON.stringify(
      {
        ok: false,
        errors,
        ...(issues.length > 0 ? { issues } : {})
      },
      null,
      2
    ),
    {
      status,
      headers: JSON_HEADERS
    }
  );

const resolveCollection = (value: unknown): AdminCategoryEntryCollection | null => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return isAdminCategoryEntryCollection(normalized) ? normalized : null;
};

const createEntryErrorResponse = (error: unknown): Response | null => {
  if (!(error instanceof AdminCategoryEntryError)) return null;
  return createJsonErrorResponse(error.status, [error.message], [{ path: error.path, message: error.message }]);
};

const withAdminCategoryEntryWriteLock = createAdminWriteQueue();

export const GET: APIRoute = async ({ url }) => {
  if (!import.meta.env.DEV && !process.env.VITEST) {
    return DEV_ONLY_NOT_FOUND_RESPONSE.clone();
  }

  const collection = resolveCollection(url.searchParams.get('collection'));
  const entryId = url.searchParams.get('entryId')?.trim() ?? '';

  if (!collection) {
    return createJsonErrorResponse(400, ['不支持或缺少 collection'], [
      { path: 'collection', message: '不支持或缺少 collection' }
    ]);
  }
  if (!entryId) {
    return createJsonErrorResponse(400, ['缺少 entryId'], [
      { path: 'entryId', message: '缺少 entryId' }
    ]);
  }

  try {
    const payload = await readAdminCategoryEntryPayload(collection, entryId);
    return new Response(JSON.stringify({ ok: true, payload }, null, 2), {
      headers: JSON_HEADERS
    });
  } catch (error) {
    const errorResponse = createEntryErrorResponse(error);
    if (errorResponse) return errorResponse;
    throw error;
  }
};

export const POST: APIRoute = async ({ request, url }) => {
  if (!import.meta.env.DEV && !process.env.VITEST) {
    return DEV_ONLY_NOT_FOUND_RESPONSE.clone();
  }

  const requestError = validateAdminJsonWriteRequest(request, url, 'Category Console 内容编辑');
  if (requestError) {
    return createJsonErrorResponse(requestError.status, [requestError.error]);
  }

  const bodyResult = await readAdminJsonRequestBody(request, {
    emptyBodyError: '请求体为空，请确认已发送 JSON 字符串'
  });
  if (!bodyResult.ok) {
    return createJsonErrorResponse(bodyResult.status, [bodyResult.error]);
  }

  if (!isRecord(bodyResult.body)) {
    return createJsonErrorResponse(400, ['请求体必须是 JSON 对象'], [
      { path: 'body', message: '请求体必须是 JSON 对象' }
    ]);
  }

  const collection = resolveCollection(bodyResult.body.collection);
  const entryId = typeof bodyResult.body.entryId === 'string' ? bodyResult.body.entryId.trim() : '';
  const revision = typeof bodyResult.body.revision === 'string' ? bodyResult.body.revision.trim() : '';
  const fields = isRecord(bodyResult.body.fields) ? bodyResult.body.fields : null;

  const issues: { path: string; message: string }[] = [];
  if (!collection) issues.push({ path: 'collection', message: '不支持或缺少 collection' });
  if (!entryId) issues.push({ path: 'entryId', message: '缺少 entryId' });
  if (!revision) issues.push({ path: 'revision', message: '缺少 revision' });
  if (!fields) issues.push({ path: 'fields', message: 'fields 必须是对象' });
  if (issues.length > 0 || !collection || !entryId || !revision || !fields) {
    return createJsonErrorResponse(400, issues.map((issue) => issue.message), issues);
  }

  const isDryRun = isAdminDryRunRequest(url);

  return withAdminCategoryEntryWriteLock(async () => {
    let currentPayload: Awaited<ReturnType<typeof readAdminCategoryEntryPayload>>;
    try {
      currentPayload = await readAdminCategoryEntryPayload(collection, entryId);
    } catch (error) {
      const errorResponse = createEntryErrorResponse(error);
      if (errorResponse) return errorResponse;
      throw error;
    }

    if (currentPayload.revision !== revision) {
      return new Response(
        JSON.stringify(
          {
            ok: false,
            errors: ['检测到内容文件已在外部更新，已拒绝覆盖，请刷新当前条目后再保存'],
            payload: currentPayload
          },
          null,
          2
        ),
        { status: 409, headers: JSON_HEADERS }
      );
    }

    let plan: Awaited<ReturnType<typeof buildAdminCategoryEntryContent>>;
    try {
      plan = await buildAdminCategoryEntryContent(collection, entryId, fields);
    } catch (error) {
      const errorResponse = createEntryErrorResponse(error);
      if (errorResponse) return errorResponse;
      throw error;
    }

    if (plan.issues.length > 0 || !plan.content) {
      return createJsonErrorResponse(
        400,
        Array.from(new Set(plan.issues.map((issue) => issue.message))),
        plan.issues
      );
    }

    const result = {
      relativePath: plan.state.relativePath,
      dryRun: isDryRun,
      written: false
    };

    if (isDryRun) {
      return new Response(JSON.stringify({ ok: true, result }, null, 2), {
        headers: JSON_HEADERS
      });
    }

    try {
      await persistAdminFileTransaction([
        {
          id: 'category-entry',
          filePath: plan.state.sourcePath,
          content: plan.content
        }
      ]);
      const latestPayload = await readAdminCategoryEntryPayload(collection, entryId);

      return new Response(
        JSON.stringify(
          {
            ok: true,
            result: {
              ...result,
              written: true
            },
            payload: latestPayload
          },
          null,
          2
        ),
        { headers: JSON_HEADERS }
      );
    } catch (error) {
      console.error('[astro-whono] Failed to persist category entry:', error);
      return createJsonErrorResponse(500, ['写入内容文件失败，请检查本地文件权限或日志']);
    }
  });
};

export const ALL: APIRoute = async () => METHOD_NOT_ALLOWED_RESPONSE.clone();
