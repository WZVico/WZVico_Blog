import { access, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
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
  listAdminCollectionSourceFiles,
  readAdminSourceFrontmatterRecord,
  resolveAdminContentEntryIdFromSourcePath
} from '../../../../lib/admin-console/content-shared';
import {
  LONGFORM_PUBLIC_SLUG_RE,
  RESERVED_LONGFORM_SLUGS,
  flattenEntryIdToSlug
} from '../../../../utils/slug-rules';
import { parseLongformDateInput } from '../../../../utils/date-only';
import { normalizeBitsAvatarPath, toSafeHttpUrl } from '../../../../utils/format';
import { splitTagInput } from '../../../../utils/tag-input';

type LongformCreatePerson = {
  name: string;
  avatar?: string;
  showAvatar: boolean;
};

type LongformCreateItem = {
  title: string;
  slug: string;
  description?: string;
  date: string;
  tags: string[];
  draft: boolean;
  archive: boolean;
  badge?: string;
  authors: LongformCreatePerson[];
  translator?: LongformCreatePerson;
  translationSource?: string;
  translationSourceUrl?: string;
  body: string;
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

const MAX_TEXT_LENGTH = 2000;
const MAX_BODY_LENGTH = 1_000_000;
const MAX_TAG_COUNT = 40;
const MAX_TAG_LENGTH = 80;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const getProjectRoot = (): string =>
  process.env.ASTRO_WHONO_INTERNAL_TEST_PROJECT_ROOT?.trim() || process.cwd();

const getLongformContentDir = (): string =>
  join(getProjectRoot(), 'src', 'content', 'longform');

const pad2 = (value: number): string => String(value).padStart(2, '0');

const createLocalTimestamp = (): { date: string; fileStamp: string } => {
  const now = new Date();
  const date = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const fileStamp = `${date}-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  return { date, fileStamp };
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const slugifyAscii = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normalizeSlug = (
  rawSlug: string,
  title: string,
  fallbackStamp: string
): string => {
  const fromSlug = slugifyAscii(rawSlug);
  if (fromSlug) return fromSlug;

  const fromTitle = slugifyAscii(title);
  if (fromTitle) return fromTitle;

  return `post-${fallbackStamp.replace(/[^0-9]/g, '')}`;
};

const splitAuthorNames = (value: string): string[] =>
  Array.from(
    new Set(
      value
        .split(/[,\n，、；;]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );

const normalizeMarkdownBody = (value: string): string =>
  `${value.replace(/\r\n?/g, '\n').trimEnd()}\n`;

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
  /[:#\n\r\t\\[\]{}]|^\s|\s$|^-|^(?:true|false|null)$/i.test(value)
    ? `"${escapeYamlDoubleQuoted(value)}"`
    : value;

const getDateMonthDir = (dateText: string): string =>
  `${dateText.slice(0, 4)}${dateText.slice(5, 7)}`;

const normalizeOptionalAvatar = (
  value: string,
  errors: string[],
  label: string
): string => {
  if (!value) return '';

  const normalized = normalizeBitsAvatarPath(value);
  if (normalized === undefined) {
    errors.push(`${label}只允许相对图片路径，例如 author/avatar.webp`);
    return '';
  }

  return normalized;
};

const normalizeOptionalHttpUrl = (
  value: string,
  errors: string[],
  label: string
): string => {
  if (!value) return '';

  const normalized = toSafeHttpUrl(value);
  if (!normalized) {
    errors.push(`${label}必须是合法的 http(s) URL`);
    return '';
  }

  return normalized;
};

const normalizePersonList = (
  value: unknown,
  errors: string[],
  label: string
): LongformCreatePerson[] => {
  if (!Array.isArray(value)) return [];

  const people = new Map<string, LongformCreatePerson>();
  value.forEach((rawPerson, index) => {
    if (!isRecord(rawPerson)) {
      errors.push(`${label}${index + 1} 必须是对象`);
      return;
    }

    const name = asTrimmedString(rawPerson.name);
    const rawAvatar = asTrimmedString(rawPerson.avatar);
    const showAvatar = typeof rawPerson.showAvatar === 'boolean' ? rawPerson.showAvatar : true;
    if (!name) {
      if (rawAvatar) errors.push(`${label}${index + 1} 请填写姓名`);
      return;
    }

    const avatar = normalizeOptionalAvatar(rawAvatar, errors, `${label}${name} 头像`);
    const key = name.toLocaleLowerCase();
    const existing = people.get(key);
    if (existing) {
      if (!existing.avatar && avatar) existing.avatar = avatar;
      if (existing.showAvatar && showAvatar === false) existing.showAvatar = false;
      return;
    }

    people.set(key, {
      name,
      ...(avatar ? { avatar } : {}),
      showAvatar
    });
  });

  return Array.from(people.values());
};

const normalizeLegacyAuthorList = (
  names: readonly string[],
  avatar: string,
  showAvatar: boolean
): LongformCreatePerson[] =>
  names.map((name, index) => ({
    name,
    ...(index === 0 && avatar ? { avatar } : {}),
    showAvatar: index === 0 ? showAvatar : true
  }));

const normalizeOptionalPerson = (
  value: unknown,
  fallback: {
    name: string;
    avatar: string;
    showAvatar: boolean;
  },
  errors: string[],
  label: string
): LongformCreatePerson | undefined => {
  const rawPerson = isRecord(value) ? value : null;
  const name = rawPerson ? asTrimmedString(rawPerson.name) : fallback.name;
  const rawAvatar = rawPerson ? asTrimmedString(rawPerson.avatar) : fallback.avatar;
  const showAvatar = rawPerson
    ? (typeof rawPerson.showAvatar === 'boolean' ? rawPerson.showAvatar : true)
    : fallback.showAvatar;

  if (!name) {
    if (rawAvatar) errors.push(`${label}请填写姓名`);
    return undefined;
  }

  const avatar = normalizeOptionalAvatar(rawAvatar, errors, `${label}头像`);
  return {
    name,
    ...(avatar ? { avatar } : {}),
    showAvatar
  };
};

const normalizeCreateInput = (
  body: unknown
): { item?: LongformCreateItem; errors: string[] } => {
  if (!isRecord(body)) {
    return {
      errors: ['请求体必须是 JSON 对象']
    };
  }

  const rawItem = isRecord(body.item) ? body.item : body;
  const timestamp = createLocalTimestamp();
  const title = asTrimmedString(rawItem.title);
  const rawSlug = asTrimmedString(rawItem.slug);
  const slug = normalizeSlug(rawSlug, title, timestamp.fileStamp);
  const description = asTrimmedString(rawItem.description);
  const rawDate = timestamp.date;
  const tags = splitTagInput(asTrimmedString(rawItem.tags));
  const draft = typeof rawItem.draft === 'boolean' ? rawItem.draft : false;
  const archive = typeof rawItem.archive === 'boolean' ? rawItem.archive : true;
  const badge = asTrimmedString(rawItem.badge);
  const legacyAuthorNames = splitAuthorNames(asTrimmedString(rawItem.authorNames ?? rawItem.authorName));
  const rawLegacyAuthorAvatar = asTrimmedString(rawItem.authorAvatar);
  const legacyAuthorShowAvatar = typeof rawItem.authorShowAvatar === 'boolean' ? rawItem.authorShowAvatar : true;
  const legacyTranslationTranslator = asTrimmedString(rawItem.translationTranslator);
  const rawLegacyTranslationAvatar = asTrimmedString(rawItem.translationAvatar);
  const legacyTranslationShowAvatar =
    typeof rawItem.translationShowAvatar === 'boolean' ? rawItem.translationShowAvatar : true;
  const translationSource = asTrimmedString(rawItem.translationSource);
  const rawTranslationSourceUrl = asTrimmedString(rawItem.translationSourceUrl);
  const rawBody = typeof rawItem.body === 'string' ? rawItem.body : '';
  const normalizedBody = normalizeMarkdownBody(rawBody);
  const errors: string[] = [];

  if (!title) errors.push('请填写长文标题');
  if (!LONGFORM_PUBLIC_SLUG_RE.test(slug)) errors.push('slug 必须是小写 kebab-case');
  if (RESERVED_LONGFORM_SLUGS.has(slug)) errors.push(`slug "${slug}" 是保留路由，请换一个`);

  const dateResult = parseLongformDateInput(rawDate);
  if (!dateResult) errors.push('date 必须是 YYYY-MM-DD 或带时区的 ISO 8601 日期时间');

  if (!normalizedBody.trim()) errors.push('请填写正文内容');

  for (const [label, value, limit] of [
    ['标题', title, MAX_TEXT_LENGTH],
    ['描述', description, MAX_TEXT_LENGTH],
    ['徽标', badge, MAX_TEXT_LENGTH],
    ['文章来源', translationSource, MAX_TEXT_LENGTH],
    ['文章来源链接', rawTranslationSourceUrl, MAX_TEXT_LENGTH]
  ] as const) {
    if (value.length > limit) errors.push(`${label}过长`);
  }

  if (normalizedBody.length > MAX_BODY_LENGTH) {
    errors.push(`正文过长，当前限制为 ${MAX_BODY_LENGTH} 字符`);
  }

  if (tags.length > MAX_TAG_COUNT) {
    errors.push(`标签最多 ${MAX_TAG_COUNT} 个`);
  }

  tags.forEach((tag) => {
    if (tag.length > MAX_TAG_LENGTH) errors.push(`标签过长：${tag}`);
  });

  const legacyAuthorAvatar = Array.isArray(rawItem.authors)
    ? ''
    : normalizeOptionalAvatar(rawLegacyAuthorAvatar, errors, '作者头像');
  const authors = Array.isArray(rawItem.authors)
    ? normalizePersonList(rawItem.authors, errors, '作者')
    : normalizeLegacyAuthorList(legacyAuthorNames, legacyAuthorAvatar, legacyAuthorShowAvatar);
  const translator = normalizeOptionalPerson(
    rawItem.translationPerson ?? rawItem.translator,
    {
      name: legacyTranslationTranslator,
      avatar: rawLegacyTranslationAvatar,
      showAvatar: legacyTranslationShowAvatar
    },
    errors,
    '译者'
  );
  const translationSourceUrl = normalizeOptionalHttpUrl(
    rawTranslationSourceUrl,
    errors,
    '文章来源链接'
  );

  authors.forEach((author) => {
    if (author.name.length > MAX_TEXT_LENGTH) errors.push(`作者名过长：${author.name}`);
    if ((author.avatar ?? '').length > MAX_TEXT_LENGTH) errors.push(`作者头像过长：${author.name}`);
  });
  if (translator) {
    if (translator.name.length > MAX_TEXT_LENGTH) errors.push(`译者名过长：${translator.name}`);
    if ((translator.avatar ?? '').length > MAX_TEXT_LENGTH) errors.push(`译者头像过长：${translator.name}`);
  }

  if (errors.length > 0 || !dateResult) {
    return { errors };
  }

  return {
    item: {
      title,
      slug,
      ...(description ? { description } : {}),
      date: dateResult.dateText,
      tags,
      draft,
      archive,
      ...(badge ? { badge } : {}),
      authors,
      ...(translator ? { translator } : {}),
      ...(translationSource ? { translationSource } : {}),
      ...(translationSourceUrl ? { translationSourceUrl } : {}),
      body: normalizedBody
    },
    errors
  };
};

const buildFrontmatterLines = (item: LongformCreateItem): string[] => {
  const lines = [
    '---',
    `title: ${quoteYaml(item.title)}`
  ];

  if (item.description) lines.push(`description: ${quoteYaml(item.description)}`);
  lines.push(`date: ${item.date}`);
  lines.push(`slug: ${item.slug}`);
  if (item.badge) lines.push(`badge: ${quoteYaml(item.badge)}`);
  if (item.tags.length > 0) {
    lines.push('tags:');
    item.tags.forEach((tag) => {
      lines.push(`  - ${quoteYaml(tag)}`);
    });
  }
  lines.push(`draft: ${item.draft ? 'true' : 'false'}`);
  lines.push(`archive: ${item.archive ? 'true' : 'false'}`);

  if (item.authors.length > 1) {
    lines.push('authors:');
    item.authors.forEach((author) => {
      lines.push(`  - name: ${quoteYaml(author.name)}`);
      if (author.avatar) lines.push(`    avatar: ${quoteYaml(author.avatar)}`);
      if (author.showAvatar === false) lines.push('    showAvatar: false');
    });
  } else if (item.authors.length === 1) {
    const author = item.authors[0];
    if (author) {
      lines.push('author:');
      lines.push(`  name: ${quoteYaml(author.name)}`);
      if (author.avatar) lines.push(`  avatar: ${quoteYaml(author.avatar)}`);
      if (author.showAvatar === false) lines.push('  showAvatar: false');
    }
  }

  if (
    item.translator
    || item.translationSource
    || item.translationSourceUrl
  ) {
    lines.push('translation:');
    if (item.translator) {
      lines.push(`  translator: ${quoteYaml(item.translator.name)}`);
      if (item.translator.avatar) lines.push(`  avatar: ${quoteYaml(item.translator.avatar)}`);
      if (item.translator.showAvatar === false) lines.push('  showAvatar: false');
    }
    if (item.translationSource) lines.push(`  source: ${quoteYaml(item.translationSource)}`);
    if (item.translationSourceUrl) lines.push(`  sourceUrl: ${item.translationSourceUrl}`);
  }

  lines.push('---', '');
  return lines;
};

const buildLongformMarkdown = (item: LongformCreateItem): string =>
  `${buildFrontmatterLines(item).join('\n')}${item.body}`;

const createJsonErrorResponse = (status: number, errors: readonly string[]): Response =>
  new Response(JSON.stringify({ ok: false, errors }, null, 2), {
    status,
    headers: JSON_HEADERS
  });

const readExistingPublicSlugs = async (): Promise<Map<string, string>> => {
  const slugs = new Map<string, string>();
  const files = await listAdminCollectionSourceFiles('longform');

  for (const filePath of files) {
    const entryId = resolveAdminContentEntryIdFromSourcePath('longform', filePath);
    const frontmatter = await readAdminSourceFrontmatterRecord(filePath);
    const explicitSlug = asTrimmedString(frontmatter.slug);
    const publicSlug = explicitSlug || flattenEntryIdToSlug(entryId);
    slugs.set(publicSlug, entryId);
  }

  return slugs;
};

const getLongformCreatePath = (
  item: Pick<LongformCreateItem, 'date' | 'slug'>
): { filePath: string; relativePath: string } => {
  const monthDir = getDateMonthDir(item.date);
  const relativePath = `src/content/longform/${monthDir}/${item.slug}.md`;
  return {
    relativePath,
    filePath: join(getLongformContentDir(), monthDir, `${item.slug}.md`)
  };
};

const withAdminLongformCreateLock = createAdminWriteQueue();

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

  const requestError = validateAdminJsonWriteRequest(request, url, 'Category Console 长文创建');
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

  return withAdminLongformCreateLock(async () => {
    try {
      const existingSlugs = await readExistingPublicSlugs();
      const duplicateEntryId = existingSlugs.get(item.slug);
      if (duplicateEntryId) {
        return createJsonErrorResponse(409, [`slug "${item.slug}" 已被占用：${duplicateEntryId}`]);
      }

      const { filePath, relativePath } = getLongformCreatePath(item);
      if (await fileExists(filePath)) {
        return createJsonErrorResponse(409, [`目标文件已存在：${relativePath}`]);
      }

      const markdown = buildLongformMarkdown(item);
      const publicHref = `/archive/${item.slug}/`;

      if (isAdminDryRunRequest(url)) {
        return new Response(
          JSON.stringify(
            {
              ok: true,
              result: {
                dryRun: true,
                relativePath,
                publicHref,
                slug: item.slug,
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
          id: 'longform',
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
              publicHref,
              slug: item.slug
            }
          },
          null,
          2
        ),
        { headers: JSON_HEADERS }
      );
    } catch (error) {
      console.error('[astro-whono] Failed to create longform entry:', error);
      return createJsonErrorResponse(500, ['创建长文失败，请检查本地文件权限或日志']);
    }
  });
};
