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

export const markdownShikiThemes = Object.freeze({
  light: 'github-light',
  dark: 'github-dark'
});

export const markdownFeatureContract = Object.freeze([
  {
    id: 'callout',
    syntax: 'containerDirective',
    projectPlugins: ['remark-directive', 'remark-callout']
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
    shikiThemes: markdownShikiThemes,
    toolbarTransformer: 'astro-whono-code-toolbar'
  },
  {
    id: 'gfm',
    public: {
      provider: 'astro-built-in',
      beforeProjectRemarkPlugins: true
    }
  },
  {
    id: 'smartypants',
    public: {
      provider: 'astro-built-in',
      beforeProjectRemarkPlugins: true
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

export const markdownRenderingDifferences = Object.freeze({
  headingId: {
    acceptedDifference: true,
    public: 'Astro generated heading id'
  },
  sanitize: {
    source: 'src/plugins/sanitize-schema.mjs',
    strategy: 'shared-schema',
    perFeatureSchemaMerge: false
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
