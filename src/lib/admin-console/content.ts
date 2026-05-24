import type { CollectionEntry } from 'astro:content';
import { PAGE_SIZE_BITS } from '../../../site.config.mjs';
import {
  getLongformDerivedText,
  getLongformSlug,
  getReadsDerivedText,
  getPageSlice,
  getPublished,
  getSortedLongforms,
  getTotalPages,
  isPicksIndexEntryId,
  type LongformEntry
} from '../content';
import {
  getBitAnchorId,
  getBitSlug,
  getBitsDerivedText,
  getBitsSearchIndex,
  getSortedBits,
  type BitsEntry
} from '../bits';
import { truncateText } from '../../utils/excerpt';
import {
  buildSearchHaystack,
  formatDateTime,
  formatISODateUtc,
  tokenizeSearchQuery
} from '../../utils/format';

export type ReadsEntry = CollectionEntry<'picks'>;
export type AdminContentCollectionKey = 'longform' | 'bits' | 'picks';
export type AdminContentDraftFilter = 'all' | 'draft' | 'published';
export type AdminContentSortKey = 'recent' | 'title';
export type AdminContentField = {
  label: string;
  value: string;
};

export type AdminContentIndexItem = {
  collection: AdminContentCollectionKey;
  collectionLabel: string;
  id: string;
  title: string;
  slug: string | null;
  relativePath: string;
  publicHref: string | null;
  excerpt: string | null;
  isDraft: boolean;
  archive: boolean | null;
  date: Date | null;
  dateLabel: string;
  dateValue: string | null;
  year: number | null;
  tags: string[];
  frontmatterFields: AdminContentField[];
  searchHaystack: string;
};

export type AdminContentCollectionSummary = {
  key: AdminContentCollectionKey;
  label: string;
  totalCount: number;
  draftCount: number;
  latestDateLabel: string;
};

export type AdminContentFilterOption = {
  value: string;
  label: string;
  count: number;
};

export type AdminContentFilterState = {
  query: string;
  queryTokens: string[];
  draft: AdminContentDraftFilter;
  tag: string;
  year: number | null;
  page: number;
  entry: string;
  sort: AdminContentSortKey;
};

export type AdminContentCollectionPageData = {
  collection: AdminContentCollectionKey;
  collectionLabel: string;
  collectionHref: string;
  pageSize: number;
  totalCount: number;
  filteredCount: number;
  totalPages: number;
  currentPage: number;
  items: AdminContentIndexItem[];
  pageItems: AdminContentIndexItem[];
  selectedEntry: AdminContentIndexItem | null;
  tagOptions: AdminContentFilterOption[];
  yearOptions: AdminContentFilterOption[];
  filterState: AdminContentFilterState;
  hasActiveFilters: boolean;
};

export type AdminContentOverviewData = {
  summaries: AdminContentCollectionSummary[];
};

export const ADMIN_CONTENT_COLLECTIONS = ['longform', 'bits', 'picks'] as const satisfies readonly AdminContentCollectionKey[];

export const ADMIN_CONTENT_SORT_OPTIONS = [
  { value: 'recent', label: '最近更新' },
  { value: 'title', label: '标题 A-Z' }
] as const satisfies readonly { value: AdminContentSortKey; label: string }[];

export const ADMIN_CONTENT_DRAFT_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'published', label: '仅非草稿' },
  { value: 'draft', label: '仅草稿' }
] as const satisfies readonly { value: AdminContentDraftFilter; label: string }[];

const COLLECTION_LABELS: Record<AdminContentCollectionKey, string> = {
  longform: '长文',
  bits: '絮语',
  picks: '拾选'
};

const ADMIN_CONTENT_PAGE_SIZES: Record<AdminContentCollectionKey, number> = {
  longform: 12,
  bits: 18,
  picks: 12
};

const EMPTY_VALUE = '(空)';
const MISSING_VALUE = '(未设置)';

const isAdminContentDraftFilter = (value: string): value is AdminContentDraftFilter =>
  ADMIN_CONTENT_DRAFT_OPTIONS.some((option) => option.value === value);

const isAdminContentSortKey = (value: string): value is AdminContentSortKey =>
  ADMIN_CONTENT_SORT_OPTIONS.some((option) => option.value === value);

const normalizePositiveInteger = (value: string | null): number | null => {
  if (!value) return null;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const normalizeOptionalText = (value: string | null | undefined): string =>
  typeof value === 'string' ? value.trim() : '';

const normalizeFieldValue = (value: string | null | undefined, emptyValue = MISSING_VALUE): string => {
  const normalized = normalizeOptionalText(value);
  return normalized || emptyValue;
};

const orderByNullableDateDesc = (left: Date | null, right: Date | null): number => {
  if (left && right) return right.valueOf() - left.valueOf();
  if (left) return -1;
  if (right) return 1;
  return 0;
};

const orderByReadsDate = (left: ReadsEntry, right: ReadsEntry): number =>
  orderByNullableDateDesc(left.data.date ?? null, right.data.date ?? null);

const filterPicksContentEntries = (entries: readonly ReadsEntry[]): ReadsEntry[] =>
  entries.filter((entry) => !isPicksIndexEntryId(entry.id));

const formatNullableDate = (date: Date | null): { label: string; value: string | null; year: number | null } => {
  if (!date) {
    return {
      label: '未设置日期',
      value: null,
      year: null
    };
  }

  return {
    label: formatDateTime(date),
    value: formatISODateUtc(date),
    year: date.getUTCFullYear()
  };
};

const buildRelativePath = (collection: AdminContentCollectionKey, entryId: string): string =>
  `src/content/${collection}/${entryId}`;

const buildEntryField = (label: string, value: string | null | undefined, emptyValue?: string): AdminContentField => ({
  label,
  value: normalizeFieldValue(value, emptyValue)
});

const buildTagOptions = (items: readonly AdminContentIndexItem[]): AdminContentFilterOption[] => {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const tag of item.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((left, right) => {
      if (right[1] !== left[1]) return right[1] - left[1];
      return left[0].localeCompare(right[0], 'zh-Hans-CN');
    })
    .map(([value, count]) => ({
      value,
      label: value,
      count
    }));
};

const buildYearOptions = (items: readonly AdminContentIndexItem[]): AdminContentFilterOption[] => {
  const counts = new Map<number, number>();
  for (const item of items) {
    if (item.year === null) continue;
    counts.set(item.year, (counts.get(item.year) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[0] - left[0])
    .map(([value, count]) => ({
      value: String(value),
      label: String(value),
      count
    }));
};

const loadPublishedBitsHrefMap = async (): Promise<Map<string, string>> => {
  const index = await getBitsSearchIndex(PAGE_SIZE_BITS);
  return new Map(index.map((item) => [item.key, item.href]));
};

const createLongformIndexItem = (entry: LongformEntry): AdminContentIndexItem => {
  const derivedText = getLongformDerivedText(entry);
  const title = normalizeFieldValue(entry.data.title, entry.id);
  const { label, value, year } = formatNullableDate(entry.data.date);
  const slug = getLongformSlug(entry);
  const relativePath = buildRelativePath('longform', entry.id);
  const publicHref = entry.data.draft === true ? null : `/archive/${slug}/`;
  const excerpt = derivedText.excerpt || null;
  const authorItems = entry.data.authors?.length ? entry.data.authors : (entry.data.author ? [entry.data.author] : []);
  const authorName = authorItems.map((author) => normalizeOptionalText(author.name)).filter(Boolean).join(', ');
  const authorAvatar = authorItems.map((author) => normalizeOptionalText(author.avatar)).filter(Boolean).join(', ');
  const translation = entry.data.translation;
  const translationTranslator = normalizeOptionalText(translation?.translator);
  const translationAvatar = normalizeOptionalText(translation?.avatar);
  const translationSource = normalizeOptionalText(translation?.source);
  const translationSourceUrl = normalizeOptionalText(translation?.sourceUrl);

  return {
    collection: 'longform',
    collectionLabel: COLLECTION_LABELS.longform,
    id: entry.id,
    title,
    slug,
    relativePath,
    publicHref,
    excerpt,
    isDraft: entry.data.draft === true,
    archive: entry.data.archive !== false,
    date: entry.data.date,
    dateLabel: label,
    dateValue: value,
    year,
    tags: entry.data.tags.slice(),
    frontmatterFields: [
      buildEntryField('title', entry.data.title, entry.id),
      buildEntryField('description', entry.data.description, EMPTY_VALUE),
      buildEntryField('date', value, '未设置日期'),
      buildEntryField('tags', entry.data.tags.join(', '), EMPTY_VALUE),
      buildEntryField('draft', String(entry.data.draft === true)),
      buildEntryField('archive', String(entry.data.archive !== false)),
      buildEntryField('slug', slug),
      buildEntryField('cover', entry.data.cover),
      buildEntryField('badge', entry.data.badge),
      buildEntryField('author.name', authorName, MISSING_VALUE),
      buildEntryField('author.avatar', authorAvatar, MISSING_VALUE),
      buildEntryField('translation.translator', translationTranslator, MISSING_VALUE),
      buildEntryField('translation.avatar', translationAvatar, MISSING_VALUE),
      buildEntryField('translation.source', translationSource, MISSING_VALUE),
      buildEntryField('translation.sourceUrl', translationSourceUrl, MISSING_VALUE)
    ],
    searchHaystack: buildSearchHaystack([
      title,
      entry.id,
      slug,
      entry.data.description,
      entry.data.tags,
      authorName,
      authorAvatar,
      translationTranslator,
      translationAvatar,
      translationSource,
      translationSourceUrl,
      derivedText.text
    ])
  };
};

const createBitsIndexItem = (
  entry: BitsEntry,
  publicHrefById: ReadonlyMap<string, string>
): AdminContentIndexItem => {
  const derivedText = getBitsDerivedText(entry);
  const fallbackTitle = truncateText(derivedText.excerpt || derivedText.plainText, 48) || entry.id;
  const title = normalizeFieldValue(entry.data.title, fallbackTitle);
  const { label, value, year } = formatNullableDate(entry.data.date);
  const slug = getBitSlug(entry);
  const relativePath = buildRelativePath('bits', entry.id);
  const publicHref = entry.data.draft === true ? null : publicHrefById.get(entry.id) ?? null;
  const authorName = normalizeOptionalText(entry.data.author?.name);
  const authorAvatar = normalizeOptionalText(entry.data.author?.avatar);
  const imageCount = entry.data.images?.length ?? 0;
  const excerpt = derivedText.excerpt || null;

  return {
    collection: 'bits',
    collectionLabel: COLLECTION_LABELS.bits,
    id: entry.id,
    title,
    slug,
    relativePath,
    publicHref,
    excerpt,
    isDraft: entry.data.draft === true,
    archive: null,
    date: entry.data.date,
    dateLabel: label,
    dateValue: value,
    year,
    tags: entry.data.tags.slice(),
    frontmatterFields: [
      buildEntryField('title', entry.data.title, fallbackTitle),
      buildEntryField('description', entry.data.description, EMPTY_VALUE),
      buildEntryField('date', value, '未设置日期'),
      buildEntryField('tags', entry.data.tags.join(', '), EMPTY_VALUE),
      buildEntryField('draft', String(entry.data.draft === true)),
      buildEntryField('slug', slug),
      buildEntryField('author.name', authorName, MISSING_VALUE),
      buildEntryField('author.avatar', authorAvatar, MISSING_VALUE),
      buildEntryField('images', imageCount > 0 ? `${imageCount} 项` : EMPTY_VALUE)
    ],
    searchHaystack: buildSearchHaystack([
      title,
      entry.id,
      slug,
      entry.data.description,
      entry.data.tags,
      authorName,
      authorAvatar,
      derivedText.text
    ])
  };
};

const createReadsIndexItem = (entry: ReadsEntry): AdminContentIndexItem => {
  const derivedText = getReadsDerivedText(entry);
  const excerpt = truncateText(derivedText.excerptText, 160) || null;
  const title = normalizeFieldValue(entry.data.title, entry.id);
  const { label, value, year } = formatNullableDate(entry.data.date ?? null);
  const slug = normalizeOptionalText(entry.data.slug) || null;
  const relativePath = buildRelativePath('picks', entry.id);
  const publicHref = entry.data.draft === true ? null : '/picks/';
  const subtitle = normalizeOptionalText(entry.data.subtitle);

  return {
    collection: 'picks',
    collectionLabel: COLLECTION_LABELS.picks,
    id: entry.id,
    title,
    slug,
    relativePath,
    publicHref,
    excerpt,
    isDraft: entry.data.draft === true,
    archive: null,
    date: entry.data.date ?? null,
    dateLabel: label,
    dateValue: value,
    year,
    tags: [],
    frontmatterFields: [
      buildEntryField('title', entry.data.title, entry.id),
      buildEntryField('subtitle', subtitle, EMPTY_VALUE),
      buildEntryField('date', value, '未设置日期'),
      buildEntryField('draft', String(entry.data.draft === true)),
      buildEntryField('slug', slug, MISSING_VALUE),
      buildEntryField('public route', '/picks/')
    ],
    searchHaystack: buildSearchHaystack([
      title,
      entry.id,
      slug,
      subtitle,
      derivedText.plainText
    ])
  };
};

const loadCollectionItems = async (collection: AdminContentCollectionKey): Promise<AdminContentIndexItem[]> => {
  switch (collection) {
    case 'longform':
      return (await getSortedLongforms({ includeDraft: true })).map((entry) => createLongformIndexItem(entry));
    case 'bits': {
      const [entries, publicHrefById] = await Promise.all([
        getSortedBits({ includeDraft: true }),
        loadPublishedBitsHrefMap()
      ]);
      return entries.map((entry) => createBitsIndexItem(entry, publicHrefById));
    }
    case 'picks':
      return filterPicksContentEntries(await getPublished('picks', { includeDraft: true, orderBy: orderByReadsDate }))
        .map((entry) => createReadsIndexItem(entry));
    default:
      throw new Error(`Unsupported admin content collection: ${String(collection)}`);
  }
};

const loadCollectionSummary = async (
  collection: AdminContentCollectionKey
): Promise<AdminContentCollectionSummary> => {
  switch (collection) {
    case 'longform': {
      const entries = await getSortedLongforms({ includeDraft: true });
      const latestDate = entries.find((entry) => entry.data.date !== null)?.data.date ?? null;

      return {
        key: collection,
        label: COLLECTION_LABELS[collection],
        totalCount: entries.length,
        draftCount: entries.filter((entry) => entry.data.draft === true).length,
        latestDateLabel: latestDate ? formatDateTime(latestDate) : '未设置日期'
      };
    }
    case 'bits': {
      const entries = await getSortedBits({ includeDraft: true });
      const latestDate = entries.find((entry) => entry.data.date !== null)?.data.date ?? null;

      return {
        key: collection,
        label: COLLECTION_LABELS[collection],
        totalCount: entries.length,
        draftCount: entries.filter((entry) => entry.data.draft === true).length,
        latestDateLabel: latestDate ? formatDateTime(latestDate) : '未设置日期'
      };
    }
    case 'picks': {
      const entries = filterPicksContentEntries(
        await getPublished('picks', { includeDraft: true, orderBy: orderByReadsDate })
      );
      const latestDate = entries.find((entry) => entry.data.date !== null)?.data.date ?? null;

      return {
        key: collection,
        label: COLLECTION_LABELS[collection],
        totalCount: entries.length,
        draftCount: entries.filter((entry) => entry.data.draft === true).length,
        latestDateLabel: latestDate ? formatDateTime(latestDate) : '未设置日期'
      };
    }
    default:
      throw new Error(`Unsupported admin content collection summary: ${String(collection)}`);
  }
};

export const isAdminContentCollectionKey = (value: string): value is AdminContentCollectionKey =>
  ADMIN_CONTENT_COLLECTIONS.includes(value as AdminContentCollectionKey);

export const getAdminContentCollectionHref = (collection: AdminContentCollectionKey): `/admin/content/${AdminContentCollectionKey}/` =>
  `/admin/content/${collection}/`;

export const getAdminContentFilterState = (searchParams: URLSearchParams): AdminContentFilterState => {
  const query = normalizeOptionalText(searchParams.get('q'));
  const draftValue = normalizeOptionalText(searchParams.get('draft'));
  const sortValue = normalizeOptionalText(searchParams.get('sort'));
  const year = normalizePositiveInteger(searchParams.get('year'));

  return {
    query,
    queryTokens: tokenizeSearchQuery(query),
    draft: isAdminContentDraftFilter(draftValue) ? draftValue : 'all',
    tag: normalizeOptionalText(searchParams.get('tag')),
    year,
    page: normalizePositiveInteger(searchParams.get('page')) ?? 1,
    entry: normalizeOptionalText(searchParams.get('entry')),
    sort: isAdminContentSortKey(sortValue) ? sortValue : 'recent'
  };
};

export const filterAdminContentItems = (
  items: readonly AdminContentIndexItem[],
  filterState: AdminContentFilterState
): AdminContentIndexItem[] => {
  const tagLower = filterState.tag.toLowerCase();
  const queryTokens = filterState.queryTokens;

  const filteredItems = items.filter((item) => {
    if (filterState.draft === 'draft' && !item.isDraft) return false;
    if (filterState.draft === 'published' && item.isDraft) return false;
    if (tagLower && !item.tags.some((tag) => tag.toLowerCase() === tagLower)) return false;
    if (filterState.year !== null && item.year !== filterState.year) return false;
    if (queryTokens.length > 0 && !queryTokens.every((token) => item.searchHaystack.includes(token))) return false;
    return true;
  });

  if (filterState.sort === 'title') {
    return filteredItems.slice().sort((left, right) => {
      const titleOrder = left.title.localeCompare(right.title, 'zh-Hans-CN');
      if (titleOrder !== 0) return titleOrder;
      return left.id.localeCompare(right.id, 'en');
    });
  }

  return filteredItems;
};

export const getAdminContentCollectionPageData = async (
  collection: AdminContentCollectionKey,
  searchParams: URLSearchParams
): Promise<AdminContentCollectionPageData> => {
  const items = await loadCollectionItems(collection);
  const filterState = getAdminContentFilterState(searchParams);
  const filteredItems = filterAdminContentItems(items, filterState);
  const pageSize = ADMIN_CONTENT_PAGE_SIZES[collection];
  const totalPages = Math.max(getTotalPages(filteredItems.length, pageSize), 1);
  const currentPage = Math.min(filterState.page, totalPages);
  const pageItems = getPageSlice(filteredItems, currentPage, pageSize);
  const selectedEntry = pageItems.find((item) => item.id === filterState.entry) ?? pageItems[0] ?? null;

  return {
    collection,
    collectionLabel: COLLECTION_LABELS[collection],
    collectionHref: getAdminContentCollectionHref(collection),
    pageSize,
    totalCount: items.length,
    filteredCount: filteredItems.length,
    totalPages,
    currentPage,
    items,
    pageItems,
    selectedEntry,
    tagOptions: buildTagOptions(items),
    yearOptions: buildYearOptions(items),
    filterState,
    hasActiveFilters:
      filterState.query.length > 0
      || filterState.draft !== 'all'
      || filterState.tag.length > 0
      || filterState.year !== null
      || filterState.sort !== 'recent'
  };
};

export const getAdminContentOverviewData = async (): Promise<AdminContentOverviewData> => {
  const summaries = await Promise.all(ADMIN_CONTENT_COLLECTIONS.map((collection) => loadCollectionSummary(collection)));

  return {
    summaries
  };
};

export const getAdminContentPublicFallbackLabel = (item: AdminContentIndexItem): string => {
  if (item.isDraft) {
    return 'draft 条目默认不暴露公开页';
  }

  if (item.collection === 'picks') {
    return 'picks 当前使用固定公开路由 /picks/';
  }

  if (item.collection === 'bits') {
    const anchorId = getBitAnchorId(item.slug ?? item.id);
    return `公开定位依赖 /bits/ 分页与锚点（${anchorId}）`;
  }

  return '当前条目未生成公开页链接';
};
