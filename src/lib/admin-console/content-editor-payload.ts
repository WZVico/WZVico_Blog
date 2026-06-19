import { parseEssayDateInput } from '../../utils/date-only';
import {
  buildAdminAboutEditorPayload,
  type AdminAboutEditorPayload,
  type AdminAboutEditorValues
} from './content-about-contract';
import {
  getAdminContentCollectionCapability,
  type AdminContentEntryWriteCollectionKey
} from './content-collections';
import {
  AdminContentEntryResolutionError,
  getAdminContentReadOnlyReason,
  loadAdminContentSourceState,
  type AdminContentSourceState
} from './content-entry-source';
import { isRecord, normalizeOptionalText } from './content-entry-utils';

export type AdminEssayEditorValues = {
  title: string;
  description: string;
  date: string;
  publishedAt: string;
  updatedAt: string;
  tagsText: string;
  draft: boolean;
  archive: boolean;
  slug: string;
  cover: string;
  badge: string;
  authorsText: string;
  authorName: string;
  authorAvatar: string;
  authorShowAvatar: boolean;
  translationTranslator: string;
  translationAvatar: string;
  translationShowAvatar: boolean;
  translationSource: string;
  translationSourceUrl: string;
};

export type AdminBitsEditorValues = {
  title: string;
  description: string;
  date: string;
  tagsText: string;
  draft: boolean;
  authorName: string;
  authorAvatar: string;
  imagesText: string;
};

export type AdminMemoEditorValues = {
  title: string;
  subtitle: string;
  date: string;
  draft: boolean;
  slug: string;
};

export type AdminPicksEditorValues = {
  title: string;
  date: string;
  year: string;
  status: 'shared' | 'planned';
  authorsText: string;
  tagsText: string;
  draft: boolean;
  slug: string;
};

export type AdminMaterialsEditorValues = {
  title: string;
  href: string;
  date: string;
  label: string;
  description: string;
};

export type AdminContentEditorValues =
  | AdminEssayEditorValues
  | AdminBitsEditorValues
  | AdminMemoEditorValues
  | AdminPicksEditorValues
  | AdminMaterialsEditorValues
  | AdminAboutEditorValues;

export type AdminContentWorkspaceEditorValues =
  | AdminEssayEditorValues
  | AdminBitsEditorValues
  | AdminMemoEditorValues
  | AdminPicksEditorValues
  | AdminMaterialsEditorValues
  | AdminAboutEditorValues;

export type AdminEssayEditorPayload = {
  collection: 'longform';
  entryId: string;
  publicEntryId: string;
  defaultPublicSlug: string;
  revision: string;
  relativePath: string;
  writable: true;
  readonlyReason: null;
  bodyText: string;
  values: AdminEssayEditorValues;
};

export type AdminBitsEditorPayload = {
  collection: 'bits';
  entryId: string;
  publicEntryId: string;
  defaultPublicSlug: string;
  revision: string;
  relativePath: string;
  writable: true;
  readonlyReason: null;
  bodyText: string;
  values: AdminBitsEditorValues;
};

export type AdminPicksEditorPayload = {
  collection: 'picks';
  entryId: string;
  publicEntryId: string;
  defaultPublicSlug: string;
  revision: string;
  relativePath: string;
  writable: true;
  readonlyReason: null;
  bodyText: string;
  values: AdminPicksEditorValues;
};

export type AdminMaterialsEditorPayload = {
  collection: 'materials';
  entryId: string;
  publicEntryId: string;
  defaultPublicSlug: string;
  revision: string;
  relativePath: string;
  writable: true;
  readonlyReason: null;
  bodyText: string;
  values: AdminMaterialsEditorValues;
};

export type AdminMemoEditorPayload = {
  collection: 'memo';
  entryId: string;
  publicEntryId: string;
  defaultPublicSlug: string;
  revision: string;
  relativePath: string;
  writable: true;
  readonlyReason: null;
  bodyText: string;
  values: AdminMemoEditorValues;
};

export type AdminContentEditorPayload =
  | AdminEssayEditorPayload
  | AdminBitsEditorPayload
  | AdminPicksEditorPayload
  | AdminMaterialsEditorPayload
  | AdminMemoEditorPayload
  | AdminAboutEditorPayload;

export type AdminContentWorkspaceEditorPayload =
  | AdminEssayEditorPayload
  | AdminBitsEditorPayload
  | AdminPicksEditorPayload
  | AdminMaterialsEditorPayload
  | AdminMemoEditorPayload
  | AdminAboutEditorPayload;

const getStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
    : [];

const getScalarText = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
};

const getDateString = (frontmatter: Record<string, unknown>, key: string, fallback: string): string => {
  const normalized = getScalarText(frontmatter[key]);
  return normalized || fallback;
};

const getEssayDateText = (value: unknown): string => {
  const parsed = parseEssayDateInput(value);
  return parsed?.dateText ?? normalizeOptionalText(value);
};

const toEssayEditorValues = (state: AdminContentSourceState): AdminEssayEditorValues => {
  const frontmatter = state.rawFrontmatter;
  const rawDate = getDateString(frontmatter, 'date', '');
  const rawPublishedAt = normalizeOptionalText(frontmatter.publishedAt);
  const dateResult = parseEssayDateInput(rawDate);
  const author = isRecord(frontmatter.author) ? frontmatter.author : null;
  const authors = Array.isArray(frontmatter.authors) ? frontmatter.authors.filter(isRecord) : [];
  const firstAuthor = authors[0] ?? author;
  const translation = isRecord(frontmatter.translation) ? frontmatter.translation : null;

  return {
    title: normalizeOptionalText(frontmatter.title),
    description: normalizeOptionalText(frontmatter.description),
    date: dateResult?.dateText ?? rawDate,
    publishedAt: rawPublishedAt || dateResult?.publishedAtText || '',
    updatedAt: getEssayDateText(frontmatter.updatedAt),
    tagsText: getStringArray(frontmatter.tags).join('\n'),
    draft: frontmatter.draft === true,
    archive: frontmatter.archive !== false,
    slug: normalizeOptionalText(frontmatter.slug),
    cover: normalizeOptionalText(frontmatter.cover),
    badge: normalizeOptionalText(frontmatter.badge),
    authorsText: (authors.length > 0 ? authors : firstAuthor ? [firstAuthor] : [])
      .map((item) => normalizeOptionalText(item.name))
      .filter(Boolean)
      .join('\n'),
    authorName: normalizeOptionalText(firstAuthor?.name),
    authorAvatar: normalizeOptionalText(firstAuthor?.avatar),
    authorShowAvatar: firstAuthor?.showAvatar !== false,
    translationTranslator: normalizeOptionalText(translation?.translator),
    translationAvatar: normalizeOptionalText(translation?.avatar),
    translationShowAvatar: translation?.showAvatar !== false,
    translationSource: normalizeOptionalText(translation?.source),
    translationSourceUrl: normalizeOptionalText(translation?.sourceUrl)
  };
};

const toBitsEditorValues = (state: AdminContentSourceState): AdminBitsEditorValues => {
  const frontmatter = state.rawFrontmatter;
  const author = isRecord(frontmatter.author) ? frontmatter.author : null;

  return {
    title: normalizeOptionalText(frontmatter.title),
    description: normalizeOptionalText(frontmatter.description),
    date: getDateString(frontmatter, 'date', ''),
    tagsText: getStringArray(frontmatter.tags).join('\n'),
    draft: frontmatter.draft === true,
    authorName: normalizeOptionalText(author?.name),
    authorAvatar: normalizeOptionalText(author?.avatar),
    imagesText: Array.isArray(frontmatter.images) ? JSON.stringify(frontmatter.images, null, 2) : ''
  };
};


const toPicksEditorValues = (state: AdminContentSourceState): AdminPicksEditorValues => {
  const frontmatter = state.rawFrontmatter;
  return {
    title: normalizeOptionalText(frontmatter.title),
    date: getDateString(frontmatter, 'date', ''),
    year: getScalarText(frontmatter.year),
    status: normalizeOptionalText(frontmatter.status) === 'planned' ? 'planned' : 'shared',
    authorsText: getStringArray(frontmatter.authors).join('\n'),
    tagsText: getStringArray(frontmatter.tags).join('\n'),
    draft: frontmatter.draft === true,
    slug: normalizeOptionalText(frontmatter.slug)
  };
};

const toMaterialsEditorValues = (state: AdminContentSourceState): AdminMaterialsEditorValues => {
  const frontmatter = state.rawFrontmatter;
  return {
    title: normalizeOptionalText(frontmatter.title),
    href: normalizeOptionalText(frontmatter.href),
    date: getDateString(frontmatter, 'date', ''),
    label: normalizeOptionalText(frontmatter.label),
    description: normalizeOptionalText(frontmatter.description)
  };
};
const toMemoEditorValues = (state: AdminContentSourceState): AdminMemoEditorValues => {
  const frontmatter = state.rawFrontmatter;
  return {
    title: normalizeOptionalText(frontmatter.title),
    subtitle: normalizeOptionalText(frontmatter.subtitle),
    date: normalizeOptionalText(frontmatter.date),
    draft: frontmatter.draft === true,
    slug: normalizeOptionalText(frontmatter.slug)
  };
};

export const buildAdminContentEntryEditorPayloadFromState = (
  state: AdminContentSourceState
): AdminContentEditorPayload => {
  const { collection } = state;
  if (collection === 'longform') {
    return {
      collection,
      entryId: state.entryId,
      publicEntryId: state.publicEntryId,
      defaultPublicSlug: state.defaultPublicSlug,
      revision: state.revision,
      relativePath: state.relativePath,
      writable: true,
      readonlyReason: null,
      bodyText: state.bodyText,
      values: toEssayEditorValues(state)
    };
  }

  if (collection === 'bits') {
    return {
      collection,
      entryId: state.entryId,
      publicEntryId: state.publicEntryId,
      defaultPublicSlug: state.defaultPublicSlug,
      revision: state.revision,
      relativePath: state.relativePath,
      writable: true,
      readonlyReason: null,
      bodyText: state.bodyText,
      values: toBitsEditorValues(state)
    };
  }


  if (collection === 'picks') {
    return {
      collection,
      entryId: state.entryId,
      publicEntryId: state.publicEntryId,
      defaultPublicSlug: state.defaultPublicSlug,
      revision: state.revision,
      relativePath: state.relativePath,
      writable: true,
      readonlyReason: null,
      bodyText: state.bodyText,
      values: toPicksEditorValues(state)
    };
  }

  if (collection === 'materials') {
    return {
      collection,
      entryId: state.entryId,
      publicEntryId: state.publicEntryId,
      defaultPublicSlug: state.defaultPublicSlug,
      revision: state.revision,
      relativePath: state.relativePath,
      writable: true,
      readonlyReason: null,
      bodyText: state.bodyText,
      values: toMaterialsEditorValues(state)
    };
  }
  if (collection === 'about') {
    return buildAdminAboutEditorPayload(state);
  }

  if (collection === 'memo') {
    return {
      collection,
      entryId: state.entryId,
      publicEntryId: state.publicEntryId,
      defaultPublicSlug: state.defaultPublicSlug,
      revision: state.revision,
      relativePath: state.relativePath,
      writable: true,
      readonlyReason: null,
      bodyText: state.bodyText,
      values: toMemoEditorValues(state)
    };
  }

  throw new AdminContentEntryResolutionError(
    'invalid-entry-id',
    getAdminContentReadOnlyReason(collection) ?? `当前 collection 暂不支持编辑 payload：${collection}`
  );
};

export const readAdminContentEntryEditorPayload = async (
  collection: AdminContentEntryWriteCollectionKey,
  entryId: string
): Promise<AdminContentEditorPayload> => {
  if (!getAdminContentCollectionCapability(collection).entryWritable) {
    throw new AdminContentEntryResolutionError(
      'invalid-entry-id',
      getAdminContentReadOnlyReason(collection) ?? `当前 collection 暂不支持写盘：${collection}`
    );
  }

  return buildAdminContentEntryEditorPayloadFromState(await loadAdminContentSourceState(collection, entryId));
};





