import { createWithBase } from '../utils/format';
import { splitTagInput } from '../utils/tag-input';

type Tone = 'info' | 'success' | 'error';
type TextFieldName =
  | 'title'
  | 'slug'
  | 'description'
  | 'date'
  | 'publishedAt'
  | 'badge'
  | 'tags'
  | 'authorAvatar'
  | 'translationTranslator'
  | 'translationAvatar'
  | 'translationSource'
  | 'translationSourceUrl'
  | 'body';
type CheckboxFieldName = 'draft' | 'archive' | 'authorShowAvatar' | 'translationShowAvatar';
type DraftPerson = {
  name: string;
  avatar: string;
  showAvatar: boolean;
};
type LongformDraftPayload = {
  title: string;
  slug: string;
  description: string;
  date: string;
  publishedAt: string;
  badge: string;
  tags: string;
  authors: DraftPerson[];
  translationTranslator: string;
  translationAvatar: string;
  translationShowAvatar: boolean;
  translationSource: string;
  translationSourceUrl: string;
  body: string;
  draft: boolean;
  archive: boolean;
};
type AuthorLibraryItem = {
  name: string;
  avatar: string;
  showAvatar: boolean;
  source: string;
};
type TextareaSelection = {
  value: string;
  start: number;
  end: number;
  selected: string;
};

const base = import.meta.env.BASE_URL ?? '/';
const withBase = createWithBase(base);
const LONGFORM_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const query = <T extends Element>(root: ParentNode | null, selector: string): T | null =>
  root?.querySelector<T>(selector) ?? null;

const queryAll = <T extends Element>(root: ParentNode | null, selector: string): T[] =>
  Array.from(root?.querySelectorAll<T>(selector) ?? []);

const pad2 = (value: number): string => String(value).padStart(2, '0');

const formatLocalDate = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
};

const slugifyAscii = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const fallbackSlug = (dateText: string): string =>
  `post-${(dateText || formatLocalDate()).replace(/[^0-9]/g, '')}`;

const splitTags = (value: string): string[] => splitTagInput(value);

const dedupePersons = (items: readonly DraftPerson[]): DraftPerson[] => {
  const byName = new Map<string, DraftPerson>();

  items.forEach((item) => {
    const name = item.name.trim();
    if (!name) return;

    const key = getAuthorKey(name);
    const current = byName.get(key);
    if (current) {
      if (!current.avatar && item.avatar.trim()) current.avatar = item.avatar.trim();
      if (current.showAvatar && item.showAvatar === false) current.showAvatar = false;
      return;
    }

    byName.set(key, {
      name,
      avatar: item.avatar.trim(),
      showAvatar: item.showAvatar !== false
    });
  });

  return Array.from(byName.values());
};

const parseAuthorLibrary = (value: string | undefined): AuthorLibraryItem[] => {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null && !Array.isArray(item)
      )
      .map((item) => ({
        name: typeof item.name === 'string' ? item.name.trim() : '',
        avatar: typeof item.avatar === 'string' ? item.avatar.trim() : '',
        showAvatar: item.showAvatar !== false,
        source: typeof item.source === 'string' ? item.source.trim() : ''
      }))
      .filter((item) => item.name.length > 0);
  } catch {
    return [];
  }
};

const parseInitialPersonList = (value: string | undefined): DraftPerson[] => {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null && !Array.isArray(item)
      )
      .map((item) => ({
        name: typeof item.name === 'string' ? item.name.trim() : '',
        avatar: typeof item.avatar === 'string' ? item.avatar.trim() : '',
        showAvatar: item.showAvatar !== false
      }))
      .filter((item) => item.name.length > 0);
  } catch {
    return [];
  }
};

const parseInitialPerson = (value: string | undefined): DraftPerson | null =>
  parseInitialPersonList(value).at(0) ?? null;

const getAuthorKey = (name: string): string =>
  name.trim().toLocaleLowerCase();

const escapeYamlDoubleQuoted = (value: string): string =>
  value.replace(/[\n\r\t"\\]/g, (char) => {
    switch (char) {
      case '\\':
        return '\\\\';
      case '"':
        return '\\"';
      case '\n':
        return '\\n';
      case '\r':
        return '\\r';
      case '\t':
        return '\\t';
      default:
        return char;
    }
  });

const quoteYaml = (value: string): string =>
  /[:#\n\r\t\\[\]{}]|^\s|\s$|^-|^(?:true|false|null)$/i.test(value)
    ? `"${escapeYamlDoubleQuoted(value)}"`
    : value;

const setStatus = (statusEl: HTMLElement | null, text: string, tone: Tone = 'info') => {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.dataset.tone = tone;
};

const clearStatus = (statusEl: HTMLElement | null) => {
  if (!statusEl) return;
  statusEl.textContent = '';
  delete statusEl.dataset.tone;
};

const showResult = ({
  resultWrap,
  markdownEl,
  publicLink,
  markdown,
  publicHref
}: {
  resultWrap: HTMLElement | null;
  markdownEl: HTMLTextAreaElement | null;
  publicLink: HTMLAnchorElement | null;
  markdown: string;
  publicHref?: string;
}) => {
  if (markdownEl) markdownEl.value = markdown;
  if (publicLink) {
    const href = publicHref?.trim() ?? '';
    publicLink.hidden = !href;
    if (href) publicLink.href = withBase(href);
  }
  if (resultWrap) resultWrap.hidden = false;
};

const hideResult = ({
  resultWrap,
  markdownEl,
  publicLink
}: {
  resultWrap: HTMLElement | null;
  markdownEl: HTMLTextAreaElement | null;
  publicLink: HTMLAnchorElement | null;
}) => {
  if (resultWrap) resultWrap.hidden = true;
  if (markdownEl) markdownEl.value = '';
  if (publicLink) {
    publicLink.hidden = true;
    publicLink.href = '#';
  }
};

const normalizeBody = (value: string): string =>
  `${value.replace(/\r\n?/g, '\n').trimEnd()}\n`;

const buildMarkdown = (payload: LongformDraftPayload): string => {
  const tags = splitTags(payload.tags);
  const authors = dedupePersons(payload.authors);
  const body = normalizeBody(payload.body);
  const lines = ['---', `title: ${quoteYaml(payload.title)}`];

  if (payload.description) lines.push(`description: ${quoteYaml(payload.description)}`);
  lines.push(`date: ${payload.date}`);
  if (payload.publishedAt) lines.push(`publishedAt: ${payload.publishedAt}`);
  lines.push(`slug: ${payload.slug}`);
  if (payload.badge) lines.push(`badge: ${quoteYaml(payload.badge)}`);
  if (tags.length > 0) {
    lines.push('tags:');
    tags.forEach((tag) => {
      lines.push(`  - ${quoteYaml(tag)}`);
    });
  }
  lines.push(`draft: ${payload.draft ? 'true' : 'false'}`);
  lines.push(`archive: ${payload.archive ? 'true' : 'false'}`);

  if (authors.length > 1) {
    lines.push('authors:');
    authors.forEach((author) => {
      lines.push(`  - name: ${quoteYaml(author.name)}`);
      if (author.avatar) lines.push(`    avatar: ${quoteYaml(author.avatar)}`);
      if (!author.showAvatar) lines.push('    showAvatar: false');
    });
  } else if (authors.length === 1) {
    const [author] = authors;
    if (author) {
      lines.push('author:');
      lines.push(`  name: ${quoteYaml(author.name)}`);
      if (author.avatar) lines.push(`  avatar: ${quoteYaml(author.avatar)}`);
      if (!author.showAvatar) lines.push('  showAvatar: false');
    }
  }

  if (
    payload.translationTranslator
    || payload.translationAvatar
    || !payload.translationShowAvatar
    || payload.translationSource
    || payload.translationSourceUrl
  ) {
    lines.push('translation:');
    if (payload.translationTranslator) lines.push(`  translator: ${quoteYaml(payload.translationTranslator)}`);
    if (payload.translationAvatar) lines.push(`  avatar: ${quoteYaml(payload.translationAvatar)}`);
    if (!payload.translationShowAvatar) lines.push('  showAvatar: false');
    if (payload.translationSource) lines.push(`  source: ${quoteYaml(payload.translationSource)}`);
    if (payload.translationSourceUrl) lines.push(`  sourceUrl: ${payload.translationSourceUrl}`);
  }

  lines.push('---', '');
  return `${lines.join('\n')}${body}`;
};

const parseResponseJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getErrors = (value: unknown): string[] => {
  const errors = isRecord(value) && Array.isArray(value.errors)
    ? value.errors.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  if (errors.length > 0) return errors;

  return isRecord(value) && Array.isArray(value.issues)
    ? value.issues
        .map((item) => isRecord(item) && typeof item.message === 'string' ? item.message : '')
        .filter(Boolean)
    : [];
};

const getResultString = (value: unknown, key: string): string =>
  isRecord(value) && isRecord(value.result) && typeof value.result[key] === 'string'
    ? value.result[key].trim()
    : '';

const getPayloadString = (value: unknown, key: string): string =>
  isRecord(value) && isRecord(value.payload) && typeof value.payload[key] === 'string'
    ? value.payload[key].trim()
    : '';

const wrapSelection = (textarea: HTMLTextAreaElement, before: string, after: string, placeholder: string) => {
  textarea.focus();
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  const selected = start !== end ? textarea.value.slice(start, end) : placeholder;
  const next = `${before}${selected}${after}`;
  textarea.setRangeText(next, start, end, 'select');
  textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
  textarea.focus();
};

const prefixLines = (textarea: HTMLTextAreaElement, prefix: string) => {
  textarea.focus();
  const value = textarea.value;
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEndIndex = value.indexOf('\n', end);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const segment = value.slice(lineStart, lineEnd);
  const prefixed = segment
    .split('\n')
    .map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`))
    .join('\n');
  textarea.setRangeText(prefixed, lineStart, lineEnd, 'select');
  textarea.setSelectionRange(lineStart, lineStart + prefixed.length);
  textarea.focus();
};

const prefixLinesByIndex = (textarea: HTMLTextAreaElement, getPrefix: (index: number) => string) => {
  textarea.focus();
  const value = textarea.value;
  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEndIndex = value.indexOf('\n', end);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const segment = value.slice(lineStart, lineEnd);
  const prefixed = segment
    .split('\n')
    .map((line, index) => {
      const prefix = getPrefix(index);
      return line.startsWith(prefix) ? line : `${prefix}${line}`;
    })
    .join('\n');
  textarea.setRangeText(prefixed, lineStart, lineEnd, 'select');
  textarea.setSelectionRange(lineStart, lineStart + prefixed.length);
  textarea.focus();
};

const getTextareaSelection = (textarea: HTMLTextAreaElement): TextareaSelection => {
  const value = textarea.value;
  const start = textarea.selectionStart ?? value.length;
  const end = textarea.selectionEnd ?? start;
  return {
    value,
    start,
    end,
    selected: start === end ? '' : value.slice(start, end)
  };
};

const replaceSelectionWithBlock = (textarea: HTMLTextAreaElement, block: string) => {
  textarea.focus();
  const { value, start, end } = getTextareaSelection(textarea);
  const needsLeadingBreak = start > 0 && !value.slice(0, start).endsWith('\n\n');
  const needsTrailingBreak = !value.slice(end).startsWith('\n');
  const next = `${needsLeadingBreak ? '\n\n' : ''}${block}${needsTrailingBreak ? '\n' : ''}`;
  textarea.setRangeText(next, start, end, 'select');
  textarea.setSelectionRange(start + (needsLeadingBreak ? 2 : 0), start + (needsLeadingBreak ? 2 : 0) + block.length);
  textarea.focus();
};

const insertBlock = (textarea: HTMLTextAreaElement, block: string) => {
  replaceSelectionWithBlock(textarea, block);
};

const blockSnippets = {
  h2: '## 小标题\n\n',
  h3: '### 小标题\n\n',
  more: '<!-- more -->\n\n',
  'callout-note': ':::note[标题]\n这里写提示内容。\n:::\n\n',
  'callout-tip': ':::tip[标题]\n这里写提示内容。\n:::\n\n',
  'callout-info': ':::info[标题]\n这里写提示内容。\n:::\n\n',
  'callout-warning': ':::warning[标题]\n这里写提示内容。\n:::\n\n',
  codeblock: '```ts\nconst hello = "world";\n```\n\n',
  table: '| 项目 | 说明 |\n| :--- | :--- |\n| 示例 | 内容 |\n\n',
  figure: '<figure class="figure">\n  <img src="/images/archive/example.webp" alt="图片说明" />\n  <figcaption class="figure-caption">图注文字。</figcaption>\n</figure>\n\n',
  gallery: '<ul class="gallery">\n  <li>\n    <figure>\n      <img src="/images/archive/example-01.webp" alt="图片说明 1" />\n      <figcaption>第一张图注</figcaption>\n    </figure>\n  </li>\n  <li>\n    <figure>\n      <img src="/images/archive/example-02.webp" alt="图片说明 2" />\n      <figcaption>第二张图注</figcaption>\n    </figure>\n  </li>\n</ul>\n\n',
  pullquote: '<blockquote class="pullquote">\n  这里写需要被突出展示的句子。\n  <cite>— 来源</cite>\n</blockquote>\n\n',
  hr: '---\n\n'
} satisfies Record<string, string>;

const getBlockSnippet = (action: string): string | null =>
  Object.prototype.hasOwnProperty.call(blockSnippets, action)
    ? blockSnippets[action as keyof typeof blockSnippets]
    : null;

const cleanSelectedBlock = (value: string, fallback: string): string =>
  value.replace(/^\n+|\n+$/g, '') || fallback;

const escapeMarkdownTableCell = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').trim();

const escapeHtmlText = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const escapeHtmlAttribute = (value: string): string =>
  escapeHtmlText(value).replace(/"/g, '&quot;');

const buildSelectedTable = (selected: string): string => {
  const rows = selected
    .split('\n')
    .map((line) => escapeMarkdownTableCell(line))
    .filter(Boolean);

  if (rows.length === 0) return blockSnippets.table;

  return [
    '| 项目 | 说明 |',
    '| :--- | :--- |',
    ...rows.map((row) => `| ${row} |  |`),
    ''
  ].join('\n');
};

const buildSelectedGallery = (selected: string): string => {
  const captions = selected
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (captions.length === 0) return blockSnippets.gallery;

  const items = captions
    .map((caption, index) => {
      const safeCaption = escapeHtmlText(caption);
      const safeAlt = escapeHtmlAttribute(caption);
      return [
        '  <li>',
        '    <figure>',
        `      <img src="/images/archive/example-${String(index + 1).padStart(2, '0')}.webp" alt="${safeAlt}" />`,
        `      <figcaption>${safeCaption}</figcaption>`,
        '    </figure>',
        '  </li>'
      ].join('\n');
    })
    .join('\n');

  return `<ul class="gallery">\n${items}\n</ul>\n\n`;
};

const insertSelectedBlock = (
  textarea: HTMLTextAreaElement,
  selected: string,
  fallbackAction: keyof typeof blockSnippets,
  createBlock: (selected: string) => string
) => {
  replaceSelectionWithBlock(textarea, selected ? createBlock(selected) : blockSnippets[fallbackAction]);
};

const insertCallout = (
  textarea: HTMLTextAreaElement,
  selected: string,
  type: 'note' | 'tip' | 'info' | 'warning'
) => {
  const fallbackAction = `callout-${type}` as const;
  insertSelectedBlock(
    textarea,
    selected,
    fallbackAction,
    (value) => `:::${type}[标题]\n${cleanSelectedBlock(value, '这里写提示内容。')}\n:::\n\n`
  );
};

const applyEditorAction = (textarea: HTMLTextAreaElement, action: string) => {
  const selected = getTextareaSelection(textarea).selected;

  switch (action) {
    case 'bold':
      wrapSelection(textarea, '**', '**', '文字');
      break;
    case 'italic':
      wrapSelection(textarea, '*', '*', '文字');
      break;
    case 'strike':
      wrapSelection(textarea, '~~', '~~', '文字');
      break;
    case 'code':
      wrapSelection(textarea, '`', '`', 'code');
      break;
    case 'quote':
      prefixLines(textarea, '> ');
      break;
    case 'list':
    case 'unordered-list':
      prefixLines(textarea, '- ');
      break;
    case 'ordered-list':
      prefixLinesByIndex(textarea, (index) => `${index + 1}. `);
      break;
    case 'task-list':
      prefixLines(textarea, '- [ ] ');
      break;
    case 'link':
      wrapSelection(textarea, '[', '](https://example.com)', '链接文字');
      break;
    case 'h2':
      prefixLines(textarea, '## ');
      break;
    case 'h3':
      prefixLines(textarea, '### ');
      break;
    case 'h4':
      prefixLines(textarea, '#### ');
      break;
    case 'callout-note':
      insertCallout(textarea, selected, 'note');
      break;
    case 'callout-tip':
      insertCallout(textarea, selected, 'tip');
      break;
    case 'callout-info':
      insertCallout(textarea, selected, 'info');
      break;
    case 'callout-warning':
      insertCallout(textarea, selected, 'warning');
      break;
    case 'codeblock':
      insertSelectedBlock(textarea, selected, 'codeblock', (value) => `\`\`\`\n${cleanSelectedBlock(value, 'code')}\n\`\`\`\n\n`);
      break;
    case 'table':
      insertSelectedBlock(textarea, selected, 'table', buildSelectedTable);
      break;
    case 'figure':
      insertSelectedBlock(textarea, selected, 'figure', (value) => {
        const caption = cleanSelectedBlock(value, '图注文字。');
        const safeCaption = escapeHtmlText(caption);
        const safeAlt = escapeHtmlAttribute(caption);
        return `<figure class="figure">\n  <img src="/images/archive/example.webp" alt="${safeAlt}" />\n  <figcaption class="figure-caption">${safeCaption}</figcaption>\n</figure>\n\n`;
      });
      break;
    case 'gallery':
      insertSelectedBlock(textarea, selected, 'gallery', buildSelectedGallery);
      break;
    case 'pullquote':
      insertSelectedBlock(textarea, selected, 'pullquote', (value) => `<blockquote class="pullquote">\n  ${cleanSelectedBlock(value, '这里写需要被突出展示的句子。')}\n  <cite>— 来源</cite>\n</blockquote>\n\n`);
      break;
    case 'hr':
      insertSelectedBlock(textarea, selected, 'hr', (value) => `${cleanSelectedBlock(value, '')}\n\n---\n\n`);
      break;
    default: {
      const snippet = getBlockSnippet(action);
      if (snippet) insertBlock(textarea, snippet);
      break;
    }
  }
};

export const initLongformDraft = (): void => {
  const root = query<HTMLElement>(document, '[data-longform-create-root]');
  if (!root || root.dataset.initialized === 'true') return;
  root.dataset.initialized = 'true';

  const endpoint = root.dataset.longformCreateEndpoint?.trim() ?? '';
  const editEndpoint = root.dataset.longformEditEndpoint?.trim() ?? '';
  const editCollection = root.dataset.longformEditCollection?.trim() ?? '';
  const editEntryId = root.dataset.longformEditId?.trim() ?? '';
  const form = query<HTMLFormElement>(root, '[data-longform-create-form]');
  const statusEl = query<HTMLElement>(root, '[data-longform-status]');
  const previewBtn = query<HTMLButtonElement>(root, '[data-longform-preview]');
  const submitBtn = query<HTMLButtonElement>(root, '[data-longform-submit]');
  const editSubmitBtn = query<HTMLButtonElement>(root, '[data-longform-edit-submit]');
  const resultWrap = query<HTMLElement>(root, '[data-longform-result]');
  const markdownEl = query<HTMLTextAreaElement>(root, '[data-longform-markdown]');
  const copyBtn = query<HTMLButtonElement>(root, '[data-longform-copy]');
  const publicLink = query<HTMLAnchorElement>(root, '[data-longform-public-link]');
  const titleEl = query<HTMLInputElement>(root, '[data-longform-field="title"]');
  const slugEl = query<HTMLInputElement>(root, '[data-longform-field="slug"]');
  const bodyEl = query<HTMLTextAreaElement>(root, '[data-longform-field="body"]');
  const authorInputEl = query<HTMLInputElement>(root, '[data-longform-author-input]');
  const authorAvatarEl = query<HTMLInputElement>(root, '[data-longform-field="authorAvatar"]');
  const authorShowAvatarEl = query<HTMLInputElement>(root, '[data-longform-field="authorShowAvatar"]');
  const authorListEl = query<HTMLUListElement>(root, '[data-longform-author-list]');
  const authorSuggestionsEl = query<HTMLElement>(root, '[data-longform-author-suggestions]');
  const translatorInputEl = query<HTMLInputElement>(root, '[data-longform-translator-input]');
  const translationTranslatorEl = query<HTMLInputElement>(root, '[data-longform-field="translationTranslator"]');
  const translationAvatarEl = query<HTMLInputElement>(root, '[data-longform-field="translationAvatar"]');
  const translationShowAvatarEl = query<HTMLInputElement>(root, '[data-longform-field="translationShowAvatar"]');
  const translatorListEl = query<HTMLUListElement>(root, '[data-longform-translator-list]');
  const translatorSuggestionsEl = query<HTMLElement>(root, '[data-longform-translator-suggestions]');

  if (!form || !bodyEl) return;

  let slugTouched = Boolean(slugEl?.value.trim());
  let lastMarkdown = '';
  let authorAvatarTouched = false;
  let translatorAvatarTouched = false;
  let personSelectionError = false;
  const authorLibrary = parseAuthorLibrary(root.dataset.authorLibrary);
  const authorByName = new Map(authorLibrary.map((author) => [getAuthorKey(author.name), author]));
  const selectedAuthors: DraftPerson[] = parseInitialPersonList(root.dataset.longformInitialAuthors);
  let selectedTranslator: DraftPerson | null = parseInitialPerson(root.dataset.longformInitialTranslator);

  const getText = (name: TextFieldName): string =>
    query<HTMLInputElement | HTMLTextAreaElement>(root, `[data-longform-field="${name}"]`)?.value.trim() ?? '';

  const getChecked = (name: CheckboxFieldName): boolean =>
    query<HTMLInputElement>(root, `[data-longform-field="${name}"]`)?.checked === true;

  const syncSlugFromTitle = () => {
    if (!slugEl || slugTouched) return;
    const suggested = slugifyAscii(titleEl?.value ?? '') || fallbackSlug(formatLocalDate());
    slugEl.value = suggested;
  };

  const normalizeSlugField = () => {
    if (!slugEl) return;
    slugEl.value = slugifyAscii(slugEl.value) || fallbackSlug(formatLocalDate());
  };

  const getLibraryPerson = (name: string): AuthorLibraryItem | undefined =>
    authorByName.get(getAuthorKey(name));

  const setInputExpanded = (input: HTMLInputElement | null, expanded: boolean) => {
    input?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  };

  const hideSuggestions = (input: HTMLInputElement | null, suggestionsEl: HTMLElement | null) => {
    if (suggestionsEl) suggestionsEl.hidden = true;
    setInputExpanded(input, false);
  };

  const hideAllSuggestions = () => {
    hideSuggestions(authorInputEl, authorSuggestionsEl);
    hideSuggestions(translatorInputEl, translatorSuggestionsEl);
  };

  const getSuggestionMatches = (queryText: string): AuthorLibraryItem[] => {
    const query = queryText.trim().toLocaleLowerCase();
    return authorLibrary
      .filter((author) => {
        if (!query) return true;
        return [
          author.name,
          author.avatar,
          author.source
        ].some((value) => value.toLocaleLowerCase().includes(query));
      })
      .slice(0, 8);
  };

  const renderSuggestions = ({
    input,
    suggestionsEl,
    type
  }: {
    input: HTMLInputElement | null;
    suggestionsEl: HTMLElement | null;
    type: 'author' | 'translator';
  }) => {
    if (!input || !suggestionsEl) return;

    const matches = getSuggestionMatches(input.value);
    suggestionsEl.replaceChildren();
    if (matches.length === 0) {
      hideSuggestions(input, suggestionsEl);
      return;
    }

    matches.forEach((author) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'admin-category-longform-create__suggestion';
      option.dataset.longformSuggestionType = type;
      option.dataset.longformSuggestionName = author.name;
      option.setAttribute('role', 'option');

      const title = document.createElement('strong');
      title.textContent = author.name;
      option.appendChild(title);

      const meta = document.createElement('span');
      meta.textContent = author.avatar ? `${author.source} / ${author.avatar}` : author.source || '无头像';
      option.appendChild(meta);

      suggestionsEl.appendChild(option);
    });

    suggestionsEl.hidden = false;
    setInputExpanded(input, true);
  };

  const applyPersonToFields = ({
    person,
    input,
    avatarInput,
    showAvatarInput,
    markAvatarClean
  }: {
    person: Pick<DraftPerson, 'name' | 'avatar' | 'showAvatar'>;
    input: HTMLInputElement | null;
    avatarInput: HTMLInputElement | null;
    showAvatarInput: HTMLInputElement | null;
    markAvatarClean: () => void;
  }) => {
    if (input) input.value = person.name;
    if (avatarInput) avatarInput.value = person.avatar;
    if (showAvatarInput) showAvatarInput.checked = person.showAvatar !== false;
    markAvatarClean();
  };

  const readPersonFromFields = ({
    input,
    avatarInput,
    showAvatarInput,
    label
  }: {
    input: HTMLInputElement | null;
    avatarInput: HTMLInputElement | null;
    showAvatarInput: HTMLInputElement | null;
    label: string;
  }): DraftPerson | null => {
    const rawName = input?.value.trim() ?? '';
    if (!rawName) return null;

    const libraryPerson = getLibraryPerson(rawName);
    if (!libraryPerson) {
      personSelectionError = true;
      setStatus(statusEl, `${label}请从作者库选择。`, 'error');
      input?.focus();
      return null;
    }

    return {
      name: libraryPerson.name,
      avatar: (avatarInput?.value.trim() ?? libraryPerson.avatar).trim(),
      showAvatar: showAvatarInput?.checked ?? libraryPerson.showAvatar ?? true
    };
  };

  const renderPersonList = ({
    listEl,
    people,
    removeType
  }: {
    listEl: HTMLUListElement | null;
    people: readonly DraftPerson[];
    removeType: 'author' | 'translator';
  }) => {
    if (!listEl) return;

    listEl.replaceChildren();
    listEl.hidden = people.length === 0;
    people.forEach((person, index) => {
      const item = document.createElement('li');
      item.className = 'admin-category-longform-create__author-chip';

      const content = document.createElement('span');
      content.className = 'admin-category-longform-create__author-chip-main';

      const name = document.createElement('strong');
      name.textContent = person.name;
      content.appendChild(name);

      const avatar = document.createElement('small');
      avatar.textContent = person.avatar ? person.avatar : '无头像';
      content.appendChild(avatar);
      item.appendChild(content);

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'admin-category-longform-create__author-remove';
      removeButton.dataset.longformRemovePerson = removeType;
      removeButton.dataset.longformRemoveIndex = String(index);
      removeButton.setAttribute('aria-label', `移除${removeType === 'author' ? '作者' : '译者'} ${person.name}`);
      removeButton.textContent = '移除';
      item.appendChild(removeButton);

      listEl.appendChild(item);
    });
  };

  const syncAuthorList = () => {
    const deduped = dedupePersons(selectedAuthors);
    selectedAuthors.splice(0, selectedAuthors.length, ...deduped);
    renderPersonList({
      listEl: authorListEl,
      people: selectedAuthors,
      removeType: 'author'
    });
  };

  const syncTranslator = () => {
    if (translationTranslatorEl) translationTranslatorEl.value = selectedTranslator?.name ?? '';
    if (translationAvatarEl && selectedTranslator) translationAvatarEl.value = selectedTranslator.avatar;
    if (translationShowAvatarEl && selectedTranslator) translationShowAvatarEl.checked = selectedTranslator.showAvatar !== false;
    renderPersonList({
      listEl: translatorListEl,
      people: selectedTranslator ? [selectedTranslator] : [],
      removeType: 'translator'
    });
  };

  const resetAuthorFields = () => {
    if (authorInputEl) authorInputEl.value = '';
    if (authorAvatarEl) authorAvatarEl.value = '';
    if (authorShowAvatarEl) authorShowAvatarEl.checked = true;
    authorAvatarTouched = false;
  };

  const commitAuthorInput = (): boolean => {
    const person = readPersonFromFields({
      input: authorInputEl,
      avatarInput: authorAvatarEl,
      showAvatarInput: authorShowAvatarEl,
      label: '作者'
    });
    if (!person) return false;

    const existingIndex = selectedAuthors.findIndex((author) => getAuthorKey(author.name) === getAuthorKey(person.name));
    if (existingIndex === -1) {
      selectedAuthors.push(person);
    } else {
      selectedAuthors[existingIndex] = person;
    }

    resetAuthorFields();
    syncAuthorList();
    return true;
  };

  const commitTranslatorInput = (): boolean => {
    const person = readPersonFromFields({
      input: translatorInputEl,
      avatarInput: translationAvatarEl,
      showAvatarInput: translationShowAvatarEl,
      label: '译者'
    });
    if (!person) return false;

    selectedTranslator = person;
    syncTranslator();
    return true;
  };

  const readPayload = (): LongformDraftPayload => {
    personSelectionError = false;
    commitAuthorInput();
    commitTranslatorInput();
    normalizeSlugField();
    if (selectedAuthors.length > 0) {
      const [firstAuthor] = selectedAuthors;
      if (firstAuthor) {
        firstAuthor.avatar = getText('authorAvatar');
        firstAuthor.showAvatar = getChecked('authorShowAvatar');
      }
    }
    if (selectedTranslator) {
      selectedTranslator.avatar = getText('translationAvatar');
      selectedTranslator.showAvatar = getChecked('translationShowAvatar');
    }
    return {
      title: getText('title'),
      slug: getText('slug'),
      description: getText('description'),
      date: getText('date') || formatLocalDate(),
      publishedAt: getText('publishedAt'),
      badge: getText('badge'),
      tags: getText('tags'),
      authors: selectedAuthors.map((author) => ({ ...author })),
      translationTranslator: selectedTranslator?.name ?? '',
      translationAvatar: selectedTranslator?.avatar ?? '',
      translationShowAvatar: selectedTranslator?.showAvatar ?? true,
      translationSource: getText('translationSource'),
      translationSourceUrl: getText('translationSourceUrl'),
      body: query<HTMLTextAreaElement>(root, '[data-longform-field="body"]')?.value ?? '',
      draft: getChecked('draft'),
      archive: getChecked('archive')
    };
  };

  const validatePayload = (payload: LongformDraftPayload): boolean => {
    if (personSelectionError) {
      return false;
    }
    if (!payload.title) {
      setStatus(statusEl, '请填写长文标题。', 'error');
      titleEl?.focus();
      return false;
    }
    if (!LONGFORM_SLUG_RE.test(payload.slug)) {
      setStatus(statusEl, 'slug 必须是小写 kebab-case。', 'error');
      slugEl?.focus();
      return false;
    }
    if (!payload.body.trim()) {
      setStatus(statusEl, '请填写正文内容。', 'error');
      bodyEl.focus();
      return false;
    }
    return true;
  };

  const createMarkdown = (): string | null => {
    const payload = readPayload();
    if (!validatePayload(payload)) return null;
    const markdown = buildMarkdown(payload);
    lastMarkdown = markdown;
    return markdown;
  };

  const readEditFields = (payload: LongformDraftPayload): Record<string, string | boolean> => ({
    title: payload.title,
    date: payload.date,
    publishedAt: payload.publishedAt,
    slug: payload.slug,
    badge: payload.badge,
    description: payload.description,
    tagsText: payload.tags,
    authorsText: payload.authors.map((author) => author.name).join('\n'),
    authorAvatar: payload.authors[0]?.avatar ?? '',
    authorShowAvatar: payload.authors[0]?.showAvatar ?? true,
    translationTranslator: payload.translationTranslator,
    translationAvatar: payload.translationAvatar,
    translationShowAvatar: payload.translationShowAvatar,
    translationSource: payload.translationSource,
    translationSourceUrl: payload.translationSourceUrl,
    body: payload.body,
    draft: payload.draft,
    archive: payload.archive
  });

  const saveEdit = async () => {
    clearStatus(statusEl);
    const payload = readPayload();
    if (!validatePayload(payload)) return;
    if (!editEndpoint || !editCollection || !editEntryId) {
      setStatus(statusEl, '当前页面缺少编辑接口。', 'error');
      return;
    }

    const revision = root.dataset.longformEditRevision?.trim() ?? '';
    if (!revision) {
      setStatus(statusEl, '缺少 revision，请重新打开当前条目。', 'error');
      return;
    }

    if (editSubmitBtn) {
      editSubmitBtn.disabled = true;
      editSubmitBtn.setAttribute('aria-busy', 'true');
    }
    setStatus(statusEl, '正在保存修改...');

    try {
      const response = await fetch(editEndpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          collection: editCollection,
          entryId: editEntryId,
          revision,
          fields: readEditFields(payload)
        })
      });
      const result = await parseResponseJson(response);

      if (!response.ok || !isRecord(result) || result.ok !== true) {
        const errors = getErrors(result);
        throw new Error(errors[0] ?? '保存长文失败');
      }

      const latestRevision = getPayloadString(result, 'revision');
      if (latestRevision) root.dataset.longformEditRevision = latestRevision;

      const relativePath = getResultString(result, 'relativePath');
      setStatus(statusEl, relativePath ? `已保存：${relativePath}` : '已保存长文修改。', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存长文失败';
      setStatus(statusEl, message, 'error');
    } finally {
      if (editSubmitBtn) {
        editSubmitBtn.disabled = false;
        editSubmitBtn.setAttribute('aria-busy', 'false');
      }
    }
  };

  form.addEventListener('input', () => {
    clearStatus(statusEl);
    hideResult({ resultWrap, markdownEl, publicLink });
  });

  titleEl?.addEventListener('input', syncSlugFromTitle);
  slugEl?.addEventListener('input', () => {
    slugTouched = true;
  });
  slugEl?.addEventListener('blur', normalizeSlugField);

  authorAvatarEl?.addEventListener('input', () => {
    authorAvatarTouched = true;
  });

  translationAvatarEl?.addEventListener('input', () => {
    translatorAvatarTouched = true;
    if (selectedTranslator) {
      selectedTranslator.avatar = translationAvatarEl.value.trim();
      syncTranslator();
    }
  });

  translationShowAvatarEl?.addEventListener('change', () => {
    if (selectedTranslator) {
      selectedTranslator.showAvatar = translationShowAvatarEl.checked;
      syncTranslator();
    }
  });

  const handlePersonInput = ({
    input,
    avatarInput,
    showAvatarInput,
    suggestionsEl,
    avatarTouched,
    markAvatarClean,
    type
  }: {
    input: HTMLInputElement | null;
    avatarInput: HTMLInputElement | null;
    showAvatarInput: HTMLInputElement | null;
    suggestionsEl: HTMLElement | null;
    avatarTouched: () => boolean;
    markAvatarClean: () => void;
    type: 'author' | 'translator';
  }) => {
    if (!input) return;
    const libraryPerson = getLibraryPerson(input.value);
    if (libraryPerson && !avatarTouched()) {
      applyPersonToFields({
        person: libraryPerson,
        input,
        avatarInput,
        showAvatarInput,
        markAvatarClean
      });
    }
    renderSuggestions({ input, suggestionsEl, type });
  };

  authorInputEl?.addEventListener('input', () => {
    handlePersonInput({
      input: authorInputEl,
      avatarInput: authorAvatarEl,
      showAvatarInput: authorShowAvatarEl,
      suggestionsEl: authorSuggestionsEl,
      avatarTouched: () => authorAvatarTouched,
      markAvatarClean: () => {
        authorAvatarTouched = false;
      },
      type: 'author'
    });
  });

  authorInputEl?.addEventListener('focus', () => {
    renderSuggestions({ input: authorInputEl, suggestionsEl: authorSuggestionsEl, type: 'author' });
  });

  translatorInputEl?.addEventListener('input', () => {
    handlePersonInput({
      input: translatorInputEl,
      avatarInput: translationAvatarEl,
      showAvatarInput: translationShowAvatarEl,
      suggestionsEl: translatorSuggestionsEl,
      avatarTouched: () => translatorAvatarTouched,
      markAvatarClean: () => {
        translatorAvatarTouched = false;
      },
      type: 'translator'
    });
  });

  translatorInputEl?.addEventListener('focus', () => {
    renderSuggestions({ input: translatorInputEl, suggestionsEl: translatorSuggestionsEl, type: 'translator' });
  });

  root.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;

    const option = event.target.closest<HTMLButtonElement>('[data-longform-suggestion-type][data-longform-suggestion-name]');
    if (option) {
      const person = getLibraryPerson(option.dataset.longformSuggestionName ?? '');
      const type = option.dataset.longformSuggestionType;
      if (person && type === 'author') {
        applyPersonToFields({
          person,
          input: authorInputEl,
          avatarInput: authorAvatarEl,
          showAvatarInput: authorShowAvatarEl,
          markAvatarClean: () => {
            authorAvatarTouched = false;
          }
        });
        hideAllSuggestions();
        clearStatus(statusEl);
        hideResult({ resultWrap, markdownEl, publicLink });
      }
      if (person && type === 'translator') {
        applyPersonToFields({
          person,
          input: translatorInputEl,
          avatarInput: translationAvatarEl,
          showAvatarInput: translationShowAvatarEl,
          markAvatarClean: () => {
            translatorAvatarTouched = false;
          }
        });
        hideAllSuggestions();
        clearStatus(statusEl);
        hideResult({ resultWrap, markdownEl, publicLink });
      }
      return;
    }

    const removeButton = event.target.closest<HTMLButtonElement>('[data-longform-remove-person][data-longform-remove-index]');
    if (removeButton) {
      const removeType = removeButton.dataset.longformRemovePerson;
      const index = Number.parseInt(removeButton.dataset.longformRemoveIndex ?? '', 10);
      if (removeType === 'author' && Number.isInteger(index)) {
        selectedAuthors.splice(index, 1);
        syncAuthorList();
      }
      if (removeType === 'translator') {
        selectedTranslator = null;
        if (translatorInputEl) translatorInputEl.value = '';
        if (translationTranslatorEl) translationTranslatorEl.value = '';
        if (translationAvatarEl) translationAvatarEl.value = '';
        if (translationShowAvatarEl) translationShowAvatarEl.checked = true;
        translatorAvatarTouched = false;
        syncTranslator();
      }
      clearStatus(statusEl);
      hideResult({ resultWrap, markdownEl, publicLink });
      return;
    }

    if (!event.target.closest('[data-longform-person-picker]')) {
      hideAllSuggestions();
    }
  });

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Node) || root.contains(event.target)) return;
    hideAllSuggestions();
  });

  authorInputEl?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    personSelectionError = false;
    const committed = commitAuthorInput();
    if (committed || !personSelectionError) clearStatus(statusEl);
    hideResult({ resultWrap, markdownEl, publicLink });
  });

  translatorInputEl?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    personSelectionError = false;
    const committed = commitTranslatorInput();
    hideAllSuggestions();
    if (committed || !personSelectionError) clearStatus(statusEl);
    hideResult({ resultWrap, markdownEl, publicLink });
  });

  query<HTMLButtonElement>(root, '[data-longform-add-author]')?.addEventListener('click', () => {
    personSelectionError = false;
    const committed = commitAuthorInput();
    hideAllSuggestions();
    if (committed || !personSelectionError) clearStatus(statusEl);
    hideResult({ resultWrap, markdownEl, publicLink });
  });

  query<HTMLButtonElement>(root, '[data-longform-set-translator]')?.addEventListener('click', () => {
    personSelectionError = false;
    const committed = commitTranslatorInput();
    hideAllSuggestions();
    if (committed || !personSelectionError) clearStatus(statusEl);
    hideResult({ resultWrap, markdownEl, publicLink });
  });

  syncAuthorList();
  syncTranslator();

  queryAll<HTMLButtonElement>(root, '[data-longform-action]').forEach((button) => {
    button.addEventListener('mousedown', (event) => {
      event.preventDefault();
    });

    button.addEventListener('click', () => {
      const action = button.dataset.longformAction?.trim() ?? '';
      if (!action) return;
      applyEditorAction(bodyEl, action);
      clearStatus(statusEl);
      hideResult({ resultWrap, markdownEl, publicLink });
    });
  });

  previewBtn?.addEventListener('click', () => {
    clearStatus(statusEl);
    const markdown = createMarkdown();
    if (!markdown) return;
    showResult({ resultWrap, markdownEl, publicLink, markdown });
    setStatus(statusEl, '已生成 Markdown 预览。', 'success');
  });

  editSubmitBtn?.addEventListener('click', () => {
    void saveEdit();
  });

  copyBtn?.addEventListener('click', async () => {
    const value = markdownEl?.value || lastMarkdown;
    if (!value) {
      setStatus(statusEl, '没有可复制的 Markdown。', 'error');
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setStatus(statusEl, '已复制 Markdown。', 'success');
    } catch {
      markdownEl?.focus();
      markdownEl?.select();
      setStatus(statusEl, '浏览器剪贴板不可用，已选中 Markdown。', 'error');
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearStatus(statusEl);
    const payload = readPayload();
    if (!validatePayload(payload)) return;
    const markdown = buildMarkdown(payload);
    lastMarkdown = markdown;
    showResult({ resultWrap, markdownEl, publicLink, markdown });

    if (!endpoint) {
      setStatus(statusEl, '当前页面缺少创建接口。', 'error');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.setAttribute('aria-busy', 'true');
    }
    setStatus(statusEl, '正在创建长文...');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ item: payload })
      });
      const result = await parseResponseJson(response);

      if (!response.ok || !isRecord(result) || result.ok !== true) {
        const errors = getErrors(result);
        throw new Error(errors[0] ?? '创建长文失败');
      }

      const relativePath = getResultString(result, 'relativePath');
      const publicHref = getResultString(result, 'publicHref');
      const serverSlug = getResultString(result, 'slug');
      if (serverSlug && slugEl) slugEl.value = serverSlug;
      showResult({ resultWrap, markdownEl, publicLink, markdown, publicHref });
      setStatus(statusEl, relativePath ? `已创建：${relativePath}` : '已创建长文。', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建长文失败';
      setStatus(statusEl, message, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.setAttribute('aria-busy', 'false');
      }
    }
  });
};
