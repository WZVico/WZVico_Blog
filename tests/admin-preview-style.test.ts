import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readProjectFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('admin preview styles', () => {
  it('keeps the editor preview width tied to the public article readable width', () => {
    const globalCss = readProjectFile('src/styles/global.css');
    const layoutCss = readProjectFile('src/styles/components/layout.css');
    const shellCss = readProjectFile('src/styles/components/admin/content/editor/shell.css');
    const paneCss = readProjectFile('src/styles/components/admin/content/editor/pane-content.css');

    expect(globalCss).toContain('--layout-shell-max-inline-size: 1100px;');
    expect(globalCss).toContain('--public-sidebar-inline-size: 320px;');
    expect(globalCss).toContain('--public-content-padding-inline: 48px;');
    expect(globalCss).toContain('--article-readable-inline-size: min(');
    expect(globalCss).toContain('var(--layout-shell-max-inline-size) - var(--public-sidebar-inline-size) -');
    expect(globalCss).toContain('var(--layout-divider-inline-size) - var(--public-content-padding-inline) -');
    expect(layoutCss).toContain('max-width: var(--layout-shell-max-inline-size);');
    expect(shellCss).toContain('--admin-editor-preview-content-max-inline-size: var(--article-readable-inline-size);');
    expect(paneCss).toContain('max-inline-size: var(--admin-editor-preview-content-max-inline-size);');
  });

  it('renders the longform preview body in the same font and width context as the public detail body', () => {
    const paneCss = readProjectFile('src/styles/components/admin/content/editor/pane-content.css');
    const editorShell = readProjectFile('src/components/admin/editor/essay/EditorShell.svelte');

    expect(editorShell).toContain('previewArticleClass="heti article-page immersive-page admin-editor-preview__article--longform-detail"');
    expect(editorShell).toContain("initHeti('.admin-editor-preview__article--longform-detail.heti')");
    expect(paneCss).toContain('.admin-editor-shell .admin-editor-preview__article--longform-detail {');
    expect(paneCss).toContain('max-inline-size: var(--article-readable-inline-size);');
    expect(paneCss).toContain('font-family: "Noto Serif SC", ui-serif, Georgia, "Times New Roman", "Songti SC", serif;');
    expect(paneCss).toContain('line-height: 1.75;');
    expect(paneCss).toContain(".admin-editor-shell[data-effective-view='preview'] .admin-editor-shell__workspace");
  });

  it('keeps Markdown emphasis italic inside Heti prose', () => {
    const proseCss = readProjectFile('src/styles/components/prose.css');

    expect(proseCss).toContain('.prose.heti em {');
    expect(proseCss).toContain('font-style: italic;');
    expect(proseCss).toContain('font-weight: inherit;');
  });
});
