<script lang="ts">
import type { AdminMaterialsEditorValues } from '../../../../lib/admin-console/content-editor-payload';
import { closeClosestAdminDetailsMenu } from '../../../../scripts/admin-content/details-menu';
import {
  CONTENT_LIST_DELETE_FEEDBACK_STORAGE_KEY,
  CONTENT_LIST_DELETE_FEEDBACK_VALUE
} from '../shared/content-list-feedback';
import {
  deleteContentEntry as requestContentDelete,
  saveContentEntry,
  type AdminContentIssue,
  type AdminContentWriteResult
} from '../shared/content-editor-client';
import {
  getContentEditorAdapter,
  isMaterialsEditorValues
} from '../shared/content-editor-adapters';
import AdminEditorIcon from '../shared/AdminEditorIcon.svelte';
import EditorFooterActions from '../shared/EditorFooterActions.svelte';
import {
  buildContentExportHref,
  type StatusState
} from '../shared/editor-shell-helpers';
import {
  ADMIN_EDITOR_DETAILS_MENU_SELECTORS
} from '../shared/editor-page-integration';
import { createEditorPageLifecycle } from '../shared/editor-page-lifecycle';
import type { MaterialsEditorIslandProps } from './materials-editor-island-props';

const PAGE_ACTIONS_HOST_SELECTOR = '[data-admin-editor-page-actions-host]';
const LEAVE_CONFIRM_MESSAGE = '当前内容尚未保存，确认离开此页面？';

let {
  endpoint,
  exportEndpoint,
  deleteEndpoint,
  returnHref,
  entryId,
  relativePath,
  revision,
  initialFrontmatter
}: MaterialsEditorIslandProps = $props();

const collection = 'materials' as const;
const editorAdapter = getContentEditorAdapter(collection);
const exportHref = $derived(buildContentExportHref(exportEndpoint, collection, entryId));

const cloneMaterialsValues = (values: AdminMaterialsEditorValues): AdminMaterialsEditorValues => editorAdapter.cloneValues(values);
const createInitialSnapshot = () => ({
  revision,
  frontmatter: cloneMaterialsValues(initialFrontmatter)
});

const initialSnapshot = createInitialSnapshot();

let topActionsEl = $state<HTMLDivElement | null>(null);
let editorShellEl = $state<HTMLElement | null>(null);
let currentRevision = $state(initialSnapshot.revision);
let baselineFrontmatter = $state(cloneMaterialsValues(initialSnapshot.frontmatter));
let frontmatter = $state(cloneMaterialsValues(initialSnapshot.frontmatter));
let busy = $state(false);
let statusState = $state<StatusState>('idle');
let statusText = $state('');
let errors = $state<string[]>([]);
let issues = $state<AdminContentIssue[]>([]);
let writeResult = $state<AdminContentWriteResult | null>(null);

const dirty = $derived(!editorAdapter.isEqualValues(frontmatter, baselineFrontmatter));
const canWriteContent = $derived(!busy && dirty);
const visibleWriteResult = $derived(!dirty ? writeResult : null);

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

const getFieldIssue = (path: string): string =>
  issues.find((issue) => issue.path === path)?.message ?? '';

const resetToBaseline = () => {
  frontmatter = cloneMaterialsValues(baselineFrontmatter);
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

const commitLatestValues = (latestValues: AdminMaterialsEditorValues | null) => {
  const nextValues = cloneMaterialsValues(latestValues ?? frontmatter);
  frontmatter = cloneMaterialsValues(nextValues);
  baselineFrontmatter = cloneMaterialsValues(nextValues);
};

const applyLatestBaseline = (latestValues: AdminMaterialsEditorValues | null) => {
  if (!isMaterialsEditorValues(latestValues)) return false;

  baselineFrontmatter = cloneMaterialsValues(latestValues);
  return true;
};

const requestContentWrite = async () => {
  busy = true;
  clearWriteFeedback();
  setStatus('loading', '正在保存资料');

  try {
    const saveOutcome = await saveContentEntry({
      endpoint,
      collection,
      entryId,
      revision: currentRevision,
      frontmatter
    });

    if (saveOutcome.revision && saveOutcome.responseOk) currentRevision = saveOutcome.revision;

    if (!saveOutcome.responseOk || !saveOutcome.payloadOk) {
      issues = saveOutcome.issues;
      const nextErrors = saveOutcome.errors.length > 0
        ? saveOutcome.errors
        : ['保存失败，请检查当前内容与磁盘状态'];
      if (saveOutcome.status === 409 && applyLatestBaseline(
        isMaterialsEditorValues(saveOutcome.latestValues) ? saveOutcome.latestValues : null
      )) {
        if (saveOutcome.revision) currentRevision = saveOutcome.revision;
        errors = [
          ...nextErrors,
          '已载入磁盘最新版本作为冲突基线，当前编辑内容仍保留。请核对后再次保存，或通过“还原更改”载入磁盘版本。'
        ];
        setStatus('warn', '检测到外部更新，草稿已保留');
        return;
      }

      errors = nextErrors;
      setStatus(saveOutcome.status === 409 ? 'warn' : 'error', saveOutcome.status === 409 ? '检测到外部更新' : '写入失败');
      return;
    }

    const result = saveOutcome.result;
    if (!result) {
      errors = ['响应体缺少 result 字段，请检查开发日志'];
      setStatus('error', '写入响应异常');
      return;
    }

    if (saveOutcome.revision) currentRevision = saveOutcome.revision;
    writeResult = result;
    commitLatestValues(isMaterialsEditorValues(saveOutcome.latestValues) ? saveOutcome.latestValues : null);
    setStatus(result.changed ? 'ok' : 'ready', result.changed ? '资料已保存' : '当前没有变更');
  } catch {
    errors = ['保存请求失败，请稍后重试'];
    setStatus('error', '保存请求失败');
  } finally {
    busy = false;
  }
};

const storeContentListDeleteFeedback = () => {
  try {
    window.sessionStorage.setItem(CONTENT_LIST_DELETE_FEEDBACK_STORAGE_KEY, CONTENT_LIST_DELETE_FEEDBACK_VALUE);
  } catch {
    // 删除后的列表反馈只改善返回体验，不影响删除主流程。
  }
};

const deleteContentEntry = async (event: MouseEvent) => {
  closeActionMenu(event.currentTarget);

  if (busy) {
    setStatus('warn', '操作进行中');
    return;
  }

  const confirmed = window.confirm([
    `确认删除《${editorAdapter.getDeleteTitle(frontmatter, entryId)}》？`,
    '',
    `源文件：${relativePath}`,
    ...(dirty ? ['', '当前未保存改动不会写入文件，删除会移动当前源文件。'] : []),
    '',
    '文件会移到 .trash/content/，之后可从回收站手动恢复。'
  ].join('\n'));
  if (!confirmed) return;

  busy = true;
  clearWriteFeedback();
  setStatus('loading', '正在移动到回收站');

  try {
    const deleteOutcome = await requestContentDelete({
      endpoint: deleteEndpoint,
      collection,
      entryId,
      revision: currentRevision,
      expectedRelativePath: relativePath
    });
    if (deleteOutcome.revision) currentRevision = deleteOutcome.revision;

    if (!deleteOutcome.responseOk || !deleteOutcome.payloadOk) {
      errors = deleteOutcome.errors;
      issues = deleteOutcome.issues;
      setStatus(deleteOutcome.status === 409 ? 'warn' : 'error', deleteOutcome.errors[0] ?? '删除失败');
      return;
    }

    const result = deleteOutcome.result;
    if (!result || !result.deleted || !result.trashedPath) {
      errors = ['删除响应异常，请检查开发日志'];
      issues = [];
      setStatus('error', '删除响应异常');
      return;
    }

    baselineFrontmatter = cloneMaterialsValues(frontmatter);
    storeContentListDeleteFeedback();
    window.location.assign(returnHref || '/admin/content/');
  } catch {
    errors = ['删除请求失败，请稍后重试'];
    issues = [];
    setStatus('error', '删除请求失败');
  } finally {
    busy = false;
  }
};

$effect(() => {
  return createEditorPageLifecycle({
    shellElement: editorShellEl,
    actionsElement: topActionsEl,
    pageActionsHostSelector: PAGE_ACTIONS_HOST_SELECTOR,
    onInlineSize: () => {},
    detailsMenuSelectors: ADMIN_EDITOR_DETAILS_MENU_SELECTORS,
    navigationGuard: {
      isDirty: () => dirty,
      message: LEAVE_CONFIRM_MESSAGE,
      onBlocked: () => {
        setStatus('warn', '请先保存或还原');
      }
    }
  });
});
</script>

<section class="admin-structured-editor admin-editor-shell" bind:this={editorShellEl} data-admin-materials-editor-workspace>
  <div class="admin-structured-editor__page-actions admin-editor-shell__actions" bind:this={topActionsEl}>
    <a class="admin-btn admin-btn--ghost admin-btn--compact admin-structured-editor__icon-btn" href={returnHref}>
      <AdminEditorIcon name="undo-2" />
      <span>返回</span>
    </a>
    <a class="admin-btn admin-btn--ghost admin-btn--compact admin-structured-editor__icon-btn" href={exportHref} download>
      <AdminEditorIcon name="download" />
      <span>下载</span>
    </a>
    <button class="admin-btn admin-btn--ghost admin-btn--compact admin-structured-editor__icon-btn" type="button" onclick={resetToBaseline} disabled={busy || !dirty}>
      <AdminEditorIcon name="rotate-ccw" />
      <span>还原</span>
    </button>
    <button class="admin-btn admin-btn--secondary admin-btn--compact admin-structured-editor__icon-btn" type="button" onclick={() => void requestContentWrite()} disabled={!canWriteContent}>
      <AdminEditorIcon name="check-mark" />
      <span>保存</span>
    </button>
    <button class="admin-btn admin-btn--danger admin-btn--compact admin-structured-editor__icon-btn" type="button" onclick={deleteContentEntry} disabled={busy}>
      <AdminEditorIcon name="trash" />
      <span>删除</span>
    </button>
  </div>

  <form class="admin-structured-editor__grid admin-structured-editor__grid--single" onsubmit={(event) => { event.preventDefault(); void requestContentWrite(); }}>
    <section class="admin-structured-editor__panel" aria-label="资料信息">
      <div class="admin-structured-editor__panel-head">
        <h2>资料信息</h2>
        {#if statusText}
          <p class="admin-status admin-status--inline" data-state={statusState} role="status" aria-live="polite" aria-atomic="true">{statusText}</p>
        {/if}
      </div>

      <label class="admin-structured-editor__field">
        <span>标题</span>
        <input class:admin-input--invalid={Boolean(getFieldIssue('title'))} type="text" bind:value={frontmatter.title} disabled={busy} oninput={markDirty} />
        <small>{getFieldIssue('title')}</small>
      </label>

      <label class="admin-structured-editor__field">
        <span>链接</span>
        <input class:admin-input--invalid={Boolean(getFieldIssue('href'))} type="url" bind:value={frontmatter.href} disabled={busy} oninput={markDirty} />
        <small>{getFieldIssue('href')}</small>
      </label>

      <div class="admin-structured-editor__columns">
        <label class="admin-structured-editor__field">
          <span>日期</span>
          <input class:admin-input--invalid={Boolean(getFieldIssue('date'))} type="text" bind:value={frontmatter.date} disabled={busy} oninput={markDirty} />
          <small>{getFieldIssue('date')}</small>
        </label>
        <label class="admin-structured-editor__field">
          <span>标签</span>
          <input class:admin-input--invalid={Boolean(getFieldIssue('label'))} type="text" bind:value={frontmatter.label} disabled={busy} oninput={markDirty} />
          <small>{getFieldIssue('label')}</small>
        </label>
      </div>

      <label class="admin-structured-editor__field">
        <span>描述</span>
        <textarea class:admin-input--invalid={Boolean(getFieldIssue('description'))} rows="5" bind:value={frontmatter.description} disabled={busy} oninput={markDirty}></textarea>
        <small>{getFieldIssue('description')}</small>
      </label>
    </section>

    <section class="admin-structured-editor__panel admin-structured-editor__panel--feedback" aria-label="保存反馈">
      {#if errors.length > 0}
        <div class="admin-structured-editor__alert" data-state="error">
          {#each errors as error}
            <p>{error}</p>
          {/each}
        </div>
      {/if}

      {#if visibleWriteResult}
        <div class="admin-structured-editor__alert" data-state={visibleWriteResult.changed ? 'ok' : 'ready'}>
          <p>{visibleWriteResult.changed ? '已写入字段' : '没有检测到变更'}</p>
          {#if visibleWriteResult.changedFields.length > 0}
            <p>{visibleWriteResult.changedFields.map(editorAdapter.getWriteFieldLabel).join('、')}</p>
          {/if}
        </div>
      {/if}
    </section>
  </form>

  <EditorFooterActions
    {statusText}
    {statusState}
    {busy}
    {dirty}
    {canWriteContent}
    onReset={resetToBaseline}
    onSave={requestContentWrite}
  />
</section>