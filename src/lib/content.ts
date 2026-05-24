import {
  getCollection,
  type CollectionEntry,
  type CollectionKey
} from 'astro:content';
import {
  LONGFORM_PUBLIC_SLUG_RE,
  RESERVED_LONGFORM_SLUGS,
  flattenEntryIdToSlug
} from '../utils/slug-rules';
import { deriveMarkdownText, truncateText } from '../utils/excerpt';
export { createWithBase } from '../utils/format';

type OrderBy<K extends CollectionKey> = (a: CollectionEntry<K>, b: CollectionEntry<K>) => number;
type DraftableCollectionKey = 'longform' | 'bits' | 'picks';

export type GetPublishedOptions<K extends DraftableCollectionKey> = {
  orderBy?: OrderBy<K>;
  includeDraft?: boolean;
};

/**
 * Check whether a slug collides with sibling static routes under /archive/
 * or /longform/.  After the route narrowing (catch-all → single-segment), only
 * exact matches need to be checked.
 *
 * NOTE: The primary defence is `assertUniqueLongformSlugs` which throws at build
 * time.  This predicate is kept in `getVisibleLongforms` / `getArchiveLongforms` as
 * defense-in-depth — it is NOT the main enforcement point.
 */
export const isReservedSlug = (slug: string) => RESERVED_LONGFORM_SLUGS.has(slug);

export const isPicksIndexEntryId = (id: string): boolean => {
  const normalized = id.replace(/\\/g, '/').replace(/\.md$/i, '');
  return normalized === 'index';
};

export const getTotalPages = (itemCount: number, pageSize: number) =>
  Math.ceil(itemCount / pageSize);

export const getPageSlice = <T>(items: T[], currentPage: number, pageSize: number) => {
  const start = (currentPage - 1) * pageSize;
  return items.slice(start, start + pageSize);
};

export const buildPaginatedPaths = (totalPages: number) => {
  if (totalPages <= 1) return [];
  return Array.from({ length: totalPages - 1 }, (_, i) => ({
    params: { page: String(i + 2) }
  }));
};

export async function getPublished<K extends DraftableCollectionKey>(
  name: K,
  opts: GetPublishedOptions<K> = {}
) {
  const prod = import.meta.env.PROD;
  const includeDraft = opts.includeDraft ?? !prod;
  const filter = includeDraft ? undefined : ({ data }: CollectionEntry<K>) => data.draft !== true;
  const items = await getCollection(name, filter);

  if (!opts.orderBy) return items;
  return items.slice().sort(opts.orderBy);
}

export type LongformEntry = CollectionEntry<'longform'>;
export type ReadsEntry = CollectionEntry<'picks'>;
type LongformQueryOptions = Pick<GetPublishedOptions<'longform'>, 'includeDraft'>;
export type LongformRouteEntry = {
  slug: string;
  entry: LongformEntry;
  prev: LongformEntry | null;
  next: LongformEntry | null;
};
export type LongformDerivedText = {
  plainText: string;
  text: string;
  excerpt: string;
};
export type ReadsDerivedText = {
  plainText: string;
  excerptText: string;
};

export const getLongformSlug = (entry: LongformEntry) =>
  entry.data.slug ?? flattenEntryIdToSlug(entry.id);

const assertUniqueLongformSlugs = (entries: readonly LongformEntry[]) => {
  const seen = new Map<string, string>();
  const duplicates = new Map<string, string[]>();

  for (const entry of entries) {
    const slug = getLongformSlug(entry);
    const slugSource = entry.data.slug ? 'frontmatter.slug' : `entry.id (flattened from "${entry.id}")`;

    // --- reserved-word check (primary defence) ---
    if (isReservedSlug(slug)) {
      throw new Error(
        [
          'Longform route slug conflict detected.',
          `  Entry:       ${entry.id}`,
          `  Public slug: ${slug}`,
          `  Source:      ${slugSource}`,
          `  Reason:      "${slug}" is reserved for sibling static routes under /archive/ and /longform/.`,
          '  How to fix:  change frontmatter.slug, or rename the file/path so the final public slug is no longer reserved.'
        ].join('\n')
      );
    }

    // --- format validity check (catches bad flattened results) ---
    if (!LONGFORM_PUBLIC_SLUG_RE.test(slug)) {
      throw new Error(
        [
          'Invalid public longform slug detected.',
          `  Entry:       ${entry.id}`,
          `  Public slug: ${slug}`,
          `  Source:      ${slugSource}`,
          '  Reason:      final public slug must be lowercase kebab-case.',
          '  How to fix:  provide a valid frontmatter.slug, or rename files/folders to kebab-case.'
        ].join('\n')
      );
    }

    // --- uniqueness check ---
    const firstEntryId = seen.get(slug);
    if (!firstEntryId) {
      seen.set(slug, entry.id);
      continue;
    }

    const duplicateIds = duplicates.get(slug) ?? [firstEntryId];
    duplicateIds.push(entry.id);
    duplicates.set(slug, duplicateIds);
  }

  if (duplicates.size === 0) return;

  const detail = Array.from(duplicates.entries())
    .map(([slug, entryIds]) => `"${slug}" <- ${entryIds.join(', ')}`)
    .join('; ');

  throw new Error(
    `Duplicate longform slug detected. Public longform slugs must be unique after path flattening. ${detail}`
  );
};

const orderByLongformDate = (a: LongformEntry, b: LongformEntry) => b.data.date.valueOf() - a.data.date.valueOf();
const shouldMemoizeLongformQueries = import.meta.env.PROD;
const shouldMemoizeReadsQueries = import.meta.env.PROD;
const MAX_LONGFORM_INDEX_TEXT = 600;

let sortedLongformsPromise: Promise<LongformEntry[]> | null = null;
let visibleLongformsPromise: Promise<LongformEntry[]> | null = null;
let archiveLongformsPromise: Promise<LongformEntry[]> | null = null;
const longformDerivedTextById = new Map<string, LongformDerivedText>();
const readsDerivedTextById = new Map<string, ReadsDerivedText>();

const cloneLongformEntries = (entries: readonly LongformEntry[]) => entries.slice();

const shouldUseDefaultLongformCache = (includeDraft?: boolean) =>
  shouldMemoizeLongformQueries && includeDraft !== true;

const loadSortedLongforms = async ({ includeDraft }: LongformQueryOptions = {}) => {
  const longforms = await getPublished('longform', {
    ...(includeDraft === undefined ? {} : { includeDraft }),
    orderBy: orderByLongformDate
  });
  assertUniqueLongformSlugs(longforms);
  return longforms;
};

const buildLongformDerivedText = (entry: LongformEntry): LongformDerivedText => {
  const { plainText, excerptText } = deriveMarkdownText(entry.body ?? '');
  const description = entry.data.description?.trim() ?? '';

  return {
    plainText,
    text: plainText.length > MAX_LONGFORM_INDEX_TEXT ? plainText.slice(0, MAX_LONGFORM_INDEX_TEXT) : plainText,
    excerpt: truncateText(description || excerptText, 120)
  };
};

export function getLongformDerivedText(entry: LongformEntry): LongformDerivedText {
  if (!shouldMemoizeLongformQueries) {
    return buildLongformDerivedText(entry);
  }

  let derivedText = longformDerivedTextById.get(entry.id);
  if (!derivedText) {
    derivedText = buildLongformDerivedText(entry);
    longformDerivedTextById.set(entry.id, derivedText);
  }

  return derivedText;
}

const buildReadsDerivedText = (entry: ReadsEntry): ReadsDerivedText =>
  deriveMarkdownText(entry.body ?? '');

export function getReadsDerivedText(entry: ReadsEntry): ReadsDerivedText {
  if (!shouldMemoizeReadsQueries) {
    return buildReadsDerivedText(entry);
  }

  let derivedText = readsDerivedTextById.get(entry.id);
  if (!derivedText) {
    derivedText = buildReadsDerivedText(entry);
    readsDerivedTextById.set(entry.id, derivedText);
  }

  return derivedText;
}

export async function getSortedLongforms(options: LongformQueryOptions = {}) {
  if (!shouldUseDefaultLongformCache(options.includeDraft)) {
    return loadSortedLongforms(options);
  }

  sortedLongformsPromise ??= loadSortedLongforms();
  return cloneLongformEntries(await sortedLongformsPromise);
}

export async function getVisibleLongforms(options: LongformQueryOptions = {}) {
  if (!shouldUseDefaultLongformCache(options.includeDraft)) {
    const longforms = await getSortedLongforms(options);
    return longforms.filter((entry) => !isReservedSlug(getLongformSlug(entry)));
  }

  visibleLongformsPromise ??= getSortedLongforms().then((longforms) =>
    longforms.filter((entry) => !isReservedSlug(getLongformSlug(entry)))
  );
  return cloneLongformEntries(await visibleLongformsPromise);
}

export async function getArchiveLongforms(options: LongformQueryOptions = {}) {
  if (!shouldUseDefaultLongformCache(options.includeDraft)) {
    const longforms = await getSortedLongforms(options);
    return longforms.filter((entry) => entry.data.archive !== false && !isReservedSlug(getLongformSlug(entry)));
  }

  archiveLongformsPromise ??= getSortedLongforms().then((longforms) =>
    longforms.filter((entry) => entry.data.archive !== false && !isReservedSlug(getLongformSlug(entry)))
  );
  return cloneLongformEntries(await archiveLongformsPromise);
}

export async function getVisibleLongformRouteEntries(options: LongformQueryOptions = {}) {
  const longforms = await getVisibleLongforms(options);
  return longforms.map((entry, index) => ({
    slug: getLongformSlug(entry),
    entry,
    prev: longforms[index - 1] ?? null,
    next: longforms[index + 1] ?? null
  })) satisfies LongformRouteEntry[];
}
