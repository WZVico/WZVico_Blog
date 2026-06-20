import rawAuthorLibraryData from '../data/authors.json';
import { normalizeBitsAvatarPath } from '../utils/format';
import type { LongformEntry } from './content';
import type { ThemeSettings } from './theme-settings';

type ArticleAuthor = {
  name?: string | undefined;
  avatar?: string | undefined;
  showAvatar?: boolean | undefined;
};

export type ArticlePerson = {
  name: string;
  avatar: string;
  showAvatar: boolean;
};

export type LongformArticlePeople = {
  authors: ArticlePerson[];
  translator: ArticlePerson | null;
};

type WithBase = (path: string) => string;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const normalizeAuthorNameKey = (name: string): string =>
  name.trim().toLocaleLowerCase();

const getRawAuthorLibraryItems = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value.authors)) return value.authors;
  return [];
};

const buildAuthorLibraryAvatarMap = (value: unknown): ReadonlyMap<string, string> => {
  const avatars = new Map<string, string>();

  getRawAuthorLibraryItems(value).forEach((item) => {
    if (!isRecord(item)) return;
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const avatar = normalizeBitsAvatarPath(item.avatar);
    if (!name || !avatar) return;
    const key = normalizeAuthorNameKey(name);
    if (!avatars.has(key)) avatars.set(key, avatar);
  });

  return avatars;
};

const defaultAuthorLibraryAvatarMap = buildAuthorLibraryAvatarMap(rawAuthorLibraryData);

const normalizeArticlePerson = (
  author: ArticleAuthor | undefined,
  options: {
    defaultAuthorName: string;
    defaultAuthorAvatar: string;
    authorLibraryAvatarMap: ReadonlyMap<string, string>;
    useDefaultIdentity: boolean;
    withBase: WithBase;
  }
): ArticlePerson => {
  const {
    defaultAuthorName,
    defaultAuthorAvatar,
    authorLibraryAvatarMap,
    useDefaultIdentity,
    withBase
  } = options;
  const name = (author?.name ?? (useDefaultIdentity ? defaultAuthorName : '')).trim();
  const resolvedName = name || (useDefaultIdentity ? defaultAuthorName : '');
  const explicitAvatar = author?.avatar?.trim() ?? '';
  const libraryAvatar = resolvedName
    ? authorLibraryAvatarMap.get(normalizeAuthorNameKey(resolvedName)) ?? ''
    : '';
  const defaultAvatarForSameName =
    useDefaultIdentity || resolvedName === defaultAuthorName ? defaultAuthorAvatar : '';
  const avatarRaw = explicitAvatar || libraryAvatar || defaultAvatarForSameName;

  return {
    name: resolvedName,
    avatar: avatarRaw ? withBase(avatarRaw) : '',
    showAvatar: author?.showAvatar !== false && Boolean(avatarRaw)
  };
};

export const getLongformArticlePeople = (
  entry: LongformEntry,
  settings: ThemeSettings,
  withBase: WithBase,
  authorLibraryData: unknown = rawAuthorLibraryData
): LongformArticlePeople => {
  const defaultAuthorName = (settings.page.bits.defaultAuthor.name ?? 'WZVico').trim() || 'WZVico';
  const defaultAuthorAvatar = (settings.page.bits.defaultAuthor.avatar ?? '').trim();
  const authorLibraryAvatarMap = authorLibraryData === rawAuthorLibraryData
    ? defaultAuthorLibraryAvatarMap
    : buildAuthorLibraryAvatarMap(authorLibraryData);
  const personOptions = {
    defaultAuthorName,
    defaultAuthorAvatar,
    authorLibraryAvatarMap,
    withBase
  };
  const configuredAuthors = Array.isArray(entry.data.authors) ? entry.data.authors : [];
  const authors = (
    configuredAuthors.length > 0
      ? configuredAuthors.map((author) =>
          normalizeArticlePerson(author, {
            ...personOptions,
            useDefaultIdentity: false
          })
        )
      : [
          normalizeArticlePerson(entry.data.author, {
            ...personOptions,
            useDefaultIdentity: true
          })
        ]
  ).filter((author) => author.name);

  const translation = entry.data.translation;
  const translatorName = translation?.translator?.trim() ?? '';
  const translator = translatorName
    ? normalizeArticlePerson(
        {
          name: translatorName,
          avatar: translation?.avatar,
          showAvatar: translation?.showAvatar
        },
        {
          ...personOptions,
          useDefaultIdentity: false
        }
      )
    : null;

  return {
    authors,
    translator
  };
};

export const getLongformArticleAuthorNames = (
  entry: LongformEntry,
  settings: ThemeSettings
): string[] =>
  getLongformArticlePeople(entry, settings, (path) => path)
    .authors
    .map((author) => author.name)
    .filter(Boolean);
