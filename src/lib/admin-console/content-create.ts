import { createHash } from 'node:crypto';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  contentSourceEntryIdToPublicEntryId,
  flattenEntryIdToSlug
} from '../../utils/slug-rules';
import { buildAdminContentEntryEditorPayloadFromState } from './content-editor-payload';
import type {
  AdminBitsEditorValues,
  AdminEssayEditorValues,
  AdminMaterialsEditorValues
} from './content-editor-payload';
import {
  buildEssayFrontmatterFromValues,
  loadEssayPublicSlugUsage,
  type AdminEssayFrontmatter,
  type AdminEssayPublicSlugUsage,
  parseAdminEssayEditorInput,
  validateEssayPublicSlug
} from './content-essay-frontmatter';
import type { AdminContentValidationIssue } from './content-entry-contract';
import {
  type AdminContentCreatableCollectionKey
} from './content-collections';
import {
  AdminContentEntryResolutionError,
  getAdminContentEntrySourcePathCandidates,
  loadAdminContentSourceState,
  resolveAdminContentEntryIdFromSourcePath,
  toAdminContentRelativeProjectPath
} from './content-entry-source';
import {
  createAdminContentValidationIssue as createIssue
} from './content-entry-utils';
import { getAdminContentEntryEditHref } from './content-routes';
import {
  buildBitsFrontmatterFromValues,
  buildMaterialsFrontmatterFromValues
} from './content-write-plan';
import {
  assertNoDuplicatePick,
  buildPickMarkdownFile,
  getAvailablePickPath,
  normalizePickCreateInput
} from './picks';
import { patchMarkdownFrontmatter } from './frontmatter';

type AdminContentCreateBaseInput = {
  frontmatter: unknown;
};

type AdminEssayContentCreateInput = AdminContentCreateBaseInput & {
  collection: 'longform';
  entryId: string;
};

type AdminBitsContentCreateInput = AdminContentCreateBaseInput & {
  collection: 'bits';
};

type AdminPicksContentCreateInput = AdminContentCreateBaseInput & {
  collection: 'picks';
};

type AdminMaterialsContentCreateInput = AdminContentCreateBaseInput & {
  collection: 'materials';
};

export type AdminContentCreateInput =
  | AdminEssayContentCreateInput
  | AdminBitsContentCreateInput
  | AdminPicksContentCreateInput
  | AdminMaterialsContentCreateInput;

export type AdminContentCreatePlan = {
  collection: AdminContentCreatableCollectionKey;
  entryId: string;
  publicEntryId: string;
  defaultPublicSlug: string;
  sourcePath: string;
  relativePath: string;
  sourceText: string;
  editHref: string;
  issues: AdminContentValidationIssue[];
};

const EMPTY_MARKDOWN_SOURCE = '---\n---\n\n';
const AUTO_SLUG_HASH_LENGTHS = [4, 5, 6] as const;
const BITS_CREATE_DATETIME_RE = /^(\d{4})-(0[1-9]|1[0-2])-(\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::00)?(Z|[+-](?:[01]\d|2[0-3]):?[0-5]\d)$/;
const MATERIALS_CREATE_TITLE_FALLBACK = 'material';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const pad2 = (value: number): string => String(value).padStart(2, '0');

const createLocalTimestamp = (): { date: string; datePart: string; fileStamp: string; monthDir: string } => {
  const now = new Date();
  const tzMinutes = -now.getTimezoneOffset();
  const sign = tzMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(tzMinutes);
  const tzHours = pad2(Math.floor(abs / 60));
  const tzRemainder = pad2(abs % 60);
  const year = now.getFullYear();
  const month = pad2(now.getMonth() + 1);
  const day = pad2(now.getDate());
  const hour = pad2(now.getHours());
  const minute = pad2(now.getMinutes());
  const second = pad2(now.getSeconds());
  const datePart = `${year}-${month}-${day}`;
  return {
    date: `${datePart}T${hour}:${minute}:${second}${sign}${tzHours}:${tzRemainder}`,
    datePart,
    fileStamp: `${datePart}-${hour}${minute}${second}`,
    monthDir: `${year}${month}`
  };
};

const getDateMonthDir = (dateText: string): string => {
  const match = /^(\d{4})-(\d{2})/.exec(dateText);
  return match ? `${match[1]}${match[2]}` : createLocalTimestamp().monthDir;
};

const withMonthDir = (entryId: string, monthDir: string): string =>
  /^\d{6}\//.test(entryId) ? entryId : `${monthDir}/${entryId}`;

const normalizeCreateEntryId = (entryId: string): string => {
  const withoutExtension = entryId.trim().replace(/\\/g, '/').replace(/\.md$/i, '');
  const normalized = withoutExtension.endsWith('/index')
    ? withoutExtension.slice(0, -'/index'.length)
    : withoutExtension;
  if (!normalized || normalized.startsWith('/') || normalized.includes('//')) {
    throw new AdminContentEntryResolutionError('invalid-entry-id', `不支持的 content entryId：${entryId}`);
  }

  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new AdminContentEntryResolutionError('invalid-entry-id', `不支持的 content entryId：${entryId}`);
  }

  return normalized;
};

const buildEssayCreateValues = (values: AdminEssayEditorValues): AdminEssayEditorValues => ({
  ...values,
  draft: true
});

const buildBitsCreateValues = (date: string): AdminBitsEditorValues => ({
  title: '',
  description: '',
  date,
  tagsText: '',
  draft: true,
  authorName: '',
  authorAvatar: '',
  imagesText: ''
});

const getShortEssayDateSlugPart = (date: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return '000000';

  const year = match[1] ?? '0000';
  const month = match[2] ?? '00';
  const day = match[3] ?? '00';
  return `${year.slice(-2)}${month}${day}`;
};

const buildStableSlugHash = (
  parts: readonly string[],
  length: number
): string => {
  const digest = createHash('sha1').update(parts.join('\n')).digest('hex').slice(0, 12);
  return Number.parseInt(digest, 16).toString(36).padStart(length, '0').slice(0, length);
};

const isEssayPublicSlugAvailable = async (
  publicEntryId: string,
  slugUsage: AdminEssayPublicSlugUsage,
  slug?: string
): Promise<boolean> => {
  const frontmatter: Pick<AdminEssayFrontmatter, 'slug'> = slug === undefined ? {} : { slug };
  return (await validateEssayPublicSlug({ publicEntryId }, frontmatter, { slugUsage })).length === 0;
};

const buildFallbackEssayPublicSlug = (
  frontmatter: AdminEssayFrontmatter,
  entryId: string,
  hashLength: number
): string =>
  `essay-${getShortEssayDateSlugPart(frontmatter.date)}-${buildStableSlugHash(
    [frontmatter.title, frontmatter.date, entryId],
    hashLength
  )}`;

const resolveEssayCreateFrontmatterSlug = async ({
  entryId,
  publicEntryId,
  frontmatter,
  slugUsage
}: {
  entryId: string;
  publicEntryId: string;
  frontmatter: AdminEssayFrontmatter;
  slugUsage: AdminEssayPublicSlugUsage;
}): Promise<AdminEssayFrontmatter> => {
  if (frontmatter.slug?.trim()) return frontmatter;
  if (await isEssayPublicSlugAvailable(publicEntryId, slugUsage)) return frontmatter;

  const titleSlug = flattenEntryIdToSlug(contentSourceEntryIdToPublicEntryId(frontmatter.title));
  if (titleSlug && await isEssayPublicSlugAvailable(publicEntryId, slugUsage, titleSlug)) {
    return { ...frontmatter, slug: titleSlug };
  }

  for (const hashLength of AUTO_SLUG_HASH_LENGTHS) {
    const slug = buildFallbackEssayPublicSlug(frontmatter, entryId, hashLength);
    if (await isEssayPublicSlugAvailable(publicEntryId, slugUsage, slug)) {
      return { ...frontmatter, slug };
    }
  }

  return {
    ...frontmatter,
    slug: buildFallbackEssayPublicSlug(
      frontmatter,
      entryId,
      AUTO_SLUG_HASH_LENGTHS.at(-1) ?? 6
    )
  };
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const findExistingFile = async (filePaths: readonly string[]): Promise<string | null> => {
  for (const filePath of filePaths) {
    if (await fileExists(filePath)) return filePath;
  }
  return null;
};

const isValidCalendarDate = (year: string, month: string, day: string): boolean => {
  const normalized = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return normalized.getUTCFullYear() === Number(year)
    && normalized.getUTCMonth() + 1 === Number(month)
    && normalized.getUTCDate() === Number(day);
};

const normalizeBitsCreateOffset = (offset: string): string =>
  offset === 'Z' || offset.includes(':') ? offset : `${offset.slice(0, 3)}:${offset.slice(3)}`;

const parseBitsCreateDate = (
  frontmatter: unknown
): { entryId?: string; date?: string; issues: AdminContentValidationIssue[] } => {
  if (!isRecord(frontmatter)) {
    return { issues: [createIssue('frontmatter', 'frontmatter 必须是对象')] };
  }

  const input = typeof frontmatter.date === 'string' ? frontmatter.date.trim() : '';
  if (!input) {
    return { issues: [createIssue('date', 'bits.date 不能为空')] };
  }

  const match = BITS_CREATE_DATETIME_RE.exec(input);
  if (!match) {
    return { issues: [createIssue('date', 'bits.date 必须是带时区的 YYYY-MM-DDTHH:mm:ss±HH:mm 格式')] };
  }

  const [, year, month, day, hour, minute, offset] = match;
  if (!year || !month || !day || !hour || !minute || !offset || !isValidCalendarDate(year, month, day)) {
    return { issues: [createIssue('date', 'bits.date 不是合法日期时间')] };
  }

  return {
    entryId: `${year}${month}/bits-${year}-${month}-${day}-${hour}${minute}`,
    date: `${year}-${month}-${day}T${hour}:${minute}:00${normalizeBitsCreateOffset(offset)}`,
    issues: []
  };
};

const normalizeCreateText = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';


const normalizeMaterialsFilenamePart = (value: string): string => {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || MATERIALS_CREATE_TITLE_FALLBACK;
};

const getPicksCreateValues = (frontmatter: unknown): Record<string, unknown> => {
  if (!isRecord(frontmatter)) return {};
  return {
    title: frontmatter.title,
    status: frontmatter.status,
    authors: typeof frontmatter.authorsText === 'string'
      ? frontmatter.authorsText
      : frontmatter.authors,
    reason: typeof frontmatter.reason === 'string'
      ? frontmatter.reason
      : typeof frontmatter.body === 'string'
        ? frontmatter.body
        : '',
    tags: typeof frontmatter.tagsText === 'string'
      ? frontmatter.tagsText
      : frontmatter.tags
  };
};

const getMaterialsCreateValues = (frontmatter: unknown, timestamp: ReturnType<typeof createLocalTimestamp>): AdminMaterialsEditorValues => {
  const input = isRecord(frontmatter) ? frontmatter : {};
  return {
    title: normalizeCreateText(input.title),
    href: normalizeCreateText(input.href),
    date: timestamp.date,
    label: normalizeCreateText(input.label),
    description: normalizeCreateText(input.description)
  };
};

const assertUnsupportedCreateCollection = (input: never): never => {
  throw new AdminContentEntryResolutionError('invalid-entry-id', `当前 collection 暂未实现新增：${String(input)}`);
};

const buildCreatePlanIdentity = (
  collection: AdminContentCreatableCollectionKey,
  entryId: string,
  sourcePath: string
): Pick<AdminContentCreatePlan, 'collection' | 'entryId' | 'publicEntryId' | 'defaultPublicSlug' | 'sourcePath' | 'relativePath' | 'editHref'> => {
  const publicEntryId = contentSourceEntryIdToPublicEntryId(entryId) || entryId;
  return {
    collection,
    entryId,
    publicEntryId,
    defaultPublicSlug: flattenEntryIdToSlug(publicEntryId),
    sourcePath,
    relativePath: toAdminContentRelativeProjectPath(sourcePath),
    editHref: getAdminContentEntryEditHref(collection, entryId)
  };
};

const resolveCreatePlanIdentity = (
  collection: AdminContentCreatableCollectionKey,
  entryId: string
): ReturnType<typeof buildCreatePlanIdentity> & { sourcePathCandidates: string[] } => {
  const sourcePathCandidates = getAdminContentEntrySourcePathCandidates(collection, entryId);
  const [sourcePath] = sourcePathCandidates;
  if (!sourcePath) {
    throw new AdminContentEntryResolutionError('source-not-found', `未找到 content 源文件候选：${collection}/${entryId}`);
  }

  return {
    ...buildCreatePlanIdentity(collection, entryId, sourcePath),
    sourcePathCandidates
  };
};

const buildMarkdownSourceFromFrontmatter = (frontmatter: Record<string, unknown>): string =>
  patchMarkdownFrontmatter(
    EMPTY_MARKDOWN_SOURCE,
    Object.entries(frontmatter).map(([key, value]) => ({
      path: [key],
      value,
      action: 'set' as const
    }))
  );

const createIssuesFromErrors = (
  errors: readonly string[],
  pathResolver: (message: string) => string = () => 'frontmatter'
): AdminContentValidationIssue[] =>
  errors.map((message) => createIssue(pathResolver(message), message));

const getPicksCreateIssuePath = (message: string): string => {
  if (message.includes('标题')) return 'title';
  if (message.includes('推荐理由')) return 'body';
  if (message.includes('作者')) return 'authorsText';
  if (message.includes('标签')) return 'tagsText';
  return 'frontmatter';
};

const buildEmptyCreatePlanWithIssues = (
  collection: AdminContentCreatableCollectionKey,
  issues: AdminContentValidationIssue[]
): AdminContentCreatePlan => ({
  collection,
  entryId: '',
  publicEntryId: '',
  defaultPublicSlug: '',
  sourcePath: '',
  relativePath: '',
  sourceText: '',
  editHref: '',
  issues
});

const getEssayCreateFallbackEntryId = (entryId: string, frontmatter: unknown): string => {
  const rawDate = isRecord(frontmatter) && typeof frontmatter.date === 'string'
    ? frontmatter.date.trim()
    : '';
  return withMonthDir(entryId, rawDate ? getDateMonthDir(rawDate) : createLocalTimestamp().monthDir);
};

const buildEssayContentCreatePlan = async (
  input: AdminEssayContentCreateInput
): Promise<AdminContentCreatePlan> => {
  const collection = input.collection;
  const rawEntryId = normalizeCreateEntryId(input.entryId);
  const parsed = parseAdminEssayEditorInput(input.frontmatter);

  if (!parsed.values) {
    const identity = resolveCreatePlanIdentity(collection, getEssayCreateFallbackEntryId(rawEntryId, input.frontmatter));
    return {
      ...identity,
      sourceText: '',
      issues: parsed.issues
    };
  }

  const next = buildEssayFrontmatterFromValues(buildEssayCreateValues(parsed.values));
  if (!next.frontmatter) {
    const identity = resolveCreatePlanIdentity(collection, getEssayCreateFallbackEntryId(rawEntryId, input.frontmatter));
    return {
      ...identity,
      sourceText: '',
      issues: next.issues
    };
  }

  const entryId = withMonthDir(rawEntryId, getDateMonthDir(next.frontmatter.date));
  const identity = resolveCreatePlanIdentity(collection, entryId);

  const existingSourcePath = await findExistingFile(identity.sourcePathCandidates);
  if (existingSourcePath) {
    return {
      ...identity,
      sourceText: '',
      issues: [createIssue('entryId', `源文件已存在：${toAdminContentRelativeProjectPath(existingSourcePath)}`)]
    };
  }

  const slugUsage = await loadEssayPublicSlugUsage();
  const preferredPublicEntryId = contentSourceEntryIdToPublicEntryId(rawEntryId) || rawEntryId;
  const preferredPublicSlug = flattenEntryIdToSlug(preferredPublicEntryId);
  const frontmatterSeed = entryId !== rawEntryId
    && !next.frontmatter.slug?.trim()
    && preferredPublicSlug
    && await isEssayPublicSlugAvailable(identity.publicEntryId, slugUsage, preferredPublicSlug)
      ? { ...next.frontmatter, slug: preferredPublicSlug }
      : next.frontmatter;
  const frontmatter = await resolveEssayCreateFrontmatterSlug({
    entryId,
    publicEntryId: identity.publicEntryId,
    frontmatter: frontmatterSeed,
    slugUsage
  });

  const slugIssues = await validateEssayPublicSlug({ publicEntryId: identity.publicEntryId }, frontmatter, { slugUsage });
  if (slugIssues.length > 0) {
    return {
      ...identity,
      sourceText: '',
      issues: slugIssues
    };
  }

  return {
    ...identity,
    sourceText: buildMarkdownSourceFromFrontmatter(frontmatter),
    issues: []
  };
};

const buildBitsContentCreatePlan = async (
  input: AdminBitsContentCreateInput
): Promise<AdminContentCreatePlan> => {
  const collection = input.collection;
  const parsedDate = parseBitsCreateDate(input.frontmatter);
  if (!parsedDate.entryId || !parsedDate.date) {
    return buildEmptyCreatePlanWithIssues(collection, parsedDate.issues);
  }

  const identity = resolveCreatePlanIdentity(collection, parsedDate.entryId);
  const existingSourcePath = await findExistingFile(identity.sourcePathCandidates);
  if (existingSourcePath) {
    return {
      ...identity,
      sourceText: '',
      issues: [createIssue('entryId', `源文件已存在：${toAdminContentRelativeProjectPath(existingSourcePath)}`)]
    };
  }

  const next = buildBitsFrontmatterFromValues(buildBitsCreateValues(parsedDate.date));
  if (!next.frontmatter) {
    return {
      ...identity,
      sourceText: '',
      issues: next.issues
    };
  }

  return {
    ...identity,
    sourceText: buildMarkdownSourceFromFrontmatter(next.frontmatter),
    issues: []
  };
};

const buildPicksContentCreatePlan = async (
  input: AdminPicksContentCreateInput
): Promise<AdminContentCreatePlan> => {
  const collection = input.collection;
  const normalized = normalizePickCreateInput(getPicksCreateValues(input.frontmatter));
  if (!normalized.item) {
    return buildEmptyCreatePlanWithIssues(collection, createIssuesFromErrors(normalized.errors, getPicksCreateIssuePath));
  }

  try {
    await assertNoDuplicatePick(normalized.item);
  } catch (error) {
    const message = error instanceof Error ? error.message : '拾选条目已存在';
    return buildEmptyCreatePlanWithIssues(collection, [createIssue('title', message)]);
  }

  const { filePath: sourcePath } = await getAvailablePickPath(normalized.item);
  const entryId = resolveAdminContentEntryIdFromSourcePath(collection, sourcePath);
  const identity = buildCreatePlanIdentity(collection, entryId, sourcePath);

  return {
    ...identity,
    sourceText: buildPickMarkdownFile(normalized.item),
    issues: []
  };
};

const getAvailableMaterialsSourcePath = async (
  title: string,
  timestamp: ReturnType<typeof createLocalTimestamp>
): Promise<{ entryId: string; sourcePath: string }> => {
  const filenameBase = `${normalizeMaterialsFilenamePart(title)}-${timestamp.fileStamp}`;

  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? '' : `-${index + 1}`;
    const entryId = `${timestamp.monthDir}/${filenameBase}${suffix}`;
    const [sourcePath] = getAdminContentEntrySourcePathCandidates('materials', entryId);
    if (!sourcePath) {
      throw new AdminContentEntryResolutionError('source-not-found', `未找到 content 源文件候选：materials/${entryId}`);
    }
    if (!(await fileExists(sourcePath))) {
      return { entryId, sourcePath };
    }
  }

  throw new Error('Unable to create a unique materials filename');
};

const buildMaterialsContentCreatePlan = async (
  input: AdminMaterialsContentCreateInput
): Promise<AdminContentCreatePlan> => {
  const collection = input.collection;
  const timestamp = createLocalTimestamp();
  const next = buildMaterialsFrontmatterFromValues(getMaterialsCreateValues(input.frontmatter, timestamp));
  if (!next.frontmatter) {
    return buildEmptyCreatePlanWithIssues(collection, next.issues);
  }

  const { entryId, sourcePath } = await getAvailableMaterialsSourcePath(next.frontmatter.title, timestamp);
  const identity = buildCreatePlanIdentity(collection, entryId, sourcePath);

  return {
    ...identity,
    sourceText: buildMarkdownSourceFromFrontmatter(next.frontmatter),
    issues: []
  };
};

export const buildAdminContentCreatePlan = async (
  input: AdminContentCreateInput
): Promise<AdminContentCreatePlan> => {
  switch (input.collection) {
    case 'longform':
      return buildEssayContentCreatePlan(input);
    case 'bits':
      return buildBitsContentCreatePlan(input);
    case 'picks':
      return buildPicksContentCreatePlan(input);
    case 'materials':
      return buildMaterialsContentCreatePlan(input);
    default:
      return assertUnsupportedCreateCollection(input);
  }
};
export const ensureAdminContentCreateParentDirectory = async (
  plan: Pick<AdminContentCreatePlan, 'sourcePath'>
): Promise<void> => {
  await mkdir(path.dirname(plan.sourcePath), { recursive: true });
};

export const readAdminContentCreatedEditorPayload = async (
  plan: Pick<AdminContentCreatePlan, 'collection' | 'entryId' | 'editHref'>
) => ({
  editHref: plan.editHref,
  payload: buildAdminContentEntryEditorPayloadFromState(
    await loadAdminContentSourceState(plan.collection, plan.entryId)
  )
});
