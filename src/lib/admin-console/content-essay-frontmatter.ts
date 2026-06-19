import {
  parseEssayDateInput,
  parseEssayPublishedAtInput
} from '../../utils/date-only';
import { normalizeBitsAvatarPath, toSafeHttpUrl } from '../../utils/format';
import {
  ESSAY_PUBLIC_SLUG_RE,
  RESERVED_ESSAY_SLUGS,
  contentSourceEntryIdToPublicEntryId,
  flattenEntryIdToSlug
} from '../../utils/slug-rules';
import type { AdminEssayEditorValues } from './content-editor-payload';
import type { AdminContentValidationIssue } from './content-entry-contract';
import {
  listAdminCollectionSourceFiles,
  readAdminSourceFrontmatterRecord,
  resolveAdminContentEntryIdFromSourcePath
} from './content-entry-source';
import {
  createAdminContentValidationIssue as createIssue,
  hasOwn,
  isRecord,
  normalizeOptionalText
} from './content-entry-utils';

export type AdminEssayFrontmatter = {
  title: string;
  description?: string;
  date: string;
  publishedAt?: string;
  updatedAt?: string;
  tags: string[];
  draft: boolean;
  archive: boolean;
  slug?: string;
  cover?: string;
  badge?: string;
  author?: {
    name?: string;
    avatar?: string;
    showAvatar?: boolean;
  };
  authors?: Array<{
    name?: string;
    avatar?: string;
    showAvatar?: boolean;
  }>;
  translation?: {
    translator?: string;
    avatar?: string;
    showAvatar?: boolean;
    source?: string;
    sourceUrl?: string;
  };
};

export type AdminEssayPublicSlugUsage = ReadonlyMap<string, readonly string[]>;

export type AdminEssayOptionalInputMode = 'missing' | 'present';

const getRequiredStringField = (
  input: Record<string, unknown>,
  field: string,
  issues: AdminContentValidationIssue[]
): string => {
  const value = input[field];
  if (typeof value === 'string') return value;
  issues.push(createIssue(field, `frontmatter.${field} 必须是字符串`));
  return '';
};

const getRequiredBooleanField = (
  input: Record<string, unknown>,
  field: string,
  issues: AdminContentValidationIssue[]
): boolean => {
  const value = input[field];
  if (typeof value === 'boolean') return value;
  issues.push(createIssue(field, `frontmatter.${field} 必须是布尔值`));
  return false;
};

const getOptionalStringField = (
  input: Record<string, unknown>,
  field: string
): string => {
  const value = input[field];
  return typeof value === 'string' ? value : '';
};

const getOptionalBooleanField = (
  input: Record<string, unknown>,
  field: string,
  fallback: boolean
): boolean => {
  const value = input[field];
  return typeof value === 'boolean' ? value : fallback;
};

export const parseAdminEssayEditorInput = (
  input: unknown
): {
  values?: AdminEssayEditorValues;
  publishedAtInputMode: AdminEssayOptionalInputMode;
  updatedAtInputMode: AdminEssayOptionalInputMode;
  issues: AdminContentValidationIssue[];
} => {
  if (!isRecord(input)) {
    return {
      publishedAtInputMode: 'missing',
      updatedAtInputMode: 'missing',
      issues: [createIssue('frontmatter', 'frontmatter 必须是对象')]
    };
  }

  const issues: AdminContentValidationIssue[] = [];
  const rawPublishedAtInput = input.publishedAt;
  const hasPublishedAtInput = hasOwn(input, 'publishedAt')
    && typeof rawPublishedAtInput === 'string';
  const rawUpdatedAtInput = input.updatedAt;
  const hasUpdatedAtInput = hasOwn(input, 'updatedAt')
    && typeof rawUpdatedAtInput === 'string';
  const values: AdminEssayEditorValues = {
    title: getRequiredStringField(input, 'title', issues),
    description: getRequiredStringField(input, 'description', issues),
    date: getRequiredStringField(input, 'date', issues),
    publishedAt: hasPublishedAtInput ? rawPublishedAtInput : '',
    updatedAt: hasUpdatedAtInput ? rawUpdatedAtInput : '',
    tagsText: getRequiredStringField(input, 'tagsText', issues),
    draft: getRequiredBooleanField(input, 'draft', issues),
    archive: getRequiredBooleanField(input, 'archive', issues),
    slug: getRequiredStringField(input, 'slug', issues),
    cover: getRequiredStringField(input, 'cover', issues),
    badge: getRequiredStringField(input, 'badge', issues),
    authorsText: getOptionalStringField(input, 'authorsText'),
    authorName: getOptionalStringField(input, 'authorName'),
    authorAvatar: getOptionalStringField(input, 'authorAvatar'),
    authorShowAvatar: getOptionalBooleanField(input, 'authorShowAvatar', true),
    translationTranslator: getOptionalStringField(input, 'translationTranslator'),
    translationAvatar: getOptionalStringField(input, 'translationAvatar'),
    translationShowAvatar: getOptionalBooleanField(input, 'translationShowAvatar', true),
    translationSource: getOptionalStringField(input, 'translationSource'),
    translationSourceUrl: getOptionalStringField(input, 'translationSourceUrl')
  };

  return issues.length > 0
    ? {
        publishedAtInputMode: hasPublishedAtInput ? 'present' : 'missing',
        updatedAtInputMode: hasUpdatedAtInput ? 'present' : 'missing',
        issues
      }
    : {
        values,
        publishedAtInputMode: hasPublishedAtInput ? 'present' : 'missing',
        updatedAtInputMode: hasUpdatedAtInput ? 'present' : 'missing',
        issues
      };
};

export const parseTagsText = (value: string): string[] =>
  value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

const splitAuthorInput = (value: string): string[] =>
  Array.from(new Set(value.split(/\r?\n|[,，、；;]+/).map((item) => item.trim()).filter(Boolean)));

const resolveDefaultPublicEntryId = (sourceEntryId: string): string => {
  const publicEntryId = contentSourceEntryIdToPublicEntryId(sourceEntryId);
  return publicEntryId || sourceEntryId;
};

export const resolveEssayPublicSlug = (publicEntryId: string, explicitSlug?: string): string =>
  explicitSlug && explicitSlug.trim().length > 0
    ? explicitSlug.trim()
    : flattenEntryIdToSlug(publicEntryId);

const addEssayPublicSlugUsage = (
  usage: Map<string, string[]>,
  publicSlug: string,
  entryId: string
): void => {
  const entryIds = usage.get(publicSlug);
  if (entryIds) {
    entryIds.push(entryId);
    return;
  }
  usage.set(publicSlug, [entryId]);
};

const findEssayPublicSlugCollisionEntryId = (
  slugUsage: AdminEssayPublicSlugUsage,
  publicSlug: string,
  currentEntryId?: string
): string | null =>
  slugUsage.get(publicSlug)?.find((entryId) => entryId !== currentEntryId) ?? null;

export const loadEssayPublicSlugUsage = async (): Promise<AdminEssayPublicSlugUsage> => {
  const usage = new Map<string, string[]>();
  const essayFiles = await listAdminCollectionSourceFiles('longform');
  for (const filePath of essayFiles) {
    const candidateEntryId = resolveAdminContentEntryIdFromSourcePath('longform', filePath);
    const frontmatterRecord = await readAdminSourceFrontmatterRecord(filePath);
    const candidatePublicEntryId = resolveDefaultPublicEntryId(candidateEntryId);
    const candidateSlug = resolveEssayPublicSlug(candidatePublicEntryId, normalizeOptionalText(frontmatterRecord.slug));
    addEssayPublicSlugUsage(usage, candidateSlug, candidateEntryId);
  }
  return usage;
};

export const validateEssayPublicSlug = async (
  state: {
    entryId?: string;
    publicEntryId: string;
  },
  frontmatter: Pick<AdminEssayFrontmatter, 'slug'>,
  options: {
    slugUsage?: AdminEssayPublicSlugUsage;
  } = {}
): Promise<AdminContentValidationIssue[]> => {
  const issues: AdminContentValidationIssue[] = [];
  const publicSlug = resolveEssayPublicSlug(state.publicEntryId, frontmatter.slug);

  if (!ESSAY_PUBLIC_SLUG_RE.test(publicSlug)) {
    issues.push(
      createIssue(
        'slug',
        frontmatter.slug
          ? 'longform.slug 必须是小写 kebab-case'
          : '当前条目路径拍平后的公开 slug 不合法，请设置合法 slug 或调整文件路径'
      )
    );
  }

  if (RESERVED_ESSAY_SLUGS.has(publicSlug)) {
    issues.push(
      createIssue(
        'slug',
        `公开 slug "${publicSlug}" 与 /archive 或 /longform 下的保留路由冲突，请修改 slug`
      )
    );
  }

  if (issues.length > 0) {
    return issues;
  }

  try {
    const slugUsage = options.slugUsage ?? await loadEssayPublicSlugUsage();
    const collisionEntryId = findEssayPublicSlugCollisionEntryId(slugUsage, publicSlug, state.entryId);
    if (collisionEntryId) {
      issues.push(
        createIssue(
          'slug',
          `公开 slug "${publicSlug}" 已被其他 longform 占用：${collisionEntryId}`
        )
      );
      return issues;
    }
  } catch (error) {
    issues.push(
      createIssue(
        'slug',
        `无法完成 longform.slug 唯一性校验：${error instanceof Error ? error.message : 'unknown error'}`
      )
    );
  }

  return issues;
};

export const buildEssayFrontmatterFromValues = (
  values: AdminEssayEditorValues,
  options: {
    preservedPublishedAt?: string;
    preservedUpdatedAt?: string;
  } = {}
): { frontmatter?: AdminEssayFrontmatter; issues: AdminContentValidationIssue[] } => {
  const issues: AdminContentValidationIssue[] = [];
  const title = values.title.trim();
  if (!title) {
    issues.push(createIssue('title', 'title 不能为空'));
  }

  const dateResult = parseEssayDateInput(values.date);
  if (!dateResult) {
    issues.push(createIssue('date', 'longform.date 必须是 YYYY-MM-DD 或带时区的 ISO 8601 日期时间'));
  }

  const explicitPublishedAt = values.publishedAt.trim();
  const hasExplicitPublishedAt = explicitPublishedAt.length > 0;
  const publishedAt = hasExplicitPublishedAt
    ? parseEssayPublishedAtInput(explicitPublishedAt)
    : dateResult?.publishedAt;

  if (hasExplicitPublishedAt && !publishedAt) {
    issues.push(createIssue('publishedAt', 'longform.publishedAt 必须是带时区的 ISO 8601 日期时间'));
  }

  const explicitUpdatedAt = values.updatedAt.trim();
  const hasExplicitUpdatedAt = explicitUpdatedAt.length > 0;
  const updatedAtResult = hasExplicitUpdatedAt
    ? parseEssayDateInput(explicitUpdatedAt)
    : null;

  if (hasExplicitUpdatedAt && !updatedAtResult) {
    issues.push(createIssue('updatedAt', 'longform.updatedAt 必须是 YYYY-MM-DD 或带时区的 ISO 8601 日期时间'));
  }

  if (!dateResult || issues.length > 0) {
    return { issues };
  }

  const slug = values.slug.trim();
  const authorNames = splitAuthorInput(values.authorsText.trim() || values.authorName.trim());
  const authorAvatarRaw = values.authorAvatar.trim();
  const authorAvatar = authorAvatarRaw ? normalizeBitsAvatarPath(authorAvatarRaw) : '';
  const translationAvatarRaw = values.translationAvatar.trim();
  const translationAvatar = translationAvatarRaw ? normalizeBitsAvatarPath(translationAvatarRaw) : '';
  const translationSourceUrlRaw = values.translationSourceUrl.trim();
  const translationSourceUrl = translationSourceUrlRaw ? toSafeHttpUrl(translationSourceUrlRaw) : '';

  if (authorAvatarRaw && !authorAvatar) {
    issues.push(createIssue('authorAvatar', 'author.avatar 只允许相对图片路径（例如 author/avatar.webp）'));
  }
  if (translationAvatarRaw && !translationAvatar) {
    issues.push(createIssue('translationAvatar', 'translation.avatar 只允许相对图片路径（例如 author/avatar.webp）'));
  }
  if (translationSourceUrlRaw && !translationSourceUrl) {
    issues.push(createIssue('translationSourceUrl', 'translation.sourceUrl 必须是 http(s) URL'));
  }
  if (issues.length > 0) {
    return { issues };
  }

  const preservedPublishedAt = normalizeOptionalText(options.preservedPublishedAt);
  const preservedUpdatedAt = normalizeOptionalText(options.preservedUpdatedAt);
  const primaryAuthorName = authorNames.length === 1 ? authorNames[0] : undefined;
  const publishedAtText = hasExplicitPublishedAt
    ? explicitPublishedAt
    : dateResult.publishedAtText || preservedPublishedAt;
  const updatedAtText = hasExplicitUpdatedAt
    ? updatedAtResult?.dateText
    : preservedUpdatedAt;
  const publishedAtDateResult = publishedAtText ? parseEssayDateInput(publishedAtText) : null;
  const date = publishedAtDateResult?.dateText ?? dateResult.dateText;
  const effectiveDateResult = publishedAtDateResult ?? dateResult;
  const finalUpdatedAtResult = hasExplicitUpdatedAt
    ? updatedAtResult
    : updatedAtText
      ? parseEssayDateInput(updatedAtText)
      : null;

  if (finalUpdatedAtResult && finalUpdatedAtResult.date.valueOf() < effectiveDateResult.date.valueOf()) {
    issues.push(createIssue('updatedAt', 'longform.updatedAt 不能早于 longform.date'));
    return { issues };
  }

  return {
    issues,
    frontmatter: {
      title,
      ...(values.description.trim() ? { description: values.description.trim() } : {}),
      date,
      ...(publishedAtText ? { publishedAt: publishedAtText } : {}),
      ...(updatedAtText ? { updatedAt: updatedAtText } : {}),
      tags: parseTagsText(values.tagsText),
      draft: values.draft === true,
      archive: values.archive !== false,
      ...(slug ? { slug } : {}),
      ...(values.cover.trim() ? { cover: values.cover.trim() } : {}),
      ...(values.badge.trim() ? { badge: values.badge.trim() } : {}),
      ...(primaryAuthorName
        ? {
            author: {
              name: primaryAuthorName,
              ...(authorAvatar ? { avatar: authorAvatar } : {}),
              ...(values.authorShowAvatar ? {} : { showAvatar: false })
            }
          }
        : {}),
      ...(authorNames.length > 1
        ? {
            authors: authorNames.map((name: string, index: number) => ({
              name,
              ...(index === 0 && authorAvatar ? { avatar: authorAvatar } : {}),
              ...(values.authorShowAvatar ? {} : { showAvatar: false })
            }))
          }
        : {}),
      ...((values.translationTranslator.trim()
        || translationAvatar
        || values.translationSource.trim()
        || translationSourceUrl
        || !values.translationShowAvatar)
        ? {
            translation: {
              ...(values.translationTranslator.trim() ? { translator: values.translationTranslator.trim() } : {}),
              ...(translationAvatar ? { avatar: translationAvatar } : {}),
              ...(values.translationShowAvatar ? {} : { showAvatar: false }),
              ...(values.translationSource.trim() ? { source: values.translationSource.trim() } : {}),
              ...(translationSourceUrl ? { sourceUrl: translationSourceUrl } : {})
            }
          }
        : {})
    }
  };
};



