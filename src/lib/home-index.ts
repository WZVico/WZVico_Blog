import type { LongformEntry } from './content';
import type { ArticleMetaSettings } from './theme-settings';

export const HOME_INDEX_UPDATED_DATE_LABEL = '更新于：';

export const getLongformHomeIndexDisplayDate = (entry: LongformEntry): Date =>
  entry.data.updatedAt instanceof Date ? entry.data.updatedAt : entry.data.date;

export const orderByLongformHomeIndexDisplayDate = (left: LongformEntry, right: LongformEntry): number => {
  const displayDateOrder =
    getLongformHomeIndexDisplayDate(right).valueOf() - getLongformHomeIndexDisplayDate(left).valueOf();
  return displayDateOrder || right.data.date.valueOf() - left.data.date.valueOf();
};

export const getLongformHomeIndexArticleMetaSettings = (
  entry: LongformEntry,
  articleMetaSettings: ArticleMetaSettings
): ArticleMetaSettings => {
  if (!entry.data.updatedAt || !articleMetaSettings.dateLabel) return articleMetaSettings;
  return {
    ...articleMetaSettings,
    dateLabel: HOME_INDEX_UPDATED_DATE_LABEL
  };
};
