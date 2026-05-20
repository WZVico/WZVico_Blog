import { access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { APIRoute } from 'astro';
import {
  ADMIN_JSON_HEADERS,
  createAdminWriteQueue,
  isAdminDryRunRequest,
  persistAdminFileTransaction,
  readAdminJsonRequestBody,
  validateAdminJsonWriteRequest
} from '../../../../lib/admin-console/admin-api';

type MaterialCreateItem = {
  title: string;
  href: string;
  label?: string;
  description?: string;
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

const MATERIALS_CONTENT_DIR = join(process.cwd(), 'src', 'content', 'materials');
const MAX_TEXT_LENGTH = 600;
const MAX_DESCRIPTION_LENGTH = 2000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const normalizeMaterialHref = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  if (/^(?:javascript|data|vbscript):/i.test(trimmed)) return null;
  if (/^https:\/\//i.test(trimmed)) return `https://${trimmed.slice('https://'.length)}`;
  if (/^http:\/\//i.test(trimmed)) return `https://${trimmed.slice('http://'.length)}`;
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  return `https://${trimmed.replace(/^\/+/, '')}`;
};

const pad2 = (value: number): string => String(value).padStart(2, '0');

const createLocalTimestamp = (): { date: string; fileStamp: string } => {
  const now = new Date();
  const tzMinutes = -now.getTimezoneOffset();
  const sign = tzMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(tzMinutes);
  const tzHours = pad2(Math.floor(abs / 60));
  const tzRemainder = pad2(abs % 60);
  const datePart = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const timePart = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  const fileStamp = `${datePart}-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;

  return {
    date: `${datePart}T${timePart}${sign}${tzHours}:${tzRemainder}`,
    fileStamp
  };
};

const normalizeFilenamePart = (value: string): string => {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'material';
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const getAvailableMaterialPath = async (title: string): Promise<{ filePath: string; relativePath: string }> => {
  const { fileStamp } = createLocalTimestamp();
  const filenameBase = `${normalizeFilenamePart(title)}-${fileStamp}`;

  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? '' : `-${index + 1}`;
    const filename = `${filenameBase}${suffix}.md`;
    const relativePath = `src/content/materials/${filename}`;
    const filePath = join(MATERIALS_CONTENT_DIR, filename);
    if (!(await fileExists(filePath))) {
      return { filePath, relativePath };
    }
  }

  throw new Error('Unable to create a unique materials filename');
};

const escapeYamlDoubleQuoted = (value: string): string =>
  value.replace(/[\n\r\t"\\]/g, (char) => {
    switch (char) {
      case '\\':
        return '\\\\';
      case '"':
        return '\\"';
      case '\n':
        return '\\n';
      case '\r':
        return '\\r';
      case '\t':
        return '\\t';
      default:
        return char;
    }
  });

const quoteYaml = (value: string): string =>
  /[:#\n\r\t\\]|^\s|\s$|^-/.test(value) ? `"${escapeYamlDoubleQuoted(value)}"` : value;

const buildMaterialMarkdown = (item: MaterialCreateItem): string => {
  const { date } = createLocalTimestamp();
  const lines = [
    '---',
    `title: ${quoteYaml(item.title)}`,
    `href: ${quoteYaml(item.href)}`,
    `date: ${date}`
  ];

  if (item.label) lines.push(`label: ${quoteYaml(item.label)}`);
  if (item.description) lines.push(`description: ${quoteYaml(item.description)}`);
  lines.push('---', '');

  return `${lines.join('\n')}\n`;
};

const createJsonErrorResponse = (status: number, errors: readonly string[]): Response =>
  new Response(JSON.stringify({ ok: false, errors }, null, 2), {
    status,
    headers: JSON_HEADERS
  });

const normalizeCreateInput = (body: unknown): { item?: MaterialCreateItem; errors: string[] } => {
  if (!isRecord(body)) {
    return {
      errors: ['请求体必须是 JSON 对象']
    };
  }

  const rawItem = isRecord(body.item) ? body.item : body;
  const title = asTrimmedString(rawItem.title);
  const rawHref = asTrimmedString(rawItem.href);
  const normalizedHref = rawHref ? normalizeMaterialHref(rawHref) : null;
  const href = normalizedHref ?? '';
  const label = asTrimmedString(rawItem.label);
  const description = asTrimmedString(rawItem.description);
  const errors: string[] = [];

  if (!title) errors.push('请填写资料标题');
  if (!rawHref) errors.push('请填写资料链接');
  if (rawHref && !normalizedHref) errors.push('资料链接不安全');

  for (const [field, value, limit] of [
    ['标题', title, MAX_TEXT_LENGTH],
    ['链接', href, MAX_TEXT_LENGTH],
    ['类型', label, MAX_TEXT_LENGTH],
    ['描述', description, MAX_DESCRIPTION_LENGTH]
  ] as const) {
    if (value.length > limit) errors.push(`${field}过长`);
  }

  if (errors.length > 0) return { errors };

  return {
    item: {
      title,
      href,
      ...(label ? { label } : {}),
      ...(description ? { description } : {})
    },
    errors
  };
};

const withAdminMaterialsCreateLock = createAdminWriteQueue();

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

  const requestError = validateAdminJsonWriteRequest(request, url, 'Category Console 资料创建');
  if (requestError) {
    return createJsonErrorResponse(requestError.status, [requestError.error]);
  }

  const bodyResult = await readAdminJsonRequestBody(request, {
    emptyBodyError: '请求体为空，请确认已发送 JSON 字符串'
  });
  if (!bodyResult.ok) {
    return createJsonErrorResponse(bodyResult.status, [bodyResult.error]);
  }

  const { item, errors } = normalizeCreateInput(bodyResult.body);
  if (errors.length > 0 || !item) {
    return createJsonErrorResponse(400, errors);
  }

  return withAdminMaterialsCreateLock(async () => {
    try {
      const { filePath, relativePath } = await getAvailableMaterialPath(item.title);
      const markdown = buildMaterialMarkdown(item);

      if (isAdminDryRunRequest(url)) {
        return new Response(
          JSON.stringify(
            {
              ok: true,
              result: {
                dryRun: true,
                relativePath,
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
          id: 'materials',
          filePath,
          content: markdown
        }
      ], {
        beforeWrite: async () => {
          await mkdir(MATERIALS_CONTENT_DIR, { recursive: true });
        }
      });

      return new Response(
        JSON.stringify(
          {
            ok: true,
            result: {
              relativePath
            }
          },
          null,
          2
        ),
        { headers: JSON_HEADERS }
      );
    } catch (error) {
      console.error('[astro-whono] Failed to create materials:', error);
      return createJsonErrorResponse(500, ['创建资料失败，请检查本地文件权限或日志']);
    }
  });
};
