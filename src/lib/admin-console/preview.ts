import { performance } from 'node:perf_hooks';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import rehypeShiki from '@shikijs/rehype';
import type { RehypeShikiOptions } from '@shikijs/rehype';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import remarkSmartypants from 'remark-smartypants';
import { unified } from 'unified';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';
import type { Element, Root } from 'hast';
import {
  createMarkdownShikiTransformers,
  createProjectMarkdownRehypePlugins,
  createProjectMarkdownRemarkPlugins,
  markdownShikiThemes,
  markdownSmartypantsOptions
} from '../../plugins/markdown-pipeline.mjs';
import {
  resolveAdminContentEntrySourcePath
} from './content-entry-source';
import type { AdminContentCollectionKey } from './content-collections';
import { extractMarkdownOutline } from './editor-outline';
import {
  PREVIEW_SOURCE_BLOCK_TAG_NAMES
} from './preview-source-map';

export const ADMIN_PREVIEW_CODE_HIGHLIGHT_MODE = 'shiki-rehype' as const;

export type AdminPreviewCodeHighlightMode = typeof ADMIN_PREVIEW_CODE_HIGHLIGHT_MODE;

export type AdminMarkdownPreviewInput = {
  collection: AdminContentCollectionKey;
  entryId?: string;
  source: string;
};

export type AdminMarkdownPreviewResult = {
  collection: AdminContentCollectionKey;
  html: string;
  elapsedMs: number;
  codeHighlight: AdminPreviewCodeHighlightMode;
  warnings: string[];
};

const previewCodeHighlightCache: NonNullable<RehypeShikiOptions['cache']> = new Map();
const PREVIEW_IMAGE_EXTENSIONS = new Set(['.avif', '.gif', '.jpg', '.jpeg', '.png', '.svg', '.webp']);
const PREVIEW_OUTLINE_KEY_ATTR = 'data-admin-outline-key';

const PREVIEW_SHIKI_LANGUAGES: NonNullable<RehypeShikiOptions['langs']> = [
  'astro',
  'bash',
  'css',
  'dockerfile',
  'go',
  'html',
  'javascript',
  'jsx',
  'json',
  'markdown',
  'python',
  'rust',
  'scss',
  'sql',
  'svelte',
  'toml',
  'ts',
  'tsx',
  'typescript',
  'yaml'
];

const previewShikiOptions: RehypeShikiOptions = {
  themes: { ...markdownShikiThemes },
  langs: PREVIEW_SHIKI_LANGUAGES,
  transformers: createMarkdownShikiTransformers(),
  addLanguageClass: true,
  fallbackLanguage: 'text',
  cache: previewCodeHighlightCache
};

const getProjectRoot = (): string => process.env.ASTRO_WHONO_INTERNAL_TEST_PROJECT_ROOT?.trim() || process.cwd();

const isInsideProject = (filePath: string): boolean => {
  const relative = path.relative(getProjectRoot(), filePath);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
};

const hasUrlScheme = (value: string): boolean => /^[a-z][a-z\d+.-]*:/i.test(value);

const toViteFsUrl = (filePath: string): string => `/@fs${pathToFileURL(filePath).pathname}`;

const getPreviewLocalImageSrc = (sourceFilePath: string, value: string): string | null => {
  const trimmed = value.trim();
  if (
    !trimmed
    || trimmed.startsWith('/')
    || trimmed.startsWith('//')
    || trimmed.startsWith('#')
    || trimmed.includes('?')
    || trimmed.includes('#')
    || hasUrlScheme(trimmed)
  ) {
    return null;
  }

  let decoded = trimmed;
  try {
    decoded = decodeURI(trimmed);
  } catch {}

  const filePath = path.resolve(path.dirname(sourceFilePath), decoded);
  if (!isInsideProject(filePath) || !PREVIEW_IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    return null;
  }

  return existsSync(filePath) ? toViteFsUrl(filePath) : null;
};

const createPreviewImageSrcPlugin = (sourceFilePath: string | null): Plugin<[], Root> => {
  return () => (tree) => {
    if (!sourceFilePath) return;

    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'img') return;
      const src = node.properties?.src;
      if (typeof src !== 'string') return;

      const previewSrc = getPreviewLocalImageSrc(sourceFilePath, src);
      if (previewSrc) {
        node.properties.src = previewSrc;
      }
    });
  };
};

const createPreviewOutlineAnchorPlugin = (source: string): Plugin<[], Root> => {
  const outlineItems = extractMarkdownOutline(source);
  const outlineKeyByPosition = new Map(outlineItems.map((item) => [item.key, item.key]));
  const outlineKeyByLine = new Map(outlineItems.map((item) => [item.line, item.key]));

  return () => (tree) => {
    if (outlineItems.length === 0) return;

    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'h2' && node.tagName !== 'h3') return;

      const start = node.position?.start;
      const positionKey = typeof start?.line === 'number' && typeof start.offset === 'number'
        ? `${start.line}:${start.offset}`
        : '';
      const outlineKey = positionKey
        ? outlineKeyByPosition.get(positionKey) ?? outlineKeyByLine.get(start?.line ?? 0)
        : outlineKeyByLine.get(start?.line ?? 0);
      if (!outlineKey) return;

      node.properties = {
        ...node.properties,
        [PREVIEW_OUTLINE_KEY_ATTR]: outlineKey
      };
    });
  };
};

type PreviewCodeSourceRange = {
  start: number;
  end: number;
};

const applyPreviewSourceRange = (node: Element, start: number, end: number) => {
  node.properties = {
    ...node.properties,
    dataAdminSourceStart: String(start),
    dataAdminSourceEnd: String(end)
  };
};

const createPreviewSourceMapCapturePlugin = (): Plugin<[], Root> => {
  return () => (tree, file) => {
    const codeRanges: PreviewCodeSourceRange[] = [];

    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'pre') return;

      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (typeof start !== 'number' || typeof end !== 'number' || end < start) return;

      codeRanges.push({ start, end });
    });

    file.data.adminPreviewCodeSourceRanges = codeRanges;
  };
};

const hasClassName = (node: Element, className: string): boolean => {
  const value = node.properties?.className;
  if (Array.isArray(value)) return value.includes(className);
  return typeof value === 'string' && value.split(/\s+/).includes(className);
};

const createPreviewSourceMapFinalizePlugin = (): Plugin<[], Root> => {
  return () => (tree, file) => {
    visit(tree, 'element', (node: Element) => {
      if (!PREVIEW_SOURCE_BLOCK_TAG_NAMES.has(node.tagName)) return;

      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (typeof start !== 'number' || typeof end !== 'number' || end < start) return;
      applyPreviewSourceRange(node, start, end);
    });

    const codeRanges = Array.isArray(file.data.adminPreviewCodeSourceRanges)
      ? file.data.adminPreviewCodeSourceRanges as PreviewCodeSourceRange[]
      : [];
    let codeRangeIndex = 0;
    visit(tree, 'element', (node: Element) => {
      if (node.tagName !== 'div' || !hasClassName(node, 'code-block')) return;
      const range = codeRanges[codeRangeIndex];
      codeRangeIndex += 1;
      if (range) applyPreviewSourceRange(node, range.start, range.end);
    });
  };
};

const useProcessorPlugin = (processor: any, pluginEntry: any) => {
  if (Array.isArray(pluginEntry)) {
    processor.use(pluginEntry[0], pluginEntry[1]);
    return processor;
  }

  processor.use(pluginEntry);
  return processor;
};

const createPreviewProcessor = (_collection: AdminContentCollectionKey, sourceFilePath: string | null, source: string) => {
  const projectRemarkPlugins = createProjectMarkdownRemarkPlugins();
  const [
    rehypeProtectMath,
    rehypeRawHtml,
    rehypeRestoreMathBoundary,
    rehypeSanitizeSchema,
    rehypeRenderKatex
  ] = createProjectMarkdownRehypePlugins();

  const processor = unified()
    .use(remarkParse)
    // 后台预览是手写 pipeline，不继承 Astro Markdown 默认 GFM / smartypants。
    .use(remarkGfm)
    .use(remarkSmartypants, markdownSmartypantsOptions);

  projectRemarkPlugins.forEach((pluginEntry) => useProcessorPlugin(processor, pluginEntry));

  processor.use(remarkRehype, { allowDangerousHtml: true });
  processor.use(createPreviewOutlineAnchorPlugin(source));
  processor.use(createPreviewSourceMapCapturePlugin());
  useProcessorPlugin(processor, rehypeProtectMath);
  processor.use(rehypeShiki, previewShikiOptions);
  useProcessorPlugin(processor, rehypeRawHtml);
  useProcessorPlugin(processor, rehypeRestoreMathBoundary);
  processor.use(createPreviewImageSrcPlugin(sourceFilePath));
  useProcessorPlugin(processor, rehypeSanitizeSchema);
  processor.use(createPreviewSourceMapFinalizePlugin());
  useProcessorPlugin(processor, rehypeRenderKatex);

  return processor
    .use(rehypeStringify);
};

const roundElapsedMs = (value: number): number => Math.round(value * 10) / 10;

export const renderAdminMarkdownPreview = async ({
  collection,
  entryId,
  source
}: AdminMarkdownPreviewInput): Promise<AdminMarkdownPreviewResult> => {
  const startedAt = performance.now();
  const sourceFilePath = entryId ? resolveAdminContentEntrySourcePath(collection, entryId) : null;
  const previewProcessor = createPreviewProcessor(collection, sourceFilePath, source);
  const file = await previewProcessor.process(source);
  const html = String(file);

  return {
    collection,
    html,
    elapsedMs: roundElapsedMs(performance.now() - startedAt),
    codeHighlight: ADMIN_PREVIEW_CODE_HIGHLIGHT_MODE,
    warnings: file.messages.map((message) => String(message))
  };
};
