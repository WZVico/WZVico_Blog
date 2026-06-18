import { describe, expect, it } from 'vitest';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkMath from 'remark-math';
import {
  createMarkdownShikiConfig,
  createProjectMarkdownRehypePlugins,
  createProjectMarkdownRemarkPlugins,
  createPublicMarkdownConfig,
  markdownFeatureContract,
  markdownMathOptions,
  markdownRenderingDifferences,
  markdownShikiThemes,
  publicMarkdownRehypeSegments,
  publicMarkdownRemarkSegments
} from '../src/plugins/markdown-pipeline.mjs';
import {
  markdownMathRawOptions,
  rehypeProtectMarkdownMath,
  rehypeRestoreMarkdownMathBoundary
} from '../src/plugins/rehype-markdown-math-boundary.mjs';
import { sanitizeSchema } from '../src/plugins/sanitize-schema.mjs';

const pluginOf = (entry: unknown) => (Array.isArray(entry) ? entry[0] : entry);
const optionsOf = (entry: unknown) => (Array.isArray(entry) ? entry[1] : undefined);
const publicSegmentIndex = (id: string) =>
  publicMarkdownRehypeSegments.findIndex((segment) => segment.id === id);

describe('markdown pipeline contract', () => {
  it('declares the shared markdown feature boundaries', () => {
    expect(markdownFeatureContract.map((feature) => feature.id)).toEqual([
      'callout',
      'math',
      'code-block',
      'gfm',
      'smartypants',
      'raw-html-sanitize'
    ]);

    expect(markdownFeatureContract.find((feature) => feature.id === 'math')?.options).toEqual({
      singleDollarTextMath: false
    });
    expect(markdownFeatureContract.find((feature) => feature.id === 'code-block')?.shikiThemes).toEqual({
      light: 'github-light',
      dark: 'github-dark'
    });
    expect(markdownFeatureContract.find((feature) => feature.id === 'raw-html-sanitize')).toMatchObject({
      sanitizeSource: 'src/plugins/sanitize-schema.mjs',
      sanitizeStrategy: 'shared-schema',
      perFeatureSchemaMerge: false
    });
  });

  it('keeps Astro public GFM and smartypants as built-ins instead of public remark plugins', () => {
    const publicConfig = createPublicMarkdownConfig();
    const publicRemarkPlugins = publicConfig.remarkPlugins.map(pluginOf);

    expect(publicMarkdownRemarkSegments).toEqual([
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
    expect(pluginOf(publicConfig.remarkPlugins[0])).toBe(remarkMath);
    expect(optionsOf(publicConfig.remarkPlugins[0])).toBe(markdownMathOptions);
    expect(publicRemarkPlugins).toHaveLength(3);
  });

  it('documents Astro public rehype order without pretending Shiki is a project rehype plugin', () => {
    expect(publicSegmentIndex('astro-code-highlighting')).toBeLessThan(publicSegmentIndex('project-rehype'));
    expect(publicMarkdownRehypeSegments.find((segment) => segment.id === 'astro-code-highlighting')).toMatchObject({
      provider: 'Astro markdown.shikiConfig',
      excludedLanguages: ['math']
    });
    expect(publicMarkdownRehypeSegments.find((segment) => segment.id === 'project-rehype')).toMatchObject({
      plugins: [
        'rehypeProtectMarkdownMath',
        'rehype-raw',
        'rehypeRestoreMarkdownMathBoundary',
        'rehype-sanitize',
        'rehype-katex'
      ]
    });
  });

  it('creates shared project remark and rehype plugin entries', () => {
    const remarkPlugins = createProjectMarkdownRemarkPlugins();
    const rehypePlugins = createProjectMarkdownRehypePlugins();

    expect(pluginOf(remarkPlugins[0])).toBe(remarkMath);
    expect(optionsOf(remarkPlugins[0])).toBe(markdownMathOptions);

    expect(pluginOf(rehypePlugins[0])).toBe(rehypeProtectMarkdownMath);
    expect(pluginOf(rehypePlugins[1])).toBe(rehypeRaw);
    expect(optionsOf(rehypePlugins[1])).toBe(markdownMathRawOptions);
    expect(pluginOf(rehypePlugins[2])).toBe(rehypeRestoreMarkdownMathBoundary);
    expect(pluginOf(rehypePlugins[3])).toBe(rehypeSanitize);
    expect(optionsOf(rehypePlugins[3])).toBe(sanitizeSchema);
    expect(pluginOf(rehypePlugins[4])).toBe(rehypeKatex);
  });

  it('keeps Shiki themes and toolbar transformer in one public factory', () => {
    const shikiConfig = createMarkdownShikiConfig();

    expect(shikiConfig.themes).toEqual(markdownShikiThemes);
    expect(shikiConfig.transformers).toHaveLength(1);
    expect(shikiConfig.transformers[0]?.name).toBe('astro-whono-code-toolbar');
  });

  it('documents the sanitize and heading-id strategies as accepted adapter differences', () => {
    expect(markdownRenderingDifferences.sanitize).toEqual({
      source: 'src/plugins/sanitize-schema.mjs',
      strategy: 'shared-schema',
      perFeatureSchemaMerge: false
    });
    expect(markdownRenderingDifferences.headingId).toEqual({
      acceptedDifference: true,
      public: 'Astro generated heading id'
    });
  });
});
