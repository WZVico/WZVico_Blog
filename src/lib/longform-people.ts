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

const normalizeArticlePerson = (
  author: ArticleAuthor | undefined,
  options: {
    defaultAuthorName: string;
    defaultAuthorAvatar: string;
    useDefaultIdentity: boolean;
    withBase: WithBase;
  }
): ArticlePerson => {
  const {
    defaultAuthorName,
    defaultAuthorAvatar,
    useDefaultIdentity,
    withBase
  } = options;
  const name = (author?.name ?? (useDefaultIdentity ? defaultAuthorName : '')).trim();
  const resolvedName = name || (useDefaultIdentity ? defaultAuthorName : '');
  const explicitAvatar = author?.avatar?.trim() ?? '';
  const defaultAvatarForSameName =
    useDefaultIdentity || resolvedName === defaultAuthorName ? defaultAuthorAvatar : '';
  const avatarRaw = explicitAvatar || defaultAvatarForSameName;

  return {
    name: resolvedName,
    avatar: avatarRaw ? withBase(avatarRaw) : '',
    showAvatar: author?.showAvatar !== false && Boolean(avatarRaw)
  };
};

export const getLongformArticlePeople = (
  entry: LongformEntry,
  settings: ThemeSettings,
  withBase: WithBase
): LongformArticlePeople => {
  const defaultAuthorName = (settings.page.bits.defaultAuthor.name ?? 'WZVico').trim() || 'WZVico';
  const defaultAuthorAvatar = (settings.page.bits.defaultAuthor.avatar ?? '').trim();
  const personOptions = {
    defaultAuthorName,
    defaultAuthorAvatar,
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
