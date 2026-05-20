import { access, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { APIRoute } from 'astro';
import {
  ADMIN_JSON_HEADERS,
  createAdminWriteQueue,
  persistAdminFileTransaction,
  readAdminJsonRequestBody,
  validateAdminJsonWriteRequest
} from '../../../../lib/admin-console/admin-api';

type BitsDraftCreateInput = {
  markdown?: string;
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

const MAX_MARKDOWN_LENGTH = 200_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getProjectRoot = (): string =>
  process.env.ASTRO_WHONO_INTERNAL_TEST_PROJECT_ROOT?.trim() || process.cwd();

const getBitsContentDir = (): string =>
  join(getProjectRoot(), 'src', 'content', 'bits');

const pad2 = (value: number): string => String(value).padStart(2, '0');

const createFileStamp = (): { stamp: string; year: number } => {
  const now = new Date();
  const year = now.getFullYear();
  const stamp = [
    now.getFullYear(),
    pad2(now.getMonth() + 1),
    pad2(now.getDate())
  ].join('-')
    + `-${pad2(now.getHours())}${pad2(now.getMinutes())}`;

  return { stamp, year };
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const normalizeMarkdown = (value: string): string => {
  const normalized = value.replace(/\r\n?/g, '\n').trimEnd();
  return `${normalized}\n`;
};

const extractCreateInput = (body: unknown): BitsDraftCreateInput => {
  if (!isRecord(body)) {
    return {
      errors: ['请求体必须是 JSON 对象']
    };
  }

  const errors: string[] = [];
  const markdown = typeof body.markdown === 'string' ? normalizeMarkdown(body.markdown) : '';

  if (!markdown.trim()) {
    errors.push('请先填写絮语内容');
  }

  if (markdown.length > MAX_MARKDOWN_LENGTH) {
    errors.push(`絮语草稿过长，当前限制为 ${MAX_MARKDOWN_LENGTH} 字符`);
  }

  if (markdown && !markdown.startsWith('---\n')) {
    errors.push('草稿必须包含 frontmatter');
  }

  return {
    ...(markdown ? { markdown } : {}),
    errors
  };
};

const createJsonErrorResponse = (status: number, errors: readonly string[]): Response =>
  new Response(JSON.stringify({ ok: false, errors }, null, 2), {
    status,
    headers: JSON_HEADERS
  });

const getAvailableBitsDraftPath = async (): Promise<{ filePath: string; relativePath: string }> => {
  const { stamp, year } = createFileStamp();

  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? '' : `-${index + 1}`;
    const filename = `bits-${stamp}${suffix}.md`;
    const relativePath = `src/content/bits/${year}/${filename}`;
    const filePath = join(getBitsContentDir(), String(year), filename);
    if (!(await fileExists(filePath))) {
      return { filePath, relativePath };
    }
  }

  throw new Error('Unable to create a unique bits draft filename');
};

const withAdminBitsCreateLock = createAdminWriteQueue();

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

  const requestError = validateAdminJsonWriteRequest(request, url, 'Category Console 絮语创建');
  if (requestError) {
    return createJsonErrorResponse(requestError.status, [requestError.error]);
  }

  const bodyResult = await readAdminJsonRequestBody(request, {
    emptyBodyError: '请求体为空，请确认已发送 JSON 字符串'
  });
  if (!bodyResult.ok) {
    return createJsonErrorResponse(bodyResult.status, [bodyResult.error]);
  }

  const { markdown, errors } = extractCreateInput(bodyResult.body);
  if (errors.length > 0 || !markdown) {
    return createJsonErrorResponse(400, errors);
  }

  return withAdminBitsCreateLock(async () => {
    try {
      const { filePath, relativePath } = await getAvailableBitsDraftPath();
      await persistAdminFileTransaction([
        {
          id: 'bits-draft',
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
              written: true,
              relativePath
            }
          },
          null,
          2
        ),
        { headers: JSON_HEADERS }
      );
    } catch (error) {
      console.error('[astro-whono] Failed to create bits draft:', error);
      return createJsonErrorResponse(500, ['创建絮语文件失败，请检查本地文件权限或日志']);
    }
  });
};
