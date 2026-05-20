import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  parseMarkdownFrontmatterDocument,
  patchMarkdownFrontmatter,
  splitMarkdownFrontmatter
} from './frontmatter';
import { formatISODate } from '../../utils/format';

export type AdminPickCreateItem = {
  year: number;
  date: string;
  title: string;
  authors: string[];
  reason: string;
  tags: string[];
};

export type AdminPicksStats = {
  itemCount: number;
  latestPickDateLabel: string;
  storagePathLabel: string;
};

export type AdminPickCreateResult = {
  item?: AdminPickCreateItem;
  errors: string[];
};

export type AdminPicksAppendResult = {
  content: string;
  snippet: string;
};

export type AdminPicksIntroResult = {
  intro?: string[];
  errors: string[];
};

const MAX_TITLE_LENGTH = 180;
const MAX_AUTHOR_LENGTH = 180;
const MAX_AUTHOR_COUNT = 12;
const MAX_REASON_LENGTH = 4000;
const MAX_TAG_LENGTH = 40;
const MAX_TAG_COUNT = 12;
const MAX_INTRO_LENGTH = 4000;

const getProjectRoot = (): string =>
  process.env.ASTRO_WHONO_INTERNAL_TEST_PROJECT_ROOT?.trim() || process.cwd();

export const getPicksContentDir = (): string =>
  path.join(getProjectRoot(), 'src', 'content', 'picks');

export const getPicksIndexPath = (): string =>
  path.join(getPicksContentDir(), 'index.md');

export const getPicksIndexRelativePath = (): string => 'src/content/picks/index.md';

export const getPicksStoragePathLabel = (): string => 'src/content/picks/YYYY';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const hasControlCharacters = (value: string): boolean =>
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);

const normalizeOneLine = (value: string): string =>
  value.replace(/\r\n?/g, '\n').replace(/\s+/g, ' ').trim();

const normalizePickTitle = (value: string): string => {
  const title = normalizeOneLine(value);
  if (!title) return '';
  if (title.startsWith('《') && title.endsWith('》')) return title;
  const innerTitle = title.replace(/^《+/, '').replace(/》+$/, '').trim();
  return innerTitle ? `《${innerTitle}》` : title;
};

const normalizeReason = (value: string): string =>
  value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const splitLooseList = (value: string): string[] =>
  Array.from(
    new Set(
      value
        .split(/[,\n，、；;]+/)
        .map((part) => normalizeOneLine(part))
        .filter(Boolean)
    )
  );

const splitTags = (value: string): string[] =>
  Array.from(
    new Set(
      value
        .split(/[,\s，、#]+/)
        .map((part) => part.trim().replace(/^#+/, ''))
        .filter(Boolean)
    )
  );

const normalizeTags = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .filter((item): item is string => typeof item === 'string')
          .flatMap((item) => splitTags(item))
      )
    );
  }

  return splitTags(asTrimmedString(value));
};

const normalizeAuthors = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .filter((item): item is string => typeof item === 'string')
          .flatMap((item) => splitLooseList(item))
      )
    );
  }

  return splitLooseList(asTrimmedString(value));
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const pad2 = (value: number): string => String(value).padStart(2, '0');

export const createPickLocalTimestamp = (): { date: string; datePart: string; fileStamp: string; year: number } => {
  const now = new Date();
  const tzMinutes = -now.getTimezoneOffset();
  const sign = tzMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(tzMinutes);
  const tzHours = pad2(Math.floor(abs / 60));
  const tzRemainder = pad2(abs % 60);
  const year = now.getFullYear();
  const datePart = `${year}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const timePart = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
  const fileStamp = `${datePart}-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;

  return {
    date: `${datePart}T${timePart}${sign}${tzHours}:${tzRemainder}`,
    datePart,
    fileStamp,
    year
  };
};

const buildHeading = (item: Pick<AdminPickCreateItem, 'title' | 'authors'>): string =>
  item.authors.length > 0 ? `${item.title}- ${item.authors.join('、')}` : item.title;

export const normalizePickCreateInput = (body: unknown): AdminPickCreateResult => {
  if (!isRecord(body)) {
    return {
      errors: ['请求体必须是 JSON 对象']
    };
  }

  const rawItem = isRecord(body.item) ? body.item : body;
  const timestamp = createPickLocalTimestamp();
  const title = normalizePickTitle(asTrimmedString(rawItem.title));
  const authors = normalizeAuthors(rawItem.authors ?? rawItem.creator);
  const reason = normalizeReason(asTrimmedString(rawItem.reason));
  const tags = normalizeTags(rawItem.tags);
  const errors: string[] = [];

  if (!title) errors.push('请填写拾选标题');
  if (!reason) errors.push('请填写推荐理由');

  for (const [field, value, limit] of [
    ['标题', title, MAX_TITLE_LENGTH],
    ['推荐理由', reason, MAX_REASON_LENGTH]
  ] as const) {
    if (value.length > limit) errors.push(`${field}过长`);
    if (hasControlCharacters(value)) errors.push(`${field}包含不可见控制字符`);
  }

  if (authors.length > MAX_AUTHOR_COUNT) {
    errors.push(`作者最多 ${MAX_AUTHOR_COUNT} 位`);
  }

  authors.forEach((author) => {
    if (author.length > MAX_AUTHOR_LENGTH) errors.push(`作者「${author.slice(0, 12)}」过长`);
    if (hasControlCharacters(author)) errors.push('作者包含不可见控制字符');
  });

  if (tags.length > MAX_TAG_COUNT) {
    errors.push(`标签最多 ${MAX_TAG_COUNT} 个`);
  }

  tags.forEach((tag) => {
    if (tag.length > MAX_TAG_LENGTH) errors.push(`标签「${tag.slice(0, 12)}」过长`);
    if (hasControlCharacters(tag)) errors.push('标签包含不可见控制字符');
  });

  if (errors.length > 0) {
    return { errors };
  }

  return {
    item: {
      year: timestamp.year,
      date: timestamp.date,
      title,
      authors,
      reason,
      tags
    },
    errors
  };
};

export const buildPickMarkdownSnippet = (item: AdminPickCreateItem): string => {
  const lines = [`### ${buildHeading(item)}`, '', item.reason];

  if (item.tags.length > 0) {
    const tagHtml = item.tags
      .map((tag) => `<span class="pick-tag">#${escapeHtml(tag)}</span>`)
      .join('');
    lines.push('', `<p class="pick-tags" aria-label="标签">${tagHtml}</p>`);
  }

  return lines.join('\n');
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

export const buildPickMarkdownFile = (item: AdminPickCreateItem): string => {
  const lines = [
    '---',
    `title: ${quoteYaml(item.title)}`,
    `date: ${item.date}`,
    `year: ${item.year}`
  ];

  if (item.authors.length > 0) {
    lines.push('authors:');
    item.authors.forEach((author) => {
      lines.push(`  - ${quoteYaml(author)}`);
    });
  }

  if (item.tags.length > 0) {
    lines.push('tags:');
    item.tags.forEach((tag) => {
      lines.push(`  - ${quoteYaml(tag)}`);
    });
  }

  lines.push('draft: false', '---', '', item.reason, '');

  return `${lines.join('\n')}\n`;
};

const normalizeFilenamePart = (value: string): string => {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'pick';
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

export const getAvailablePickPath = async (
  item: AdminPickCreateItem
): Promise<{ filePath: string; relativePath: string }> => {
  const fileStamp = item.date
    .replace(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2}).*$/, '$1-$2$3$4')
    .replace(/[^0-9-]/g, '');
  const filenameBase = `${normalizeFilenamePart(item.title)}-${fileStamp || createPickLocalTimestamp().fileStamp}`;
  const year = String(item.year);
  const yearDir = path.join(getPicksContentDir(), year);

  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? '' : `-${index + 1}`;
    const filename = `${filenameBase}${suffix}.md`;
    const filePath = path.join(yearDir, filename);
    const relativePath = `src/content/picks/${year}/${filename}`;
    if (!(await fileExists(filePath))) {
      return { filePath, relativePath };
    }
  }

  throw new Error('Unable to create a unique picks filename');
};

const getBodyWithNormalizedLineEndings = (sourceText: string) =>
  splitMarkdownFrontmatter(sourceText).bodyText.replace(/\r\n/g, '\n').trim();

const getSourcePrefix = (sourceText: string): string => {
  const section = splitMarkdownFrontmatter(sourceText);
  return sourceText.slice(0, sourceText.length - section.bodyText.length);
};

const normalizeHeadingText = (value: string): string =>
  value.replace(/\s*-\s*/g, ' - ').replace(/\s+/g, ' ').trim().toLowerCase();

const hasDuplicatePick = (bodyText: string, item: AdminPickCreateItem): boolean => {
  const yearHeadingPattern = new RegExp(`^##\\s+${item.year}\\s*$`, 'm');
  const yearMatch = yearHeadingPattern.exec(bodyText);
  if (!yearMatch) return false;

  const yearStart = yearMatch.index + yearMatch[0].length;
  const nextYearMatch = /^##\s+\d{4}\s*$/m.exec(bodyText.slice(yearStart));
  const yearBody = nextYearMatch ? bodyText.slice(yearStart, yearStart + nextYearMatch.index) : bodyText.slice(yearStart);
  const targetHeading = normalizeHeadingText(buildHeading(item));
  const headingMatches = yearBody.matchAll(/^###\s+(.+)$/gm);

  for (const match of headingMatches) {
    if (normalizeHeadingText(match[1] ?? '') === targetHeading) {
      return true;
    }
  }

  return false;
};

const getFrontmatterRecord = (sourceText: string): Record<string, unknown> => {
  const section = splitMarkdownFrontmatter(sourceText);
  const document = parseMarkdownFrontmatterDocument(section.frontmatterText);
  const raw = document.toJS();
  return isRecord(raw) ? raw : {};
};

const normalizeFrontmatterDate = (value: unknown): Date | null => {
  if (value instanceof Date && Number.isFinite(value.valueOf())) return value;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? date : null;
};

const getStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
};

const hasDuplicatePickFile = async (item: AdminPickCreateItem): Promise<boolean> => {
  const yearDir = path.join(getPicksContentDir(), String(item.year));
  let entries;
  try {
    entries = await readdir(yearDir, { withFileTypes: true });
  } catch {
    return false;
  }

  const targetHeading = normalizeHeadingText(buildHeading(item));

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.md')) continue;
    const sourceText = await readFile(path.join(yearDir, entry.name), 'utf8').catch(() => '');
    if (!sourceText) continue;
    const frontmatter = getFrontmatterRecord(sourceText);
    const title = normalizeOneLine(asTrimmedString(frontmatter.title));
    const authors = getStringArray(frontmatter.authors);
    const heading = normalizeHeadingText(buildHeading({ title, authors }));
    if (heading && heading === targetHeading) {
      return true;
    }
  }

  return false;
};

export const assertNoDuplicatePick = async (item: AdminPickCreateItem): Promise<void> => {
  const indexText = await readFile(getPicksIndexPath(), 'utf8').catch(() => '');
  if (indexText && hasDuplicatePick(getBodyWithNormalizedLineEndings(indexText), item)) {
    throw new Error(`同一年份下已存在「${buildHeading(item)}」`);
  }

  if (await hasDuplicatePickFile(item)) {
    throw new Error(`同一年份下已存在「${buildHeading(item)}」`);
  }
};

const insertSnippetInExistingYear = (bodyText: string, item: AdminPickCreateItem, snippet: string): string | null => {
  const pattern = new RegExp(`(^|\\n)##\\s+${item.year}\\s*\\n+`);
  const match = pattern.exec(bodyText);
  if (!match) return null;

  const insertIndex = match.index + match[0].length;
  return `${bodyText.slice(0, insertIndex)}${snippet}\n\n${bodyText.slice(insertIndex).replace(/^\n+/, '')}`;
};

const insertNewYearSection = (bodyText: string, item: AdminPickCreateItem, snippet: string): string => {
  const section = `## ${item.year}\n\n${snippet}`;
  const headingMatches = Array.from(bodyText.matchAll(/^##\s+(\d{4})\s*$/gm));

  if (headingMatches.length === 0) {
    return bodyText ? `${section}\n\n${bodyText}` : section;
  }

  for (const match of headingMatches) {
    const candidateYear = Number(match[1]);
    if (Number.isFinite(candidateYear) && item.year > candidateYear) {
      return `${bodyText.slice(0, match.index)}${section}\n\n${bodyText.slice(match.index).replace(/^\n+/, '')}`;
    }
  }

  return `${bodyText}\n\n${section}`;
};

export const appendPickToMarkdown = (sourceText: string, item: AdminPickCreateItem): AdminPicksAppendResult => {
  const section = splitMarkdownFrontmatter(sourceText);
  const lineEnding = section.lineEnding;
  const bodyText = getBodyWithNormalizedLineEndings(sourceText);
  const snippet = buildPickMarkdownSnippet(item);

  if (hasDuplicatePick(bodyText, item)) {
    throw new Error(`同一年份下已存在「${buildHeading(item)}」`);
  }

  const nextBody = insertSnippetInExistingYear(bodyText, item, snippet)
    ?? insertNewYearSection(bodyText, item, snippet);
  const normalizedBody = `\n${nextBody.trim()}\n`.replaceAll('\n', lineEnding);

  return {
    content: `${getSourcePrefix(sourceText)}${normalizedBody}`,
    snippet
  };
};

export const parsePicksMarkdownStats = (sourceText: string): AdminPicksStats => {
  const bodyText = getBodyWithNormalizedLineEndings(sourceText);
  const itemCount = Array.from(bodyText.matchAll(/^###\s+.+$/gm)).length;
  const frontmatterDate = normalizeFrontmatterDate(getFrontmatterRecord(sourceText).date);

  return {
    itemCount,
    latestPickDateLabel: frontmatterDate ? formatISODate(frontmatterDate) : '未设置日期',
    storagePathLabel: getPicksStoragePathLabel()
  };
};

const readPicksFileStats = async (): Promise<{ itemCount: number; latestDate: Date | null }> => {
  const contentDir = getPicksContentDir();
  let yearDirs;
  try {
    yearDirs = await readdir(contentDir, { withFileTypes: true });
  } catch {
    return { itemCount: 0, latestDate: null };
  }

  let itemCount = 0;
  let latestDate: Date | null = null;

  for (const yearDir of yearDirs) {
    if (!yearDir.isDirectory() || !/^\d{4}$/.test(yearDir.name)) continue;
    const folder = path.join(contentDir, yearDir.name);
    const files = await readdir(folder, { withFileTypes: true }).catch(() => []);
    for (const file of files) {
      if (!file.isFile() || !file.name.toLowerCase().endsWith('.md')) continue;
      itemCount += 1;
      const sourceText = await readFile(path.join(folder, file.name), 'utf8').catch(() => '');
      if (!sourceText) continue;
      const date = normalizeFrontmatterDate(getFrontmatterRecord(sourceText).date);
      if (date && (!latestDate || date.valueOf() > latestDate.valueOf())) {
        latestDate = date;
      }
    }
  }

  return { itemCount, latestDate };
};

export const readAdminPicksStats = async (): Promise<AdminPicksStats | null> => {
  try {
    const sourceText = await readFile(getPicksIndexPath(), 'utf8').catch(() => '');
    const indexStats = sourceText
      ? parsePicksMarkdownStats(sourceText)
      : {
          itemCount: 0,
          latestPickDateLabel: '未设置日期',
          storagePathLabel: getPicksStoragePathLabel()
        };
    const fileStats = await readPicksFileStats();
    const indexDate = sourceText ? normalizeFrontmatterDate(getFrontmatterRecord(sourceText).date) : null;
    const latestDate = [indexDate, fileStats.latestDate]
      .filter((date): date is Date => date instanceof Date)
      .sort((left, right) => right.valueOf() - left.valueOf())[0] ?? null;

    return {
      itemCount: indexStats.itemCount + fileStats.itemCount,
      latestPickDateLabel: latestDate ? formatISODate(latestDate) : indexStats.latestPickDateLabel,
      storagePathLabel: getPicksStoragePathLabel()
    };
  } catch {
    return null;
  }
};

export const readAdminPicksIntro = async (): Promise<string[]> => {
  const fallback = [
    '这里按年份收集我想留下、回看或推荐的书。',
    '每一本只留下最直接的理由：它解决了什么问题，带来什么视角，适合谁在什么时候翻开。',
    '书单会慢慢更新，不追求完整，只保留真正想分享的部分。'
  ];

  const sourceText = await readFile(getPicksIndexPath(), 'utf8').catch(() => '');
  if (!sourceText) return fallback;
  const frontmatter = getFrontmatterRecord(sourceText);
  const intro = getStringArray(frontmatter.intro);
  return intro.length > 0 ? intro : fallback;
};

export const normalizePicksIntroInput = (body: unknown): AdminPicksIntroResult => {
  if (!isRecord(body)) {
    return {
      errors: ['请求体必须是 JSON 对象']
    };
  }

  const rawIntro = typeof body.intro === 'string'
    ? body.intro
    : Array.isArray(body.intro)
      ? body.intro.filter((item): item is string => typeof item === 'string').join('\n')
      : '';
  const intro = rawIntro
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const joined = intro.join('\n');
  const errors: string[] = [];

  if (!intro.length) errors.push('请填写 /picks/ 页面介绍');
  if (joined.length > MAX_INTRO_LENGTH) errors.push(`介绍文案不能超过 ${MAX_INTRO_LENGTH} 个字符`);
  if (hasControlCharacters(joined)) errors.push('介绍文案包含不可见控制字符');

  return errors.length > 0 ? { errors } : { intro, errors };
};

export const updatePicksIntroMarkdown = (sourceText: string, intro: string[]): string =>
  patchMarkdownFrontmatter(sourceText, [
    {
      path: ['intro'],
      value: intro,
      action: 'set'
    }
  ]);
