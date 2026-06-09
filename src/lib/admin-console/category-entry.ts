import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { parseLongformDateInput, parseLongformPublishedAtInput } from '../../utils/date-only';
import { normalizeBitsAvatarPath, toSafeHttpUrl } from '../../utils/format';
import { flattenEntryIdToSlug, LONGFORM_PUBLIC_SLUG_RE, RESERVED_LONGFORM_SLUGS } from '../../utils/slug-rules';
import { splitTagInput } from '../../utils/tag-input';
import {
  parseMarkdownFrontmatterDocument,
  splitMarkdownFrontmatter
} from './frontmatter';

export type AdminCategoryEntryCollection = 'longform' | 'bits' | 'picks' | 'materials';

export type AdminCategoryEntryListItem = {
  collection: AdminCategoryEntryCollection;
  entryId: string;
  relativePath: string;
  revision: string;
  title: string;
  date: string;
  year: number | null;
  draft: boolean;
  slug: string;
  tags: string[];
  description: string;
  publicHref: string | null;
};

export type AdminCategoryEntryPayload = {
  collection: AdminCategoryEntryCollection;
  entryId: string;
  relativePath: string;
  revision: string;
  values: Record<string, string | boolean>;
};

export type AdminCategoryEntryDeleteTarget = {
  collection: AdminCategoryEntryCollection;
  entryId: string;
  sourcePath: string;
  relativePath: string;
  revision: string;
};

export type AdminCategoryEntryValidationIssue = {
  path: string;
  message: string;
};

type SourceState = {
  collection: AdminCategoryEntryCollection;
  entryId: string;
  sourcePath: string;
  relativePath: string;
  revision: string;
  rawFrontmatter: Record<string, unknown>;
  bodyText: string;
  lineEnding: '\n' | '\r\n';
};

type BuildResult = {
  content?: string;
  issues: AdminCategoryEntryValidationIssue[];
};

export class AdminCategoryEntryError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(status: number, path: string, message: string) {
    super(message);
    this.name = 'AdminCategoryEntryError';
    this.status = status;
    this.path = path;
  }
}

const COLLECTIONS = ['longform', 'bits', 'picks', 'materials'] as const;
const MARKDOWN_EXTENSIONS = ['.md', '.mdx'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getProjectRoot = (): string =>
  process.env.ASTRO_WHONO_INTERNAL_TEST_PROJECT_ROOT?.trim() || process.cwd();

const getContentRoot = (): string => path.join(getProjectRoot(), 'src', 'content');

const getCollectionRoot = (collection: AdminCategoryEntryCollection): string =>
  path.join(getContentRoot(), collection);

const toRelativeProjectPath = (filePath: string): string =>
  path.relative(getProjectRoot(), filePath).replace(/\\/g, '/');

const normalizeOptionalText = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
};

const getStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => normalizeOptionalText(item)).filter(Boolean)
    : [];

const toBoolean = (value: unknown): boolean => value === true || value === 'true';

const hasOwnField = (input: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(input, key);

const createIssue = (pathName: string, message: string): AdminCategoryEntryValidationIssue => ({
  path: pathName,
  message
});

const hashSourceText = (sourceText: string): string =>
  createHash('sha1').update(sourceText).digest('hex');

const normalizeEntryId = (entryId: string): string => {
  const normalized = entryId.trim().replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('//')) {
    throw new AdminCategoryEntryError(400, 'entryId', `不支持的 entryId：${entryId}`);
  }

  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new AdminCategoryEntryError(400, 'entryId', `不支持的 entryId：${entryId}`);
  }

  return normalized;
};

export const isAdminCategoryEntryCollection = (value: string): value is AdminCategoryEntryCollection =>
  (COLLECTIONS as readonly string[]).includes(value);

export const resolveAdminCategoryEntrySourcePath = (
  collection: AdminCategoryEntryCollection,
  entryId: string
): string => {
  const normalizedEntryId = normalizeEntryId(entryId);
  const root = getCollectionRoot(collection);
  const basePath = path.join(root, ...normalizedEntryId.split('/'));
  const candidates = MARKDOWN_EXTENSIONS.flatMap((extension) => [
    `${basePath}${extension}`,
    path.join(basePath, `index${extension}`)
  ]);

  const sourcePath = candidates.find((candidate) => existsSync(candidate));
  if (!sourcePath) {
    throw new AdminCategoryEntryError(404, 'entryId', `未找到内容文件：${collection}/${normalizedEntryId}`);
  }

  const relativeToRoot = path.relative(root, sourcePath);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    throw new AdminCategoryEntryError(400, 'entryId', `不支持的 entryId：${entryId}`);
  }

  return sourcePath;
};

const resolveEntryIdFromSourcePath = (
  collection: AdminCategoryEntryCollection,
  filePath: string
): string => {
  const relative = path.relative(getCollectionRoot(collection), filePath).replace(/\\/g, '/');
  const extension = MARKDOWN_EXTENSIONS.find((item) => relative.endsWith(item)) ?? '.md';
  const withoutExtension = relative.slice(0, -extension.length);
  return withoutExtension.endsWith('/index')
    ? withoutExtension.slice(0, -'/index'.length)
    : withoutExtension;
};

const listSourceFiles = async (collection: AdminCategoryEntryCollection): Promise<string[]> => {
  const root = getCollectionRoot(collection);
  if (!existsSync(root)) return [];

  const walk = async (dirPath: string): Promise<string[]> => {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) return walk(fullPath);
      if (entry.isFile() && MARKDOWN_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
        return [fullPath];
      }
      return [];
    }));
    return nested.flat();
  };

  return walk(root);
};

const loadSourceState = async (
  collection: AdminCategoryEntryCollection,
  entryId: string
): Promise<SourceState> => {
  const sourcePath = resolveAdminCategoryEntrySourcePath(collection, entryId);
  const sourceText = await readFile(sourcePath, 'utf8');
  const section = splitMarkdownFrontmatter(sourceText);
  const document = parseMarkdownFrontmatterDocument(section.frontmatterText);
  const rawFrontmatter = document.toJS();

  return {
    collection,
    entryId: normalizeEntryId(entryId),
    sourcePath,
    relativePath: toRelativeProjectPath(sourcePath),
    revision: hashSourceText(sourceText),
    rawFrontmatter: isRecord(rawFrontmatter) ? rawFrontmatter : {},
    bodyText: section.bodyText.replace(/\r\n/g, '\n').trimEnd(),
    lineEnding: section.lineEnding
  };
};

const normalizeDateValue = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  return normalizeOptionalText(value);
};

const getYear = (dateText: string): number | null => {
  const match = /^(\d{4})/.exec(dateText);
  return match ? Number.parseInt(match[1] ?? '', 10) : null;
};

const getPublicHref = (
  collection: AdminCategoryEntryCollection,
  entryId: string,
  frontmatter: Record<string, unknown>
): string | null => {
  if (frontmatter.draft === true) return null;
  if (collection === 'longform') {
    return `/archive/${normalizeOptionalText(frontmatter.slug) || flattenEntryIdToSlug(entryId)}/`;
  }
  if (collection === 'bits') return `/bits/#bit-${entryId}`;
  if (collection === 'picks') return '/picks/';
  if (collection === 'materials') return '/Materials/';
  return null;
};

const readListItem = async (
  collection: AdminCategoryEntryCollection,
  filePath: string
): Promise<AdminCategoryEntryListItem | null> => {
  const entryId = resolveEntryIdFromSourcePath(collection, filePath);
  if (collection === 'picks' && entryId === 'index') return null;

  const sourceText = await readFile(filePath, 'utf8');
  const section = splitMarkdownFrontmatter(sourceText);
  const document = parseMarkdownFrontmatterDocument(section.frontmatterText);
  const rawFrontmatter = document.toJS();
  const frontmatter = isRecord(rawFrontmatter) ? rawFrontmatter : {};
  const date = normalizeDateValue(frontmatter.date);
  const title = normalizeOptionalText(frontmatter.title) || entryId;
  const tags = getStringArray(frontmatter.tags);
  const slug = normalizeOptionalText(frontmatter.slug);

  return {
    collection,
    entryId,
    relativePath: toRelativeProjectPath(filePath),
    revision: hashSourceText(sourceText),
    title,
    date,
    year: getYear(date),
    draft: frontmatter.draft === true,
    slug,
    tags,
    description: normalizeOptionalText(frontmatter.description),
    publicHref: getPublicHref(collection, entryId, frontmatter)
  };
};

export const listAdminCategoryEntries = async (
  collection: AdminCategoryEntryCollection,
  query = ''
): Promise<AdminCategoryEntryListItem[]> => {
  const files = await listSourceFiles(collection);
  const items = (await Promise.all(files.map((filePath) => readListItem(collection, filePath))))
    .filter((item): item is AdminCategoryEntryListItem => item !== null)
    .sort((left, right) => {
      const dateOrder = right.date.localeCompare(left.date);
      return dateOrder || left.title.localeCompare(right.title, 'zh-Hans-CN');
    });

  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return items;

  return items.filter((item) => {
    const haystack = [
      item.title,
      item.entryId,
      item.relativePath,
      item.slug,
      item.description,
      item.tags.join(' ')
    ].join(' ').toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
};

const toPayloadValues = (state: SourceState): Record<string, string | boolean> => {
  const frontmatter = state.rawFrontmatter;
  const date = normalizeDateValue(frontmatter.date);
  const tagsText = getStringArray(frontmatter.tags).join(', ');
  const body = state.bodyText;

  if (state.collection === 'longform') {
    const author = isRecord(frontmatter.author) ? frontmatter.author : {};
    const authors = Array.isArray(frontmatter.authors) ? frontmatter.authors : [];
    const authorNames = authors.length > 0
      ? authors.map((item) => isRecord(item) ? normalizeOptionalText(item.name) : '').filter(Boolean)
      : [normalizeOptionalText(author.name)].filter(Boolean);
    const firstAuthor = authors.find(isRecord) ?? author;
    const translation = isRecord(frontmatter.translation) ? frontmatter.translation : {};
    return {
      title: normalizeOptionalText(frontmatter.title),
      description: normalizeOptionalText(frontmatter.description),
      date,
      publishedAt: normalizeDateValue(frontmatter.publishedAt),
      tagsText,
      draft: frontmatter.draft === true,
      archive: frontmatter.archive !== false,
      slug: normalizeOptionalText(frontmatter.slug),
      cover: normalizeOptionalText(frontmatter.cover),
      badge: normalizeOptionalText(frontmatter.badge),
      authorsText: authorNames.join('\n'),
      authorAvatar: normalizeOptionalText(firstAuthor.avatar),
      authorShowAvatar: firstAuthor.showAvatar !== false,
      translationTranslator: normalizeOptionalText(translation.translator),
      translationAvatar: normalizeOptionalText(translation.avatar),
      translationShowAvatar: translation.showAvatar !== false,
      translationSource: normalizeOptionalText(translation.source),
      translationSourceUrl: normalizeOptionalText(translation.sourceUrl),
      body
    };
  }

  if (state.collection === 'bits') {
    const author = isRecord(frontmatter.author) ? frontmatter.author : {};
    return {
      title: normalizeOptionalText(frontmatter.title),
      description: normalizeOptionalText(frontmatter.description),
      date,
      tagsText,
      draft: frontmatter.draft === true,
      slug: normalizeOptionalText(frontmatter.slug),
      authorName: normalizeOptionalText(author.name),
      authorAvatar: normalizeOptionalText(author.avatar),
      imagesText: Array.isArray(frontmatter.images) ? JSON.stringify(frontmatter.images, null, 2) : '',
      body
    };
  }

  if (state.collection === 'picks') {
    return {
      title: normalizeOptionalText(frontmatter.title),
      date,
      year: normalizeOptionalText(frontmatter.year),
      status: normalizeOptionalText(frontmatter.status) === 'planned' ? 'planned' : 'shared',
      authorsText: getStringArray(frontmatter.authors).join('\n'),
      tagsText,
      draft: frontmatter.draft === true,
      slug: normalizeOptionalText(frontmatter.slug),
      body
    };
  }

  return {
    title: normalizeOptionalText(frontmatter.title),
    href: normalizeOptionalText(frontmatter.href),
    date,
    label: normalizeOptionalText(frontmatter.label),
    description: normalizeOptionalText(frontmatter.description)
  };
};

export const readAdminCategoryEntryPayload = async (
  collection: AdminCategoryEntryCollection,
  entryId: string
): Promise<AdminCategoryEntryPayload> => {
  const state = await loadSourceState(collection, entryId);
  return {
    collection,
    entryId: state.entryId,
    relativePath: state.relativePath,
    revision: state.revision,
    values: toPayloadValues(state)
  };
};

export const readAdminCategoryEntryDeleteTarget = async (
  collection: AdminCategoryEntryCollection,
  entryId: string
): Promise<AdminCategoryEntryDeleteTarget> => {
  const state = await loadSourceState(collection, entryId);
  if (state.collection === 'picks' && state.entryId === 'index') {
    throw new AdminCategoryEntryError(400, 'entryId', 'picks/index.md 是页面介绍文件，不能从已有内容列表删除');
  }

  return {
    collection: state.collection,
    entryId: state.entryId,
    sourcePath: state.sourcePath,
    relativePath: state.relativePath,
    revision: state.revision
  };
};

const getInputString = (input: Record<string, unknown>, key: string): string =>
  normalizeOptionalText(input[key]);

const getInputBoolean = (input: Record<string, unknown>, key: string): boolean =>
  toBoolean(input[key]);

const splitLines = (value: string): string[] =>
  Array.from(new Set(value.split(/\r?\n|[,，、；;]+/).map((item) => item.trim()).filter(Boolean)));

const splitTags = (value: string): string[] => splitTagInput(value, { stripLeadingHash: true });

const normalizeBody = (value: string): string =>
  `${value.replace(/\r\n?/g, '\n').trimEnd()}\n`;

const setOptional = (
  target: Record<string, unknown>,
  key: string,
  value: unknown,
  isPresent: boolean
) => {
  if (isPresent) target[key] = value;
  else delete target[key];
};

const buildLongform = async (
  state: SourceState,
  input: Record<string, unknown>
): Promise<BuildResult> => {
  const issues: AdminCategoryEntryValidationIssue[] = [];
  const frontmatter = { ...state.rawFrontmatter };
  const title = getInputString(input, 'title');
  const description = getInputString(input, 'description');
  const dateRaw = getInputString(input, 'date');
  const publishedAtRaw = getInputString(input, 'publishedAt');
  const dateResult = parseLongformDateInput(dateRaw);
  const publishedAtResult = publishedAtRaw ? parseLongformPublishedAtInput(publishedAtRaw) : null;
  const slug = getInputString(input, 'slug');
  const badge = getInputString(input, 'badge');
  const authors = splitLines(getInputString(input, 'authorsText'));
  const authorAvatarRaw = getInputString(input, 'authorAvatar');
  const authorAvatar = authorAvatarRaw ? normalizeBitsAvatarPath(authorAvatarRaw) : '';
  const translationSourceUrlRaw = getInputString(input, 'translationSourceUrl');
  const translationSourceUrl = translationSourceUrlRaw ? toSafeHttpUrl(translationSourceUrlRaw) : '';
  const translationAvatarRaw = getInputString(input, 'translationAvatar');
  const translationAvatar = translationAvatarRaw ? normalizeBitsAvatarPath(translationAvatarRaw) : '';

  if (!title) issues.push(createIssue('title', '请填写长文标题'));
  if (!dateResult) issues.push(createIssue('date', 'date 必须是 YYYY-MM-DD 或带时区的 ISO 时间'));
  if (publishedAtRaw && !publishedAtResult) issues.push(createIssue('publishedAt', 'publishedAt 必须是带时区的 ISO 时间'));
  if (slug && !LONGFORM_PUBLIC_SLUG_RE.test(slug)) issues.push(createIssue('slug', 'slug 必须是小写 kebab-case'));
  if (slug && RESERVED_LONGFORM_SLUGS.has(slug)) issues.push(createIssue('slug', `slug "${slug}" 与保留路由冲突`));
  if (authorAvatarRaw && !authorAvatar) issues.push(createIssue('authorAvatar', '作者头像路径不合法'));
  if (translationAvatarRaw && !translationAvatar) issues.push(createIssue('translationAvatar', '译者头像路径不合法'));
  if (translationSourceUrlRaw && !translationSourceUrl) issues.push(createIssue('translationSourceUrl', '原文链接必须是 http(s) URL'));

  const otherLongformFiles = await listSourceFiles('longform');
  for (const filePath of otherLongformFiles) {
    const candidateEntryId = resolveEntryIdFromSourcePath('longform', filePath);
    if (candidateEntryId === state.entryId) continue;
    const item = await readListItem('longform', filePath);
    if (item && (slug || flattenEntryIdToSlug(state.entryId)) === (item.slug || flattenEntryIdToSlug(candidateEntryId))) {
      issues.push(createIssue('slug', `公开 slug 已被其他长文占用：${candidateEntryId}`));
      break;
    }
  }

  if (issues.length > 0 || !dateResult) return { issues };

  frontmatter.title = title;
  setOptional(frontmatter, 'description', description, Boolean(description));
  frontmatter.date = dateResult.dateText;
  setOptional(frontmatter, 'publishedAt', publishedAtRaw ? publishedAtResult?.toISOString() : undefined, Boolean(publishedAtRaw));
  frontmatter.tags = splitTags(getInputString(input, 'tagsText'));
  frontmatter.draft = getInputBoolean(input, 'draft');
  frontmatter.archive = getInputBoolean(input, 'archive');
  setOptional(frontmatter, 'slug', slug, Boolean(slug));
  if (hasOwnField(input, 'cover')) {
    const cover = getInputString(input, 'cover');
    setOptional(frontmatter, 'cover', cover, Boolean(cover));
  }
  setOptional(frontmatter, 'badge', badge, Boolean(badge));

  delete frontmatter.author;
  delete frontmatter.authors;
  if (authors.length === 1) {
    frontmatter.author = {
      name: authors[0],
      ...(authorAvatar ? { avatar: authorAvatar } : {}),
      ...(getInputBoolean(input, 'authorShowAvatar') ? {} : { showAvatar: false })
    };
  } else if (authors.length > 1) {
    frontmatter.authors = authors.map((name, index) => ({
      name,
      ...(index === 0 && authorAvatar ? { avatar: authorAvatar } : {}),
      ...(getInputBoolean(input, 'authorShowAvatar') ? {} : { showAvatar: false })
    }));
  }

  const translationTranslator = getInputString(input, 'translationTranslator');
  const translationSource = getInputString(input, 'translationSource');
  const hasTranslation = translationTranslator || translationAvatar || translationSource || translationSourceUrl || !getInputBoolean(input, 'translationShowAvatar');
  setOptional(frontmatter, 'translation', {
    ...(translationTranslator ? { translator: translationTranslator } : {}),
    ...(translationAvatar ? { avatar: translationAvatar } : {}),
    ...(getInputBoolean(input, 'translationShowAvatar') ? {} : { showAvatar: false }),
    ...(translationSource ? { source: translationSource } : {}),
    ...(translationSourceUrl ? { sourceUrl: translationSourceUrl } : {})
  }, Boolean(hasTranslation));

  return {
    issues,
    content: stringifyMarkdown(frontmatter, getInputString(input, 'body'), state.lineEnding)
  };
};

const parseImages = (value: string): { images?: unknown[]; issues: AdminCategoryEntryValidationIssue[] } => {
  const trimmed = value.trim();
  if (!trimmed) return { issues: [] };
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) return { issues: [createIssue('imagesText', 'images 必须是 JSON 数组')] };
    return { images: parsed, issues: [] };
  } catch {
    return { issues: [createIssue('imagesText', 'images 不是合法 JSON')] };
  }
};

const buildBits = (state: SourceState, input: Record<string, unknown>): BuildResult => {
  const issues: AdminCategoryEntryValidationIssue[] = [];
  const frontmatter = { ...state.rawFrontmatter };
  const date = getInputString(input, 'date');
  const authorName = getInputString(input, 'authorName');
  const authorAvatarRaw = getInputString(input, 'authorAvatar');
  const authorAvatar = authorAvatarRaw ? normalizeBitsAvatarPath(authorAvatarRaw) : '';
  const imageResult = parseImages(getInputString(input, 'imagesText'));

  if (!date || Number.isNaN(Date.parse(date))) issues.push(createIssue('date', '请填写合法的絮语日期'));
  if (authorAvatarRaw && !authorAvatar) issues.push(createIssue('authorAvatar', '作者头像路径不合法'));
  issues.push(...imageResult.issues);
  if (issues.length > 0) return { issues };

  setOptional(frontmatter, 'title', getInputString(input, 'title'), Boolean(getInputString(input, 'title')));
  setOptional(frontmatter, 'description', getInputString(input, 'description'), Boolean(getInputString(input, 'description')));
  frontmatter.date = date;
  frontmatter.tags = splitTags(getInputString(input, 'tagsText'));
  frontmatter.draft = getInputBoolean(input, 'draft');
  setOptional(frontmatter, 'slug', getInputString(input, 'slug'), Boolean(getInputString(input, 'slug')));
  setOptional(frontmatter, 'author', {
    ...(authorName ? { name: authorName } : {}),
    ...(authorAvatar ? { avatar: authorAvatar } : {})
  }, Boolean(authorName || authorAvatar));
  setOptional(frontmatter, 'images', imageResult.images, Boolean(imageResult.images?.length));

  return {
    issues,
    content: stringifyMarkdown(frontmatter, getInputString(input, 'body'), state.lineEnding)
  };
};

const buildPicks = (state: SourceState, input: Record<string, unknown>): BuildResult => {
  const issues: AdminCategoryEntryValidationIssue[] = [];
  const frontmatter = { ...state.rawFrontmatter };
  const title = getInputString(input, 'title');
  const date = getInputString(input, 'date');
  const yearRaw = getInputString(input, 'year');
  const year = Number.parseInt(yearRaw || date.slice(0, 4), 10);
  const status = getInputString(input, 'status') === 'planned' ? 'planned' : 'shared';
  const body = status === 'planned' ? '' : getInputString(input, 'body');

  if (!title) issues.push(createIssue('title', '请填写拾选标题'));
  if (status === 'shared' && !body) issues.push(createIssue('body', '请填写推荐理由'));
  if (date && Number.isNaN(Date.parse(date))) issues.push(createIssue('date', '拾选日期不合法'));
  if (yearRaw && Number.isNaN(year)) issues.push(createIssue('year', '年份必须是数字'));
  if (issues.length > 0) return { issues };

  frontmatter.title = title;
  setOptional(frontmatter, 'date', date, Boolean(date));
  setOptional(frontmatter, 'year', year, !Number.isNaN(year));
  setOptional(frontmatter, 'status', 'planned', status === 'planned');
  frontmatter.authors = splitLines(getInputString(input, 'authorsText'));
  frontmatter.tags = splitTags(getInputString(input, 'tagsText'));
  frontmatter.draft = getInputBoolean(input, 'draft');
  setOptional(frontmatter, 'slug', getInputString(input, 'slug'), Boolean(getInputString(input, 'slug')));

  return {
    issues,
    content: stringifyMarkdown(frontmatter, body, state.lineEnding)
  };
};

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

const buildMaterials = (state: SourceState, input: Record<string, unknown>): BuildResult => {
  const issues: AdminCategoryEntryValidationIssue[] = [];
  const frontmatter = { ...state.rawFrontmatter };
  const title = getInputString(input, 'title');
  const rawHref = getInputString(input, 'href');
  const href = normalizeMaterialHref(rawHref);
  const date = getInputString(input, 'date');

  if (!title) issues.push(createIssue('title', '请填写资料标题'));
  if (!rawHref) issues.push(createIssue('href', '请填写资料链接'));
  if (rawHref && !href) issues.push(createIssue('href', '资料链接不安全'));
  if (!date || Number.isNaN(Date.parse(date))) issues.push(createIssue('date', '请填写合法的资料日期'));
  if (issues.length > 0 || !href) return { issues };

  frontmatter.title = title;
  frontmatter.href = href;
  frontmatter.date = date;
  setOptional(frontmatter, 'label', getInputString(input, 'label'), Boolean(getInputString(input, 'label')));
  setOptional(frontmatter, 'description', getInputString(input, 'description'), Boolean(getInputString(input, 'description')));

  return {
    issues,
    content: stringifyMarkdown(frontmatter, '', state.lineEnding)
  };
};

const stringifyMarkdown = (
  frontmatter: Record<string, unknown>,
  body: string,
  lineEnding: '\n' | '\r\n'
): string => {
  const yaml = YAML.stringify(frontmatter).replace(/\n/g, lineEnding);
  const normalizedBody = normalizeBody(body).replace(/\n/g, lineEnding);
  return `---${lineEnding}${yaml.endsWith(lineEnding) ? yaml : `${yaml}${lineEnding}`}---${lineEnding}${lineEnding}${normalizedBody}`;
};

export const buildAdminCategoryEntryContent = async (
  collection: AdminCategoryEntryCollection,
  entryId: string,
  input: unknown
): Promise<{ state: SourceState; content?: string; issues: AdminCategoryEntryValidationIssue[] }> => {
  if (!isRecord(input)) {
    const state = await loadSourceState(collection, entryId);
    return {
      state,
      issues: [createIssue('fields', 'fields 必须是对象')]
    };
  }

  const state = await loadSourceState(collection, entryId);
  const result = collection === 'longform'
    ? await buildLongform(state, input)
    : collection === 'bits'
    ? buildBits(state, input)
    : collection === 'picks'
    ? buildPicks(state, input)
    : buildMaterials(state, input);

  return {
    state,
    ...result
  };
};
