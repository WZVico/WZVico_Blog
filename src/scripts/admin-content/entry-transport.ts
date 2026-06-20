import type {
  AdminBitsEditorPayload,
  AdminBitsEditorValues,
  AdminContentEditorPayload,
  AdminEssayEditorPayload,
  AdminEssayEditorValues,
  AdminMaterialsEditorPayload,
  AdminMaterialsEditorValues,
  AdminMemoEditorPayload,
  AdminMemoEditorValues,
  AdminPicksEditorPayload,
  AdminPicksEditorValues
} from '../../lib/admin-console/content-editor-payload';
import type { AdminContentEntryWriteCollectionKey } from '../../lib/admin-console/content-collections';
import type { AdminContentValidationIssue } from '../../lib/admin-console/content-entry-contract';
import type {
  AdminAboutEditorPayload,
  AdminAboutEditorValues
} from '../../lib/admin-console/content-about-contract';

export type AdminContentWriteResult = {
  changed: boolean;
  written: boolean;
  changedFields: string[];
  relativePath: string;
};

export type AdminContentDeleteResult = {
  collection: string;
  entryId: string;
  deleted: boolean;
  relativePath: string;
  trashedPath: string;
};

export type AdminContentPreviewResult = {
  html: string;
  warnings: string[];
  elapsedMs: number | null;
  codeHighlight: string;
};

export type AdminContentIssue = {
  path: string;
  message: string;
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const getStringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

export const parseResponseBody = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text.trim()) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

export const isPayloadOk = (value: unknown): value is Record<string, unknown> & { ok: true } =>
  isRecord(value) && value.ok === true;

export const getPayloadErrors = (value: unknown): string[] =>
  isRecord(value) ? getStringArray(value.errors) : [];

export const getPayloadIssues = (value: unknown): AdminContentIssue[] => {
  if (!isRecord(value) || !Array.isArray(value.issues)) return [];

  return value.issues
    .filter((item): item is AdminContentValidationIssue =>
      isRecord(item) && typeof item.path === 'string' && typeof item.message === 'string')
    .map((item) => ({
      path: item.path.trim(),
      message: item.message.trim()
    }));
};

export const getPayloadRevision = (value: unknown): string | null => {
  if (!isRecord(value) || !isRecord(value.payload)) return null;
  const revision = value.payload.revision;
  return typeof revision === 'string' && revision.trim().length > 0 ? revision.trim() : null;
};

export const getPayloadResult = (value: unknown): AdminContentWriteResult | null => {
  if (!isRecord(value) || !isRecord(value.result)) return null;
  return {
    changed: value.result.changed === true,
    written: value.result.written === true,
    changedFields: getStringArray(value.result.changedFields),
    relativePath: typeof value.result.relativePath === 'string' ? value.result.relativePath.trim() : ''
  };
};

export const getPayloadDeleteResult = (value: unknown): AdminContentDeleteResult | null => {
  if (!isRecord(value) || !isRecord(value.result)) return null;
  return {
    collection: typeof value.result.collection === 'string' ? value.result.collection.trim() : '',
    entryId: typeof value.result.entryId === 'string' ? value.result.entryId.trim() : '',
    deleted: value.result.deleted === true,
    relativePath: typeof value.result.relativePath === 'string' ? value.result.relativePath.trim() : '',
    trashedPath: typeof value.result.trashedPath === 'string' ? value.result.trashedPath.trim() : ''
  };
};

export const getPayloadPreviewResult = (value: unknown): AdminContentPreviewResult | null => {
  if (!isRecord(value) || !isRecord(value.result)) return null;

  return {
    html: typeof value.result.html === 'string' ? value.result.html : '',
    warnings: getStringArray(value.result.warnings),
    elapsedMs: typeof value.result.elapsedMs === 'number' ? value.result.elapsedMs : null,
    codeHighlight: typeof value.result.codeHighlight === 'string' ? value.result.codeHighlight : ''
  };
};

const isAdminEssayEditorValues = (value: unknown): value is AdminEssayEditorValues =>
  isRecord(value)
  && typeof value.title === 'string'
  && typeof value.description === 'string'
  && typeof value.date === 'string'
  && typeof value.publishedAt === 'string'
  && typeof value.updatedAt === 'string'
  && typeof value.tagsText === 'string'
  && typeof value.draft === 'boolean'
  && typeof value.archive === 'boolean'
  && typeof value.slug === 'string'
  && typeof value.cover === 'string'
  && typeof value.badge === 'string'
  && typeof value.authorsText === 'string'
  && typeof value.authorName === 'string'
  && typeof value.authorAvatar === 'string'
  && typeof value.authorAvatarsText === 'string'
  && typeof value.authorShowAvatar === 'boolean'
  && typeof value.translationTranslator === 'string'
  && typeof value.translationAvatar === 'string'
  && typeof value.translationShowAvatar === 'boolean'
  && typeof value.translationSource === 'string'
  && typeof value.translationSourceUrl === 'string';

const isAdminBitsEditorValues = (value: unknown): value is AdminBitsEditorValues =>
  isRecord(value)
  && typeof value.title === 'string'
  && typeof value.description === 'string'
  && typeof value.date === 'string'
  && typeof value.tagsText === 'string'
  && typeof value.draft === 'boolean'
  && typeof value.authorName === 'string'
  && typeof value.authorAvatar === 'string'
  && typeof value.imagesText === 'string';

const isAdminPicksEditorValues = (value: unknown): value is AdminPicksEditorValues =>
  isRecord(value)
  && typeof value.title === 'string'
  && typeof value.date === 'string'
  && typeof value.year === 'string'
  && (value.status === 'shared' || value.status === 'planned')
  && typeof value.authorsText === 'string'
  && typeof value.tagsText === 'string'
  && typeof value.draft === 'boolean'
  && typeof value.slug === 'string';

const isAdminMaterialsEditorValues = (value: unknown): value is AdminMaterialsEditorValues =>
  isRecord(value)
  && typeof value.title === 'string'
  && typeof value.href === 'string'
  && typeof value.date === 'string'
  && typeof value.label === 'string'
  && typeof value.description === 'string';

const isAdminMemoEditorValues = (value: unknown): value is AdminMemoEditorValues =>
  isRecord(value)
  && typeof value.title === 'string'
  && typeof value.subtitle === 'string'
  && typeof value.date === 'string'
  && typeof value.draft === 'boolean'
  && typeof value.slug === 'string';

const isAboutGuideItem = (value: unknown): value is AdminAboutEditorValues['guide']['items'][number] =>
  isRecord(value)
  && typeof value.title === 'string'
  && typeof value.href === 'string'
  && typeof value.description === 'string';

const isAboutTechItem = (value: unknown): value is AdminAboutEditorValues['tech']['groups'][number]['items'][number] =>
  isRecord(value)
  && typeof value.title === 'string'
  && typeof value.description === 'string';

const isAboutTechGroup = (value: unknown): value is AdminAboutEditorValues['tech']['groups'][number] =>
  isRecord(value)
  && typeof value.title === 'string'
  && Array.isArray(value.items)
  && value.items.every(isAboutTechItem);

const isAboutFaqItem = (value: unknown): value is AdminAboutEditorValues['faq']['items'][number] =>
  isRecord(value)
  && typeof value.question === 'string'
  && typeof value.answer === 'string';

const isAdminAboutEditorValues = (value: unknown): value is AdminAboutEditorValues =>
  isRecord(value)
  && Array.isArray(value.introLines)
  && value.introLines.every((item) => typeof item === 'string')
  && isRecord(value.guide)
  && typeof value.guide.title === 'string'
  && Array.isArray(value.guide.items)
  && value.guide.items.every(isAboutGuideItem)
  && isRecord(value.tech)
  && typeof value.tech.title === 'string'
  && Array.isArray(value.tech.groups)
  && value.tech.groups.every(isAboutTechGroup)
  && isRecord(value.faq)
  && typeof value.faq.title === 'string'
  && Array.isArray(value.faq.items)
  && value.faq.items.every(isAboutFaqItem)
  && isRecord(value.contact)
  && typeof value.contact.title === 'string'
  && typeof value.contact.note === 'string';

const isAdminEssayEditorPayload = (value: unknown): value is AdminEssayEditorPayload =>
  isRecord(value)
  && value.collection === 'longform'
  && typeof value.entryId === 'string'
  && typeof value.publicEntryId === 'string'
  && typeof value.defaultPublicSlug === 'string'
  && typeof value.revision === 'string'
  && typeof value.relativePath === 'string'
  && value.writable === true
  && value.readonlyReason === null
  && typeof value.bodyText === 'string'
  && isAdminEssayEditorValues(value.values);

const isAdminBitsEditorPayload = (value: unknown): value is AdminBitsEditorPayload =>
  isRecord(value)
  && value.collection === 'bits'
  && typeof value.entryId === 'string'
  && typeof value.publicEntryId === 'string'
  && typeof value.defaultPublicSlug === 'string'
  && typeof value.revision === 'string'
  && typeof value.relativePath === 'string'
  && value.writable === true
  && value.readonlyReason === null
  && typeof value.bodyText === 'string'
  && isAdminBitsEditorValues(value.values);

const isAdminPicksEditorPayload = (value: unknown): value is AdminPicksEditorPayload =>
  isRecord(value)
  && value.collection === 'picks'
  && typeof value.entryId === 'string'
  && typeof value.publicEntryId === 'string'
  && typeof value.defaultPublicSlug === 'string'
  && typeof value.revision === 'string'
  && typeof value.relativePath === 'string'
  && value.writable === true
  && value.readonlyReason === null
  && typeof value.bodyText === 'string'
  && isAdminPicksEditorValues(value.values);

const isAdminMaterialsEditorPayload = (value: unknown): value is AdminMaterialsEditorPayload =>
  isRecord(value)
  && value.collection === 'materials'
  && typeof value.entryId === 'string'
  && typeof value.publicEntryId === 'string'
  && typeof value.defaultPublicSlug === 'string'
  && typeof value.revision === 'string'
  && typeof value.relativePath === 'string'
  && value.writable === true
  && value.readonlyReason === null
  && typeof value.bodyText === 'string'
  && isAdminMaterialsEditorValues(value.values);

const isAdminMemoEditorPayload = (value: unknown): value is AdminMemoEditorPayload =>
  isRecord(value)
  && value.collection === 'memo'
  && typeof value.entryId === 'string'
  && typeof value.publicEntryId === 'string'
  && typeof value.defaultPublicSlug === 'string'
  && typeof value.revision === 'string'
  && typeof value.relativePath === 'string'
  && value.writable === true
  && value.readonlyReason === null
  && typeof value.bodyText === 'string'
  && isAdminMemoEditorValues(value.values);

const isAdminAboutEditorPayload = (value: unknown): value is AdminAboutEditorPayload =>
  isRecord(value)
  && value.collection === 'about'
  && typeof value.entryId === 'string'
  && typeof value.publicEntryId === 'string'
  && typeof value.defaultPublicSlug === 'string'
  && typeof value.revision === 'string'
  && typeof value.relativePath === 'string'
  && value.writable === true
  && value.readonlyReason === null
  && typeof value.bodyText === 'string'
  && isAdminAboutEditorValues(value.values);

export const getPayloadEditorPayload = (value: unknown): AdminContentEditorPayload | null => {
  if (!isRecord(value) || !isRecord(value.payload)) return null;
  const { payload } = value;
  if (isAdminEssayEditorPayload(payload)) return payload;
  if (isAdminBitsEditorPayload(payload)) return payload;
  if (isAdminPicksEditorPayload(payload)) return payload;
  if (isAdminMaterialsEditorPayload(payload)) return payload;
  if (isAdminMemoEditorPayload(payload)) return payload;
  if (isAdminAboutEditorPayload(payload)) return payload;
  return null;
};

export const getPayloadEssayPayload = (value: unknown): AdminEssayEditorPayload | null => {
  const payload = getPayloadEditorPayload(value);
  return isAdminEssayEditorPayload(payload) ? payload : null;
};

export const getPayloadEssayValues = (value: unknown): AdminEssayEditorValues | null => {
  const payload = getPayloadEssayPayload(value);
  return payload ? payload.values : null;
};

export const getPayloadEssayBody = (value: unknown): string | null => {
  const payload = getPayloadEssayPayload(value);
  return payload ? payload.bodyText : null;
};

export function getPayloadEditorValues(value: unknown, collection: 'longform'): AdminEssayEditorValues | null;
export function getPayloadEditorValues(value: unknown, collection: 'bits'): AdminBitsEditorValues | null;
export function getPayloadEditorValues(value: unknown, collection: 'picks'): AdminPicksEditorValues | null;
export function getPayloadEditorValues(value: unknown, collection: 'materials'): AdminMaterialsEditorValues | null;
export function getPayloadEditorValues(value: unknown, collection: 'memo'): AdminMemoEditorValues | null;
export function getPayloadEditorValues(value: unknown, collection: 'about'): AdminAboutEditorValues | null;
export function getPayloadEditorValues(
  value: unknown,
  collection: AdminContentEntryWriteCollectionKey
): AdminEssayEditorValues | AdminBitsEditorValues | AdminPicksEditorValues | AdminMaterialsEditorValues | AdminMemoEditorValues | AdminAboutEditorValues | null;
export function getPayloadEditorValues(
  value: unknown,
  collection: AdminContentEntryWriteCollectionKey
): AdminEssayEditorValues | AdminBitsEditorValues | AdminPicksEditorValues | AdminMaterialsEditorValues | AdminMemoEditorValues | AdminAboutEditorValues | null {
  const payload = getPayloadEditorPayload(value);
  if (!payload || payload.collection !== collection || !payload.writable) return null;
  if (collection === 'longform' && isAdminEssayEditorPayload(payload)) return payload.values;
  if (collection === 'bits' && isAdminBitsEditorPayload(payload)) return payload.values;
  if (collection === 'picks' && isAdminPicksEditorPayload(payload)) return payload.values;
  if (collection === 'materials' && isAdminMaterialsEditorPayload(payload)) return payload.values;
  if (collection === 'memo' && isAdminMemoEditorPayload(payload)) return payload.values;
  if (collection === 'about' && isAdminAboutEditorPayload(payload)) return payload.values;
  return null;
}

export const getPayloadEditorBody = (
  value: unknown,
  collection: AdminContentEntryWriteCollectionKey
): string | null => {
  const payload = getPayloadEditorPayload(value);
  if (!payload || payload.collection !== collection) return null;
  if (collection === 'longform' && isAdminEssayEditorPayload(payload)) return payload.bodyText;
  if (collection === 'bits' && isAdminBitsEditorPayload(payload)) return payload.bodyText;
  if (collection === 'picks' && isAdminPicksEditorPayload(payload)) return payload.bodyText;
  if (collection === 'materials' && isAdminMaterialsEditorPayload(payload)) return payload.bodyText;
  if (collection === 'memo' && isAdminMemoEditorPayload(payload)) return payload.bodyText;
  if (collection === 'about' && isAdminAboutEditorPayload(payload)) return payload.bodyText;
  return null;
};

