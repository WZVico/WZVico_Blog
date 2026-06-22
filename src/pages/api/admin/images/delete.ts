import type { APIRoute } from 'astro';
import {
  ADMIN_JSON_HEADERS,
  createAdminWriteQueue,
  readAdminJsonRequestBody,
  validateAdminJsonWriteRequest
} from '../../../../lib/admin-console/admin-api';
import { deleteAdminImageItems } from '../../../../lib/admin-console/image-shared';

type DeleteInput = {
  paths: string[];
  errors: string[];
};

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

const createJsonResponse = (status: number, payload: unknown): Response =>
  new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: JSON_HEADERS
  });

const extractDeleteInput = (body: unknown): DeleteInput => {
  if (!isRecord(body)) {
    return {
      paths: [],
      errors: ['请求体必须是 JSON 对象']
    };
  }

  const rawPaths = Array.isArray(body.paths)
    ? body.paths
    : typeof body.path === 'string'
      ? [body.path]
      : [];

  if (rawPaths.length === 0) {
    return {
      paths: [],
      errors: ['请求体缺少 paths']
    };
  }

  const paths: string[] = [];
  const errors: string[] = [];
  rawPaths.forEach((item, index) => {
    if (typeof item !== 'string') {
      errors.push(`paths[${index}] 必须是字符串`);
      return;
    }

    const normalized = item.trim();
    if (!normalized) {
      errors.push(`paths[${index}] 不能为空`);
      return;
    }

    paths.push(normalized);
  });

  return {
    paths,
    errors
  };
};

const withAdminImageDeleteLock = createAdminWriteQueue();

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

  const requestError = validateAdminJsonWriteRequest(request, url, 'Images Console 图片', '删除');
  if (requestError) {
    return createJsonResponse(requestError.status, {
      ok: false,
      errors: [requestError.error]
    });
  }

  const bodyResult = await readAdminJsonRequestBody(request, {
    emptyBodyError: '请求体为空，请确认已发送 JSON 字符串'
  });
  if (!bodyResult.ok) {
    return createJsonResponse(bodyResult.status, {
      ok: false,
      errors: [bodyResult.error]
    });
  }

  const { paths, errors } = extractDeleteInput(bodyResult.body);
  if (errors.length > 0 || paths.length === 0) {
    return createJsonResponse(400, {
      ok: false,
      errors
    });
  }

  return withAdminImageDeleteLock(async () => {
    try {
      const result = await deleteAdminImageItems(paths);
      return createJsonResponse(200, {
        ok: true,
        result
      });
    } catch (error) {
      console.error('[astro-whono] Failed to delete admin images:', error);
      return createJsonResponse(500, {
        ok: false,
        errors: ['图片删除失败，请检查本地文件权限或日志']
      });
    }
  });
};