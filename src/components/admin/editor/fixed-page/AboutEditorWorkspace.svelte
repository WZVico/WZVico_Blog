<script lang="ts">
import { closeClosestAdminDetailsMenu } from '../../../../scripts/admin-content/details-menu';
import EditorActionMenu from '../shared/EditorActionMenu.svelte';
import EditorFooterActions from '../shared/EditorFooterActions.svelte';
import {
  buildContentExportHref,
  type StatusState
} from '../shared/editor-shell-helpers';
import {
  saveContentEntry,
  type AdminContentIssue,
  type AdminContentWriteResult
} from '../shared/content-editor-client';
import type { AdminAboutEditorValues } from '../../../../lib/admin-console/content-about-shared';
import type { AboutEditorIslandProps } from './about-editor-island-props';

const PAGE_ACTIONS_HOST_SELECTOR = '[data-admin-editor-page-actions-host]';
const collection = 'about' as const;

type IntroLinePart = {
  text: string;
  href?: string;
};

let {
  endpoint,
  exportEndpoint,
  returnHref,
  entryId,
  revision,
  initialContent
}: AboutEditorIslandProps = $props();

const cloneContent = (value: AdminAboutEditorValues): AdminAboutEditorValues =>
  JSON.parse(JSON.stringify(value)) as AdminAboutEditorValues;

const serializeContent = (value: AdminAboutEditorValues): string =>
  JSON.stringify(value);

const exportHref = $derived(buildContentExportHref(exportEndpoint, collection, entryId));
let actionMenuElement = $state<HTMLDivElement | null>(null);
let currentRevision = $state(revision);
let baselineContent = $state(cloneContent(initialContent));
let content = $state(cloneContent(initialContent));
let busy = $state(false);
let statusState = $state<StatusState>('idle');
let statusText = $state('');
let errors = $state<string[]>([]);
let issues = $state<AdminContentIssue[]>([]);
let writeResult = $state<AdminContentWriteResult | null>(null);
const dirty = $derived(serializeContent(content) !== serializeContent(baselineContent));
const canWriteContent = $derived(!busy && dirty);
const visibleWriteResult = $derived(!dirty ? writeResult : null);

const parseIntroLineLinks = (line: string): IntroLinePart[] => {
  const parts: IntroLinePart[] = [];
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(line)) !== null) {
    if (match.index > cursor) {
      parts.push({ text: line.slice(cursor, match.index) });
    }

    const text = match[1] ?? '';
    const href = match[2];
    if (href) parts.push({ text, href });
    cursor = match.index + match[0].length;
  }

  if (cursor < line.length) {
    parts.push({ text: line.slice(cursor) });
  }

  return parts.length ? parts : [{ text: line }];
};

const setStatus = (state: StatusState, text: string) => {
  statusState = state;
  statusText = text;
};

const clearWriteFeedback = () => {
  errors = [];
  issues = [];
  writeResult = null;
};

const markDirty = () => {
  clearWriteFeedback();
  if (statusState === 'error' || statusState === 'warn') return;
  if (dirty) setStatus('idle', '');
};

const updateContent = (updater: (draft: AdminAboutEditorValues) => void) => {
  const next = cloneContent(content);
  updater(next);
  content = next;
  markDirty();
};

const getIntroLinesText = (): string => content.introLines.join('\n');

const updateIntroLines = (value: string) => {
  updateContent((draft) => {
    draft.introLines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  });
};

const updateGuideItem = (
  index: number,
  field: 'title' | 'href' | 'description',
  value: string
) => {
  updateContent((draft) => {
    const item = draft.guide.items[index];
    if (item) item[field] = value;
  });
};

const updateTechGroupTitle = (groupIndex: number, value: string) => {
  updateContent((draft) => {
    const group = draft.tech.groups[groupIndex];
    if (group) group.title = value;
  });
};

const updateTechItem = (
  groupIndex: number,
  itemIndex: number,
  field: 'title' | 'description',
  value: string
) => {
  updateContent((draft) => {
    const item = draft.tech.groups[groupIndex]?.items[itemIndex];
    if (item) item[field] = value;
  });
};

const updateFaqItem = (
  index: number,
  field: 'question' | 'answer',
  value: string
) => {
  updateContent((draft) => {
    const item = draft.faq.items[index];
    if (item) item[field] = value;
  });
};

const addFaqItem = () => {
  updateContent((draft) => {
    draft.faq.items.push({ question: '', answer: '' });
  });
};

const removeFaqItem = (index: number) => {
  updateContent((draft) => {
    draft.faq.items.splice(index, 1);
  });
};

const collectEmptyFields = (value: AdminAboutEditorValues): AdminContentIssue[] => {
  const found: AdminContentIssue[] = [];
  const requireText = (path: string, text: string, label: string) => {
    if (!text.trim()) found.push({ path, message: `请填写${label}` });
  };

  if (value.introLines.length === 0) found.push({ path: 'introLines', message: '请至少填写一行开头介绍' });
  value.introLines.forEach((line, index) => requireText(`introLines[${index}]`, line, `开头介绍第 ${index + 1} 行`));
  requireText('guide.title', value.guide.title, '栏目指引大标题');
  value.guide.items.forEach((item, index) => {
    requireText(`guide.items[${index}].title`, item.title, '栏目名');
    requireText(`guide.items[${index}].href`, item.href, '栏目路径文字');
    requireText(`guide.items[${index}].description`, item.description, '栏目说明');
  });
  requireText('tech.title', value.tech.title, '项目大标题');
  value.tech.groups.forEach((group, groupIndex) => {
    requireText(`tech.groups[${groupIndex}].title`, group.title, '分组标题');
    group.items.forEach((item, itemIndex) => {
      requireText(`tech.groups[${groupIndex}].items[${itemIndex}].title`, item.title, '项目名');
      requireText(`tech.groups[${groupIndex}].items[${itemIndex}].description`, item.description, '项目说明');
    });
  });
  requireText('faq.title', value.faq.title, '常见问题大标题');
  if (value.faq.items.length === 0) found.push({ path: 'faq.items', message: '请至少保留一个常见问题' });
  value.faq.items.forEach((item, index) => {
    requireText(`faq.items[${index}].question`, item.question, '问题');
    requireText(`faq.items[${index}].answer`, item.answer, '回答');
  });
  requireText('contact.title', value.contact.title, '联系区大标题');
  requireText('contact.note', value.contact.note, '联系区说明');
  return found;
};

const commitLatestContent = (latestValues: AdminAboutEditorValues | null) => {
  const nextContent = latestValues ? cloneContent(latestValues) : cloneContent(content);
  content = nextContent;
  baselineContent = cloneContent(nextContent);
};

const applyLatestContentBaseline = (latestValues: AdminAboutEditorValues | null) => {
  if (!latestValues) return false;
  baselineContent = cloneContent(latestValues);
  return true;
};

const resetToBaseline = () => {
  content = cloneContent(baselineContent);
  clearWriteFeedback();
  setStatus('idle', '');
};

const closeActionMenu = (target: EventTarget | null) => {
  if (target instanceof HTMLElement) {
    closeClosestAdminDetailsMenu(target, '.admin-editor-shell__action-more');
  }
};

const handleActionMenuReset = (event: MouseEvent) => {
  closeActionMenu(event.currentTarget);
  resetToBaseline();
};

const handleActionMenuDownload = (event: MouseEvent) => {
  closeActionMenu(event.currentTarget);
};

const requestContentWrite = async () => {
  const localIssues = collectEmptyFields(content);
  if (localIssues.length > 0) {
    issues = localIssues;
    errors = Array.from(new Set(localIssues.map((issue) => issue.message)));
    setStatus('error', '请补全空白内容');
    return;
  }

  busy = true;
  clearWriteFeedback();
  setStatus('loading', '正在保存 About 文案');

  try {
    const saveOutcome = await saveContentEntry({
      endpoint,
      collection,
      entryId,
      revision: currentRevision,
      frontmatter: cloneContent(content)
    });

    if (saveOutcome.revision && saveOutcome.responseOk) currentRevision = saveOutcome.revision;

    if (!saveOutcome.responseOk || !saveOutcome.payloadOk) {
      issues = saveOutcome.issues;
      const nextErrors = saveOutcome.errors.length > 0
        ? saveOutcome.errors
        : ['保存失败，请检查当前页面与磁盘状态'];
      if (saveOutcome.status === 409 && applyLatestContentBaseline(saveOutcome.latestValues as AdminAboutEditorValues | null)) {
        if (saveOutcome.revision) currentRevision = saveOutcome.revision;
        errors = [
          ...nextErrors,
          '已载入磁盘最新版本作为冲突基线，当前编辑内容仍保留。请核对后再次保存，或通过“还原更改”载入磁盘版本。'
        ];
        setStatus('warn', '检测到外部更新，草稿已保留');
        return;
      }

      errors = nextErrors;
      setStatus(saveOutcome.status === 409 ? 'warn' : 'error', saveOutcome.status === 409 ? '检测到外部更新' : '保存失败');
      return;
    }

    const result = saveOutcome.result;
    if (!result) {
      errors = ['响应体缺少 result 字段，请检查开发日志'];
      setStatus('error', '写入响应异常');
      return;
    }

    writeResult = result;
    commitLatestContent(saveOutcome.latestValues as AdminAboutEditorValues | null);
    setStatus(result.changed ? 'ok' : 'ready', result.changed ? 'About 文案已保存' : '当前没有变更');
  } catch {
    errors = ['保存请求失败，请稍后重试'];
    setStatus('error', '保存请求失败');
  } finally {
    busy = false;
  }
};

$effect(() => {
  const host = document.querySelector<HTMLElement>(PAGE_ACTIONS_HOST_SELECTOR);
  if (!host || !actionMenuElement) return;
  host.replaceChildren(actionMenuElement);

  return () => {
    if (host.contains(actionMenuElement)) host.replaceChildren();
  };
});
</script>

<section class="admin-about-editor admin-about-structured-editor" data-admin-about-editor-workspace>
  <div class="admin-about-editor__actions" bind:this={actionMenuElement}>
    <EditorActionMenu
      {statusText}
      {statusState}
      {canWriteContent}
      {busy}
      {dirty}
      {returnHref}
      {exportHref}
      actionLabel="页面操作"
      moreLabel="更多页面操作"
      saveLabel="保存 About 文案"
      resetLabel="还原更改"
      downloadLabel="导出源 JSON"
      showDelete={false}
      onSave={requestContentWrite}
      onReset={handleActionMenuReset}
      onDownload={handleActionMenuDownload}
    />
  </div>

  <div class="admin-about-editor__workspace">
    <form class="admin-about-editor__form" onsubmit={(event) => { event.preventDefault(); void requestContentWrite(); }}>
      <article class="admin-about-editor__block">
        <div class="admin-about-editor__block-head">
          <h3>开头介绍</h3>
        </div>
        <label class="admin-about-editor__field admin-about-editor__field--full">
          <span>介绍文字</span>
          <textarea
            class="admin-field__control"
            rows="3"
            value={getIntroLinesText()}
            oninput={(event) => updateIntroLines(event.currentTarget.value)}
          ></textarea>
        </label>
      </article>

      <article class="admin-about-editor__block">
        <div class="admin-about-editor__block-head">
          <label class="admin-about-editor__field admin-about-editor__field--section-title">
            <span>栏目指引大标题</span>
            <input
              class="admin-field__control"
              type="text"
              value={content.guide.title}
              oninput={(event) => updateContent((draft) => { draft.guide.title = event.currentTarget.value; })}
            />
          </label>
        </div>
        <div class="admin-about-editor__rows">
          {#each content.guide.items as item, index}
            <article class="admin-about-editor__row">
              <label class="admin-about-editor__field admin-about-editor__field--title">
                <span>栏目名</span>
                <input class="admin-field__control" type="text" value={item.title} oninput={(event) => updateGuideItem(index, 'title', event.currentTarget.value)} />
              </label>
              <label class="admin-about-editor__field admin-about-editor__field--path">
                <span>路径文字</span>
                <input class="admin-field__control" type="text" value={item.href} oninput={(event) => updateGuideItem(index, 'href', event.currentTarget.value)} />
              </label>
              <label class="admin-about-editor__field admin-about-editor__field--description">
                <span>说明</span>
                <textarea class="admin-field__control" rows="2" value={item.description} oninput={(event) => updateGuideItem(index, 'description', event.currentTarget.value)}></textarea>
              </label>
            </article>
          {/each}
        </div>
      </article>

      <article class="admin-about-editor__block">
        <div class="admin-about-editor__block-head">
          <label class="admin-about-editor__field admin-about-editor__field--section-title">
            <span>项目大标题</span>
            <input
              class="admin-field__control"
              type="text"
              value={content.tech.title}
              oninput={(event) => updateContent((draft) => { draft.tech.title = event.currentTarget.value; })}
            />
          </label>
        </div>
        <div class="admin-about-editor__rows">
          {#each content.tech.groups as group, groupIndex}
            <article class="admin-about-editor__group">
              <label class="admin-about-editor__field admin-about-editor__field--full">
                <span>分组标题</span>
                <input class="admin-field__control" type="text" value={group.title} oninput={(event) => updateTechGroupTitle(groupIndex, event.currentTarget.value)} />
              </label>
              {#each group.items as item, itemIndex}
                <article class="admin-about-editor__row">
                  <label class="admin-about-editor__field admin-about-editor__field--title">
                    <span>项目名</span>
                    <input class="admin-field__control" type="text" value={item.title} oninput={(event) => updateTechItem(groupIndex, itemIndex, 'title', event.currentTarget.value)} />
                  </label>
                  <label class="admin-about-editor__field admin-about-editor__field--description">
                    <span>说明</span>
                    <textarea class="admin-field__control" rows="2" value={item.description} oninput={(event) => updateTechItem(groupIndex, itemIndex, 'description', event.currentTarget.value)}></textarea>
                  </label>
                </article>
              {/each}
            </article>
          {/each}
        </div>
      </article>

      <article class="admin-about-editor__block">
        <div class="admin-about-editor__block-head admin-about-editor__block-head--split">
          <label class="admin-about-editor__field admin-about-editor__field--section-title">
            <span>常见问题大标题</span>
            <input
              class="admin-field__control"
              type="text"
              value={content.faq.title}
              oninput={(event) => updateContent((draft) => { draft.faq.title = event.currentTarget.value; })}
            />
          </label>
          <button class="admin-btn admin-btn--secondary admin-btn--compact" type="button" onclick={addFaqItem}>添加问答</button>
        </div>
        <div class="admin-about-editor__rows">
          {#each content.faq.items as item, index}
            <article class="admin-about-editor__row admin-about-editor__row--faq">
              <label class="admin-about-editor__field admin-about-editor__field--title">
                <span>问题</span>
                <input class="admin-field__control" type="text" value={item.question} oninput={(event) => updateFaqItem(index, 'question', event.currentTarget.value)} />
              </label>
              <label class="admin-about-editor__field admin-about-editor__field--full">
                <span>回答</span>
                <textarea class="admin-field__control" rows="3" value={item.answer} oninput={(event) => updateFaqItem(index, 'answer', event.currentTarget.value)}></textarea>
              </label>
              <button class="admin-btn admin-btn--ghost admin-btn--compact admin-about-editor__remove" type="button" onclick={() => removeFaqItem(index)}>删除</button>
            </article>
          {/each}
        </div>
      </article>

      <article class="admin-about-editor__block">
        <div class="admin-about-editor__block-head">
          <h3>联系与订阅</h3>
        </div>
        <div class="admin-about-editor__row">
          <label class="admin-about-editor__field admin-about-editor__field--title">
            <span>联系区大标题</span>
            <input class="admin-field__control" type="text" value={content.contact.title} oninput={(event) => updateContent((draft) => { draft.contact.title = event.currentTarget.value; })} />
          </label>
          <label class="admin-about-editor__field admin-about-editor__field--description">
            <span>联系区说明</span>
            <textarea class="admin-field__control" rows="3" value={content.contact.note} oninput={(event) => updateContent((draft) => { draft.contact.note = event.currentTarget.value; })}></textarea>
          </label>
        </div>
      </article>
    </form>

    <aside class="admin-about-editor__preview" aria-label="About preview">
      <article class="admin-about-editor__preview-page about-body">
        <div class="page-header page-header--about admin-about-preview__header">
          <div class="page-heading">
            <h1 class="page-title">关于</h1>
          </div>
        </div>
        <p class="about-intro-line">
          {#each content.introLines as line}
            {#each parseIntroLineLinks(line) as part}
              {#if part.href}
                <a href={part.href} target="_blank" rel="noreferrer">{part.text}</a>
              {:else}
                {part.text}
              {/if}
            {/each}
            <br />
          {/each}
        </p>
        <h2 class="section-title about-section-title">{content.guide.title}</h2>
        <div class="site-guide">
          {#each content.guide.items as item}
            <article class="site-guide-item">
              <div class="site-guide-head">
                <h3 class="site-guide-title">{item.title}</h3>
                <span class="site-guide-link">{item.href}</span>
              </div>
              <p class="site-guide-desc">{item.description}</p>
            </article>
          {/each}
        </div>

        <h2 class="section-title about-section-title">{content.tech.title}</h2>
        <div class="tech-stack">
          {#each content.tech.groups as group}
            <section class="tech-group">
              <div class="tech-group-title">{group.title}</div>
              <ul class="tech-list">
                {#each group.items as item}
                  <li class="tech-item">
                    <div class="tech-item-head">
                      <span class="tech-item-title">{item.title}</span>
                    </div>
                    <div class="tech-item-desc">{item.description}</div>
                  </li>
                {/each}
              </ul>
            </section>
          {/each}
        </div>

        <h2 class="section-title about-section-title">{content.faq.title}</h2>
        <section class="qa-list" aria-label={content.faq.title}>
          {#each content.faq.items as item}
            <details class="qa-item">
              <summary class="qa-question"><span class="qa-icon" aria-hidden="true">Q</span>{item.question}</summary>
              <p class="qa-answer">{item.answer}</p>
            </details>
          {/each}
        </section>

        <h2 class="section-title about-section-title">{content.contact.title}</h2>
        <section class="contact-block" aria-label="联系方式">
          <p class="contact-note">{content.contact.note}</p>
        </section>
      </article>
    </aside>
  </div>

  {#if errors.length > 0 || issues.length > 0 || visibleWriteResult}
    <div class="admin-about-editor__feedback" aria-live="polite">
      {#each errors as error}
        <p class="admin-about-editor__error">{error}</p>
      {/each}
      {#if visibleWriteResult}
        <p class="admin-about-editor__saved">已写入：{visibleWriteResult.relativePath}</p>
      {/if}
    </div>
  {/if}

  <EditorFooterActions
    {statusText}
    {statusState}
    {busy}
    {dirty}
    {canWriteContent}
    saveLabel="保存 About 文案"
    onReset={resetToBaseline}
    onSave={requestContentWrite}
  />
</section>
