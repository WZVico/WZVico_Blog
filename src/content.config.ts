import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { LONGFORM_PUBLIC_SLUG_RE } from './utils/slug-rules';
import { normalizeBitsAvatarPath } from './utils/format';
import { parseLongformDateInput, parseLongformPublishedAtInput } from './utils/date-only';

const slugRule = z
  .string()
  .regex(LONGFORM_PUBLIC_SLUG_RE, 'slug must be lowercase kebab-case');

const longformBaseFields = {
  title: z.string(),
  description: z.string().optional(),
  date: z.unknown(),
  tags: z.array(z.string()).default([]),
  draft: z.boolean().default(false),
  archive: z.boolean().default(true),
  publishedAt: z.unknown().optional(),
  // Optional custom permalink. If present, it overrides the default public slug
  // derived from the entry id / path.
  slug: slugRule.optional()
};

const bitsImage = z.object({
  src: z.string(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  alt: z.string().optional()
});

const bitsAuthorAvatar = z
  .string()
  .superRefine((value, ctx) => {
    const normalized = normalizeBitsAvatarPath(value);
    if (normalized === undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'author.avatar 只允许相对图片路径（例如 author/avatar.webp），不要带 public/、不要以 / 开头，也不要使用 URL、..、?、#'
      });
      return;
    }
  })
  .transform((value) => normalizeBitsAvatarPath(value) ?? value);

const contentAuthorBase = z.object({
  name: z.string().optional(),
  avatar: bitsAuthorAvatar.optional()
});

const longformAuthor = contentAuthorBase.extend({
  showAvatar: z.boolean().optional()
});

const longformTranslation = z.object({
  translator: z.string().optional(),
  avatar: bitsAuthorAvatar.optional(),
  showAvatar: z.boolean().optional(),
  source: z.string().optional(),
  sourceUrl: z.url().optional()
});

const longformShape = {
  ...longformBaseFields,
  cover: z.string().optional(),
  badge: z.string().optional(),
  author: longformAuthor.optional(),
  authors: z.array(longformAuthor).optional(),
  translation: longformTranslation.optional()
};

const longformSchema = z.object(longformShape).transform((data, ctx) => {
  const dateResult = parseLongformDateInput(data.date);
  if (!dateResult) {
    ctx.addIssue({
      code: 'custom',
      path: ['date'],
      message: 'date must be a valid YYYY-MM-DD date or ISO 8601 datetime'
    });
    return z.NEVER;
  }

  const publishedAtInput = data.publishedAt;
  const hasExplicitPublishedAt =
    publishedAtInput != null &&
    !(typeof publishedAtInput === 'string' && publishedAtInput.trim() === '');
  const publishedAt = hasExplicitPublishedAt
    ? parseLongformPublishedAtInput(publishedAtInput)
    : dateResult.publishedAt;

  if (hasExplicitPublishedAt && !publishedAt) {
    ctx.addIssue({
      code: 'custom',
      path: ['publishedAt'],
      message: 'publishedAt must be a valid ISO 8601 datetime with timezone'
    });
    return z.NEVER;
  }

  const normalizedData = { ...data };
  delete normalizedData.publishedAt;

  return {
    ...normalizedData,
    date: dateResult.date,
    ...(publishedAt ? { publishedAt } : {})
  };
});

const longform = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/longform' }),
  schema: longformSchema
});

const bits = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/bits' }),
  schema: z.object({
    // Bits can be untitled.
    title: z.string().optional(),
    description: z.string().optional(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    slug: slugRule.optional(),

    // Optional media for card display.
    images: z.array(bitsImage).optional(),
    author: contentAuthorBase.optional(),
    authors: z.array(contentAuthorBase).optional()
  })
});

const picks = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/picks' }),
  schema: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    intro: z.array(z.string()).optional(),
    date: z.coerce.date().optional(),
    year: z.number().int().optional(),
    authors: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    slug: z.string().optional()
  })
});

const materials = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/materials' }),
  schema: z.object({
    title: z.string(),
    href: z.string(),
    date: z.coerce.date(),
    label: z.string().optional(),
    description: z.string().optional()
  })
});

export const collections = { longform, bits, picks, materials };
