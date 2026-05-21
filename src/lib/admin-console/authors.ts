import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { normalizeBitsAvatarPath } from '../../utils/format';

export type AdminAuthorProfile = {
  name: string;
  avatar: string;
};

export type AdminAuthorProfilesNormalizeResult = {
  authors: AdminAuthorProfile[];
  errors: string[];
};

export const ADMIN_AUTHOR_LIBRARY_RELATIVE_PATH = 'src/data/authors.json';

const MAX_AUTHOR_COUNT = 120;
const MAX_AUTHOR_NAME_LENGTH = 120;
const MAX_AUTHOR_AVATAR_LENGTH = 400;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asTrimmedString = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const getProjectRoot = (): string =>
  process.env.ASTRO_WHONO_INTERNAL_TEST_PROJECT_ROOT?.trim() || process.cwd();

export const getAdminAuthorLibraryFilePath = (): string =>
  join(getProjectRoot(), 'src', 'data', 'authors.json');

const getRawAuthorItems = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value.authors)) return value.authors;
  return [];
};

export const normalizeAdminAuthorProfiles = (
  value: unknown
): AdminAuthorProfilesNormalizeResult => {
  const rawItems = getRawAuthorItems(value);
  const authors: AdminAuthorProfile[] = [];
  const errors: string[] = [];
  const seenNames = new Set<string>();

  if (!Array.isArray(value) && !(isRecord(value) && Array.isArray(value.authors))) {
    errors.push('作者库必须是数组，或包含 authors 数组的对象');
    return { authors, errors };
  }

  if (rawItems.length > MAX_AUTHOR_COUNT) {
    errors.push(`作者最多 ${MAX_AUTHOR_COUNT} 位`);
  }

  rawItems.slice(0, MAX_AUTHOR_COUNT).forEach((rawItem, index) => {
    if (!isRecord(rawItem)) {
      errors.push(`作者 #${index + 1} 必须是对象`);
      return;
    }

    const name = asTrimmedString(rawItem.name);
    const rawAvatar = asTrimmedString(rawItem.avatar);
    if (!name) {
      errors.push(`作者 #${index + 1} 请填写名称`);
      return;
    }
    if (name.length > MAX_AUTHOR_NAME_LENGTH) {
      errors.push(`作者名称过长：${name}`);
    }

    const key = name.toLocaleLowerCase();
    if (seenNames.has(key)) {
      errors.push(`作者名称不能重复：${name}`);
      return;
    }
    seenNames.add(key);

    const avatar = rawAvatar ? normalizeBitsAvatarPath(rawAvatar) : '';
    if (rawAvatar && avatar === undefined) {
      errors.push(`作者 ${name} 的头像只允许相对图片路径，例如 author/avatar.webp`);
      return;
    }
    if ((avatar ?? '').length > MAX_AUTHOR_AVATAR_LENGTH) {
      errors.push(`作者头像路径过长：${name}`);
    }

    authors.push({
      name,
      avatar: avatar ?? ''
    });
  });

  return errors.length > 0 ? { authors: [], errors } : { authors, errors };
};

export const readAdminAuthorProfiles = async (): Promise<AdminAuthorProfile[]> => {
  const filePath = getAdminAuthorLibraryFilePath();
  if (!existsSync(filePath)) return [];

  const rawText = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(rawText) as unknown;
  const { authors, errors } = normalizeAdminAuthorProfiles(parsed);
  if (errors.length > 0) {
    throw new Error(errors.join('；'));
  }

  return authors;
};

export const serializeAdminAuthorProfiles = (
  authors: readonly AdminAuthorProfile[]
): string => `${JSON.stringify(authors, null, 2)}\n`;
