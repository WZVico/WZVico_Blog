import remarkDirective from 'remark-directive';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import {
  markdownMathRawOptions,
  rehypeProtectMarkdownMath,
  rehypeRestoreMarkdownMathBoundary
} from './rehype-markdown-math-boundary.mjs';
import remarkCallout from './remark-callout.mjs';
import { sanitizeSchema } from './sanitize-schema.mjs';
import shikiToolbar from './shiki-toolbar.mjs';

export const markdownMathOptions = Object.freeze({
  singleDollarTextMath: false
});

export const markdownSmartypantsOptions = Object.freeze({});

export const markdownShikiThemes = Object.freeze({
  light: 'github-light',
  dark: 'github-dark'
});

export const markdownFeatureContract = Object.freeze([
  {
    id: 'callout',
    syntax: 'containerDirective',
    projectPlugins: ['remark-directive', 'remark-callout'],
    editorAffordance: 'src/components/admin/editor/markdown'
  },
  {
    id: 'math',
    syntax: 'remark-math',
    options: markdownMathOptions,
    projectPlugins: [
      'remark-math',
      'rehypeProtectMarkdownMath',
      'rehypeRestoreMarkdownMathBoundary',
      'rehype-katex'
    ]
  },
  {
    id: 'code-block',
    syntax: 'fenced-code',
    public: { highlighter: 'Astro markdown.shikiConfig' },
    preview: { highlighter: '@shikijs/rehype' },
    shikiThemes: markdownShikiThemes,
    toolbarTransformer: 'astro-whono-code-toolbar',
    editorAffordance: 'src/components/admin/editor/markdown'
  },
  {
    id: 'gfm',
    public: {
      provider: 'astro-built-in',
      beforeProjectRemarkPlugins: true
    },
    preview: {
      provider: 'remark-gfm',
      beforeProjectRemarkPlugins: true
    }
  },
  {
    id: 'smartypants',
    public: {
      provider: 'astro-built-in',
      beforeProjectRemarkPlugins: true
    },
    preview: {
      provider: 'remark-smartypants',
      beforeProjectRemarkPlugins: true,
      options: markdownSmartypantsOptions
    }
  },
  {
    id: 'raw-html-sanitize',
    syntax: 'raw-html',
    sanitizeSource: 'src/plugins/sanitize-schema.mjs',
    sanitizeStrategy: 'shared-schema',
    perFeatureSchemaMerge: false
  }
]);

export const publicMarkdownRemarkSegments = Object.freeze([
  {
    id: 'astro-built-in-remark',
    plugins: ['astro-gfm', 'astro-smartypants'],
    before: 'project-remark'
  },
  {
    id: 'project-remark',
    plugins: ['remark-math', 'remark-directive', 'remark-callout']
  }
]);

export const previewMarkdownRemarkSegments = Object.freeze([
  {
    id: 'preview-parser',
    plugins: ['remark-parse']
  },
  {
    id: 'preview-astro-built-in-parity',
    plugins: ['remark-gfm', 'remark-smartypants'],
    before: 'project-remark'
  },
  {
    id: 'project-remark',
    plugins: ['remark-math', 'remark-directive', 'remark-callout']
  }
]);

export const publicMarkdownRehypeSegments = Object.freeze([
  {
    id: 'mdast-to-hast',
    publicOnly: true,
    plugins: ['Astro remark-rehype']
  },
  {
    id: 'astro-code-highlighting',
    publicOnly: true,
    provider: 'Astro markdown.shikiConfig',
    before: 'project-rehype',
    excludedLanguages: ['math']
  },
  {
    id: 'project-rehype',
    plugins: [
      'rehypeProtectMarkdownMath',
      'rehype-raw',
      'rehypeRestoreMarkdownMathBoundary',
      'rehype-sanitize',
      'rehype-katex'
    ]
  },
  {
    id: 'astro-images',
    publicOnly: true,
    plugins: ['Astro rehypeImages'],
    after: 'project-rehype'
  },
  {
    id: 'astro-heading-ids',
    publicOnly: true,
    plugins: ['Astro rehypeHeadingIds'],
    after: 'project-rehype'
  },
  {
    id: 'astro-final-raw-stringify',
    publicOnly: true,
    plugins: ['Astro rehypeRaw', 'Astro rehypeStringify'],
    after: 'project-rehype'
  }
]);

export const previewMarkdownRehypeSegments = Object.freeze([
  {
    id: 'mdast-to-hast',
    previewOnly: true,
    plugins: ['remark-rehype']
  },
  {
    id: 'preview-outline',
    previewOnly: true,
    plugins: ['createPreviewOutlineAnchorPlugin'],
    before: 'math-boundary-protect'
  },
  {
    id: 'math-boundary-protect',
    plugins: ['rehypeProtectMarkdownMath']
  },
  {
    id: 'code-highlighting',
    public: { provider: 'Astro markdown.shikiConfig' },
    preview: { provider: '@shikijs/rehype' },
    after: 'math-boundary-protect',
    before: 'raw-html'
  },
  {
    id: 'raw-html',
    plugins: ['rehype-raw', 'rehypeRestoreMarkdownMathBoundary'],
    after: 'code-highlighting',
    before: 'sanitize'
  },
  {
    id: 'preview-local-image-src',
    previewOnly: true,
    plugins: ['createPreviewImageSrcPlugin'],
    before: 'sanitize'
  },
  {
    id: 'sanitize',
    plugins: ['rehype-sanitize'],
    schemaSource: 'src/plugins/sanitize-schema.mjs',
    strategy: 'shared-schema'
  },
  {
    id: 'katex',
    plugins: ['rehype-katex'],
    after: 'sanitize'
  },
  {
    id: 'preview-stringify',
    previewOnly: true,
    plugins: ['rehype-stringify']
  }
]);

export const markdownRenderingDifferences = Object.freeze({
  headingId: {
    acceptedDifference: true,
    public: 'Astro generated heading id',
    preview: 'data-admin-outline-key'
  },
  sanitize: {
    source: 'src/plugins/sanitize-schema.mjs',
    strategy: 'shared-schema',
    perFeatureSchemaMerge: false,
    previewOnlyAllowedAttributes: ['data-admin-outline-key']
  }
});

export const createMarkdownShikiTransformers = () => [shikiToolbar()];

export const createMarkdownShikiConfig = () => ({
  themes: { ...markdownShikiThemes },
  transformers: createMarkdownShikiTransformers()
});

export const createProjectMarkdownRemarkPlugins = () => [
  [remarkMath, markdownMathOptions],
  remarkDirective,
  remarkCallout
];

export const createProjectMarkdownRehypePlugins = () => [
  rehypeProtectMarkdownMath,
  [rehypeRaw, markdownMathRawOptions],
  rehypeRestoreMarkdownMathBoundary,
  [rehypeSanitize, sanitizeSchema],
  rehypeKatex
];

export const createPublicMarkdownConfig = () => ({
  remarkPlugins: createProjectMarkdownRemarkPlugins(),
  rehypePlugins: createProjectMarkdownRehypePlugins(),
  shikiConfig: createMarkdownShikiConfig()
});
