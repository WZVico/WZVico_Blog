import { slug as githubSlug } from 'github-slugger';

/**
 * Shared slug rules for longform public URLs.
 *
 * Both `content.config.ts` (schema validation) and `content.ts` (build-time
 * assertions) depend on this module so the "what is a valid public slug"
 * contract is defined in exactly one place.
 */

/** A valid public slug must be lowercase kebab-case. */
export const LONGFORM_PUBLIC_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Format text as it is entered in the longform public URL field. */
export const normalizeLongformSlugInput = (value: string): string =>
  value.toLowerCase().replace(/\s+/g, '-');

/**
 * Slug values that collide with sibling static routes under `/archive/` or
 * `/longform/`.  Since longform slugs are always single-segment (enforced by schema
 * + `[slug]` route), only exact matches need to be checked.
 */
export const RESERVED_LONGFORM_SLUGS: ReadonlySet<string> = new Set([
  'page',
  'tag',
  'rss.xml'
]);

/**
 * Convert a potentially multi-segment `entry.id` (e.g. `2024/my-post`) into a
 * single-segment slug suitable for the `[slug]` route.
 */
export const flattenEntryIdToSlug = (entryId: string): string =>
  entryId.replaceAll('/', '-');
export const ESSAY_PUBLIC_SLUG_RE = LONGFORM_PUBLIC_SLUG_RE;
export const RESERVED_ESSAY_SLUGS = RESERVED_LONGFORM_SLUGS;

export const contentSourceEntryIdToPublicEntryId = (entryId: string): string => {
  const normalized = entryId.trim().replace(/\\/g, '/').replace(/\/+$/g, '');
  if (!normalized) return '';

  return normalized
    .split('/')
    .map((segment) => githubSlug(segment))
    .join('/')
    .replace(/\/index$/i, '');
};
