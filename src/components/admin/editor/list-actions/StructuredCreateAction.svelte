<script lang="ts">
import { onMount } from 'svelte';
import { createModalDialogFocusController } from '../../../../scripts/admin-console/modal-dialog-focus';
import type {
  AdminContentEditorPayload,
  AdminMaterialsEditorPayload,
  AdminMaterialsEditorValues,
  AdminPicksEditorPayload,
  AdminPicksEditorValues
} from '../../../../lib/admin-console/content-editor-payload';
import AdminEditorIcon from '../shared/AdminEditorIcon.svelte';
import type { AdminStatusFeedbackOptions, StatusState } from './content-action-feedback';
import { dispatchAdminContentStatus } from './content-action-status-events';
import {
  createContentEntry,
  loadContentEntry,
  saveContentEntry,
  type AdminContentIssue
} from '../shared/content-editor-client';
import {
  CONTENT_LIST_ACTION_FEEDBACK_CREATED,
  CONTENT_LIST_ACTION_FEEDBACK_SAVED,
  storeContentListActionFeedback
} from '../shared/content-list-feedback';

type Props = {
  base?: string;
  endpoint: string;
  createEndpoint: string;
};

type StructuredCreateCollection = 'picks' | 'materials';
type DialogMode = 'create' | 'edit';

const PICKS_CREATE_TRIGGER_SELECTOR = '[data-admin-content-picks-create-action]';
const PICKS_EDIT_TRIGGER_SELECTOR = '[data-admin-content-picks-edit-action]';
const MATERIALS_CREATE_TRIGGER_SELECTOR = '[data-admin-content-materials-create-action]';
const MATERIALS_EDIT_TRIGGER_SELECTOR = '[data-admin-content-materials-edit-action]';

let { endpoint, createEndpoint }: Props = $props();

let open = $state(false);
let busy = $state(false);
let dialogMode = $state<DialogMode>('create');
let collection = $state<StructuredCreateCollection>('picks');
let createActionLabel = $state('新建内容');
let selectedEntryId = $state('');
let revision = $state('');
let dateValue = $state('');
let yearValue = $state('');
let slugValue = $state('');
let draftValue = $state(false);
let titleValue = $state('');
let statusValue = $state<'shared' | 'planned'>('shared');
let authorsValue = $state('');
let reasonValue = $state('');
let tagsValue = $state('');
let hrefValue = $state('');
let labelValue = $state('');
let descriptionValue = $state('');
let baselineMaterialsValue = $state<AdminMaterialsEditorValues | null>(null);
let baselinePicksValue = $state<AdminPicksEditorValues | null>(null);
let baselinePicksBody = $state('');
let issues = $state<AdminContentIssue[]>([]);
let panelEl = $state<HTMLElement | null>(null);
let firstInputEl = $state<HTMLInputElement | null>(null);
let closeButtonEl = $state<HTMLButtonElement | null>(null);

const isPicks = $derived(collection === 'picks');
const dialogTitle = $derived(dialogMode === 'edit' ? (isPicks ? '编辑拾选' : '编辑资料') : createActionLabel);
const closeLabel = $derived(`关闭${dialogTitle}`);
const materialsDirty = $derived(
  !baselineMaterialsValue
  || titleValue !== baselineMaterialsValue.title
  || hrefValue !== baselineMaterialsValue.href
  || labelValue !== baselineMaterialsValue.label
  || descriptionValue !== baselineMaterialsValue.description
);
const getEffectivePicksBody = (): string => statusValue === 'planned' ? '' : reasonValue;
const getBaselinePicksBody = (values: AdminPicksEditorValues, bodyText: string): string =>
  values.status === 'planned' ? '' : bodyText;
const picksDirty = $derived(
  !baselinePicksValue
  || titleValue !== baselinePicksValue.title
  || dateValue !== baselinePicksValue.date
  || yearValue !== baselinePicksValue.year
  || statusValue !== baselinePicksValue.status
  || authorsValue !== baselinePicksValue.authorsText
  || tagsValue !== baselinePicksValue.tagsText
  || draftValue !== baselinePicksValue.draft
  || slugValue !== baselinePicksValue.slug
  || getEffectivePicksBody() !== baselinePicksBody
);
const canSubmit = $derived(
  !busy
  && titleValue.trim().length > 0
  && (
    collection === 'materials'
      ? hrefValue.trim().length > 0 && (dialogMode === 'create' || materialsDirty)
      : (statusValue === 'planned' || reasonValue.trim().length > 0) && (dialogMode === 'create' || picksDirty)
  )
);

const clearStatus = () => {
  dispatchAdminContentStatus('idle', '');
};

const setStatus = (
  state: StatusState,
  text: string,
  options: AdminStatusFeedbackOptions = {}
) => {
  dispatchAdminContentStatus(state, text, options);
};

const getIssue = (...paths: string[]): string =>
  issues.find((issue) => paths.includes(issue.path))?.message ?? '';

const resetFields = () => {
  titleValue = '';
  statusValue = 'shared';
  authorsValue = '';
  reasonValue = '';
  tagsValue = '';
  hrefValue = '';
  labelValue = '';
  descriptionValue = '';
  dateValue = '';
  yearValue = '';
  slugValue = '';
  draftValue = false;
  revision = '';
  selectedEntryId = '';
  baselineMaterialsValue = null;
  baselinePicksValue = null;
  baselinePicksBody = '';
  issues = [];
};

const closeDialog = () => {
  if (busy) return;

  open = false;
  resetFields();
  clearStatus();
  dialogFocus.restoreFocus();
};

const dialogFocus = createModalDialogFocusController({
  getDialog: () => panelEl,
  getInitialFocus: () => firstInputEl ?? closeButtonEl,
  onClose: closeDialog
});

const openCreateDialog = (trigger: HTMLElement, nextCollection: StructuredCreateCollection) => {
  if (busy) {
    setStatus('warn', '操作进行中');
    return;
  }

  collection = nextCollection;
  dialogMode = 'create';
  createActionLabel = trigger.dataset.createActionLabel?.trim() || '新建内容';
  resetFields();
  clearStatus();
  dialogFocus.captureReturnFocus(trigger);
  open = true;
};

const isPicksPayload = (payload: AdminContentEditorPayload | null): payload is AdminPicksEditorPayload =>
  Boolean(payload && payload.collection === 'picks');

const isPicksValues = (value: unknown): value is AdminPicksEditorValues =>
  Boolean(
    value
    && typeof value === 'object'
    && 'title' in value
    && 'date' in value
    && 'year' in value
    && 'status' in value
    && 'authorsText' in value
    && 'tagsText' in value
    && 'draft' in value
    && 'slug' in value
  );

const setPicksFields = (values: AdminPicksEditorValues, bodyText: string) => {
  titleValue = values.title;
  dateValue = values.date;
  yearValue = values.year;
  statusValue = values.status;
  authorsValue = values.authorsText;
  reasonValue = bodyText;
  tagsValue = values.tagsText;
  draftValue = values.draft;
  slugValue = values.slug;
};

const getPicksValues = (): AdminPicksEditorValues => ({
  title: titleValue,
  date: dateValue,
  year: yearValue,
  status: statusValue,
  authorsText: authorsValue,
  tagsText: tagsValue,
  draft: draftValue,
  slug: slugValue
});

const openPicksEditDialog = async (trigger: HTMLElement) => {
  if (busy) {
    setStatus('warn', '操作进行中');
    return;
  }

  const entryId = trigger.dataset.entryId?.trim() ?? '';
  if (!entryId) {
    setStatus('error', '拾选信息不完整，请刷新后重试');
    return;
  }

  resetFields();
  collection = 'picks';
  dialogMode = 'edit';
  createActionLabel = '编辑拾选';
  selectedEntryId = entryId;
  clearStatus();
  dialogFocus.captureReturnFocus(trigger);
  open = true;
  busy = true;
  setStatus('loading', '正在加载拾选');

  try {
    const outcome = await loadContentEntry({
      endpoint,
      collection: 'picks',
      entryId
    });
    const payload = outcome.payload;

    if (!outcome.responseOk || !outcome.payloadOk || !isPicksPayload(payload)) {
      issues = outcome.issues;
      open = false;
      setStatus('error', outcome.errors.length > 0 ? '加载拾选失败' : '加载响应异常，请检查开发日志');
      return;
    }

    selectedEntryId = payload.entryId;
    revision = payload.revision;
    baselinePicksValue = { ...payload.values };
    baselinePicksBody = getBaselinePicksBody(payload.values, payload.bodyText);
    setPicksFields(payload.values, payload.bodyText);
    clearStatus();
  } catch {
    open = false;
    setStatus('error', '加载拾选失败，请稍后重试');
  } finally {
    busy = false;
  }
};
const isMaterialsPayload = (payload: AdminContentEditorPayload | null): payload is AdminMaterialsEditorPayload =>
  Boolean(payload && payload.collection === 'materials');

const isMaterialsValues = (value: unknown): value is AdminMaterialsEditorValues =>
  Boolean(
    value
    && typeof value === 'object'
    && 'title' in value
    && 'href' in value
    && 'date' in value
    && 'label' in value
    && 'description' in value
  );

const setMaterialsFields = (values: AdminMaterialsEditorValues) => {
  titleValue = values.title;
  hrefValue = values.href;
  dateValue = values.date;
  labelValue = values.label;
  descriptionValue = values.description;
};

const getMaterialsValues = (): AdminMaterialsEditorValues => ({
  title: titleValue,
  href: hrefValue,
  date: dateValue,
  label: labelValue,
  description: descriptionValue
});

const openMaterialsEditDialog = async (trigger: HTMLElement) => {
  if (busy) {
    setStatus('warn', '操作进行中');
    return;
  }

  const entryId = trigger.dataset.entryId?.trim() ?? '';
  if (!entryId) {
    setStatus('error', '资料信息不完整，请刷新后重试');
    return;
  }

  resetFields();
  collection = 'materials';
  dialogMode = 'edit';
  createActionLabel = '编辑资料';
  selectedEntryId = entryId;
  clearStatus();
  dialogFocus.captureReturnFocus(trigger);
  open = true;
  busy = true;
  setStatus('loading', '正在加载资料');

  try {
    const outcome = await loadContentEntry({
      endpoint,
      collection: 'materials',
      entryId
    });
    const payload = outcome.payload;

    if (!outcome.responseOk || !outcome.payloadOk || !isMaterialsPayload(payload)) {
      issues = outcome.issues;
      open = false;
      setStatus('error', outcome.errors.length > 0 ? '加载资料失败' : '加载响应异常，请检查开发日志');
      return;
    }

    selectedEntryId = payload.entryId;
    revision = payload.revision;
    baselineMaterialsValue = { ...payload.values };
    setMaterialsFields(payload.values);
    clearStatus();
  } catch {
    open = false;
    setStatus('error', '加载资料失败，请稍后重试');
  } finally {
    busy = false;
  }
};

const saveMaterialsEdit = async () => {
  if (!canSubmit || busy || !selectedEntryId || !revision) return;

  busy = true;
  issues = [];
  setStatus('loading', '正在保存资料');

  try {
    const outcome = await saveContentEntry({
      endpoint,
      collection: 'materials',
      entryId: selectedEntryId,
      revision,
      frontmatter: getMaterialsValues()
    });

    if (outcome.revision && outcome.responseOk) revision = outcome.revision;

    if (!outcome.responseOk || !outcome.payloadOk) {
      issues = outcome.issues;
      setStatus(outcome.status === 409 ? 'warn' : 'error', outcome.status === 409 ? '检测到外部更新' : '保存资料失败');
      return;
    }

    if (isMaterialsValues(outcome.latestValues)) {
      baselineMaterialsValue = { ...outcome.latestValues };
      setMaterialsFields(outcome.latestValues);
    }

    if (outcome.result?.changed) {
      storeContentListActionFeedback(CONTENT_LIST_ACTION_FEEDBACK_SAVED);
      setStatus('ok', '已保存资料');
      window.location.reload();
      return;
    }

    setStatus('ready', '没有变化', { autoClear: true });
  } catch {
    setStatus('error', '保存资料失败，请稍后重试');
  } finally {
    busy = false;
  }
};

const savePicksEdit = async () => {
  if (!canSubmit || busy || !selectedEntryId || !revision) return;

  busy = true;
  issues = [];
  setStatus('loading', '正在保存拾选');

  try {
    const outcome = await saveContentEntry({
      endpoint,
      collection: 'picks',
      entryId: selectedEntryId,
      revision,
      frontmatter: getPicksValues(),
      body: getEffectivePicksBody()
    });

    if (outcome.revision && outcome.responseOk) revision = outcome.revision;

    if (!outcome.responseOk || !outcome.payloadOk) {
      issues = outcome.issues;
      setStatus(outcome.status === 409 ? 'warn' : 'error', outcome.status === 409 ? '检测到外部更新' : '保存拾选失败');
      return;
    }

    if (isPicksValues(outcome.latestValues)) {
      const latestBody = typeof outcome.latestBody === 'string' ? outcome.latestBody : getEffectivePicksBody();
      baselinePicksValue = { ...outcome.latestValues };
      baselinePicksBody = getBaselinePicksBody(outcome.latestValues, latestBody);
      setPicksFields(outcome.latestValues, latestBody);
    }

    if (outcome.result?.changed) {
      storeContentListActionFeedback(CONTENT_LIST_ACTION_FEEDBACK_SAVED);
      setStatus('ok', '已保存拾选');
      window.location.reload();
      return;
    }

    setStatus('ready', '没有变化', { autoClear: true });
  } catch {
    setStatus('error', '保存拾选失败，请稍后重试');
  } finally {
    busy = false;
  }
};
const saveCreate = async () => {
  if (!canSubmit || busy) return;

  if (dialogMode === 'edit') {
    if (collection === 'picks') {
      await savePicksEdit();
    } else {
      await saveMaterialsEdit();
    }
    return;
  }

  busy = true;
  issues = [];
  setStatus('loading', '正在创建');

  try {
    const outcome = collection === 'picks'
      ? await createContentEntry({
          endpoint: createEndpoint,
          collection: 'picks',
          frontmatter: {
            title: titleValue,
            status: statusValue,
            authorsText: authorsValue,
            reason: reasonValue,
            tagsText: tagsValue
          }
        })
      : await createContentEntry({
          endpoint: createEndpoint,
          collection: 'materials',
          frontmatter: {
            title: titleValue,
            href: hrefValue,
            label: labelValue,
            description: descriptionValue
          }
        });

    if (!outcome.responseOk || !outcome.payloadOk) {
      issues = outcome.issues;
      setStatus('error', outcome.errors.length > 0 ? '创建失败' : '创建响应异常，请检查开发日志');
      return;
    }

    if (collection === 'materials') {
      storeContentListActionFeedback(CONTENT_LIST_ACTION_FEEDBACK_CREATED);
      setStatus('ok', '已创建资料');
      window.location.reload();
      return;
    }

    storeContentListActionFeedback(CONTENT_LIST_ACTION_FEEDBACK_CREATED);
    setStatus('ok', '已创建拾选');
    window.location.reload();
  } catch {
    setStatus('error', '创建请求失败，请稍后重试');
  } finally {
    busy = false;
  }
};

const handleClick = (event: MouseEvent) => {
  if (!(event.target instanceof Element)) return;

  const materialsEditTrigger = event.target.closest<HTMLElement>(MATERIALS_EDIT_TRIGGER_SELECTOR);
  if (materialsEditTrigger) {
    event.preventDefault();
    void openMaterialsEditDialog(materialsEditTrigger);
    return;
  }

  const picksEditTrigger = event.target.closest<HTMLElement>(PICKS_EDIT_TRIGGER_SELECTOR);
  if (picksEditTrigger) {
    event.preventDefault();
    void openPicksEditDialog(picksEditTrigger);
    return;
  }

  const picksTrigger = event.target.closest<HTMLElement>(PICKS_CREATE_TRIGGER_SELECTOR);
  if (picksTrigger) {
    event.preventDefault();
    openCreateDialog(picksTrigger, 'picks');
    return;
  }

  const materialsTrigger = event.target.closest<HTMLElement>(MATERIALS_CREATE_TRIGGER_SELECTOR);
  if (materialsTrigger) {
    event.preventDefault();
    openCreateDialog(materialsTrigger, 'materials');
  }
};

onMount(() => {
  document.addEventListener('click', handleClick);
  return () => {
    document.removeEventListener('click', handleClick);
  };
});

$effect(() => {
  document.querySelectorAll<HTMLButtonElement>(`${PICKS_CREATE_TRIGGER_SELECTOR}, ${PICKS_EDIT_TRIGGER_SELECTOR}, ${MATERIALS_CREATE_TRIGGER_SELECTOR}, ${MATERIALS_EDIT_TRIGGER_SELECTOR}`).forEach((button) => {
    button.disabled = busy;
  });
});

$effect(() => {
  if (!open) return;

  dialogFocus.focusInitial();
  document.addEventListener('keydown', dialogFocus.handleKeydown);
  return () => {
    document.removeEventListener('keydown', dialogFocus.handleKeydown);
  };
});
</script>

{#if open}
  <div class="admin-modal admin-editor-frontmatter-popover admin-content-structured-create-dialog" role="presentation">
    <button
      class="admin-modal__backdrop admin-editor-frontmatter-popover__backdrop"
      type="button"
      aria-label={closeLabel}
      onclick={closeDialog}
    ></button>
    <div
      bind:this={panelEl}
      class="admin-modal__panel admin-editor-frontmatter-popover__panel admin-content-structured-create-dialog__panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-content-structured-create-title"
      tabindex="-1"
    >
      <form
        class="admin-content-structured-create-dialog__form"
        onsubmit={(event) => {
          event.preventDefault();
          void saveCreate();
        }}
      >
        <header class="admin-modal__head admin-editor-frontmatter-popover__head">
          <div class="admin-editor-frontmatter-popover__title-wrap">
            <span class="admin-editor-frontmatter-popover__icon" aria-hidden="true">
              <AdminEditorIcon name={isPicks ? 'book-open-text' : 'link'} size={16} strokeWidth={1.9} />
            </span>
            <div class="admin-editor-frontmatter-popover__title-copy">
              <h3 id="admin-content-structured-create-title" class="admin-modal__title admin-content-section-title">{dialogTitle}</h3>
            </div>
          </div>
          <button
            bind:this={closeButtonEl}
            class="admin-btn admin-btn--ghost admin-btn--compact admin-btn--icon admin-editor-frontmatter-popover__close"
            type="button"
            aria-label={closeLabel}
            disabled={busy}
            onclick={closeDialog}
          >
            <AdminEditorIcon name="close" size={16} strokeWidth={2} />
          </button>
        </header>

        <div class="admin-modal__body">
          <div class="admin-editor-frontmatter" aria-label={dialogMode === 'edit' ? (isPicks ? '拾选字段' : '资料字段') : '新增字段'}>
            <div class="admin-editor-frontmatter__fields">
              <label class="admin-field admin-content-editor__field" class:is-invalid={Boolean(getIssue('title'))}>
                <span class="admin-field__label">标题</span>
                <input
                  bind:this={firstInputEl}
                  class="admin-field__control"
                  name="title"
                  type="text"
                  required
                  bind:value={titleValue}
                  disabled={busy}
                  aria-invalid={getIssue('title') ? 'true' : undefined}
                />
                <small>{getIssue('title')}</small>
              </label>

              {#if isPicks}
                <fieldset class="admin-field admin-content-editor__field admin-content-structured-create-dialog__status">
                  <legend class="admin-field__label">状态</legend>
                  <div class="admin-content-structured-create-dialog__segmented">
                    <label class:active={statusValue === 'shared'}>
                      <input type="radio" bind:group={statusValue} value="shared" disabled={busy} />
                      <span>分享</span>
                    </label>
                    <label class:active={statusValue === 'planned'}>
                      <input type="radio" bind:group={statusValue} value="planned" disabled={busy} />
                      <span>待拾</span>
                    </label>
                  </div>
                  <small>{getIssue('status')}</small>
                </fieldset>

                {#if dialogMode === 'edit'}
                  <div class="admin-content-structured-create-dialog__split">
                    <label class="admin-field admin-content-editor__field" class:is-invalid={Boolean(getIssue('date'))}>
                      <span class="admin-field__label">日期</span>
                      <input class="admin-field__control" name="date" type="text" bind:value={dateValue} disabled={busy} />
                      <small>{getIssue('date')}</small>
                    </label>
                    <label class="admin-field admin-content-editor__field" class:is-invalid={Boolean(getIssue('year'))}>
                      <span class="admin-field__label">年份</span>
                      <input class="admin-field__control" name="year" type="text" inputmode="numeric" bind:value={yearValue} disabled={busy} />
                      <small>{getIssue('year')}</small>
                    </label>
                  </div>

                  <label class="admin-field admin-content-editor__field" class:is-invalid={Boolean(getIssue('slug'))}>
                    <span class="admin-field__label">Slug</span>
                    <input class="admin-field__control" name="slug" type="text" bind:value={slugValue} disabled={busy} />
                    <small>{getIssue('slug')}</small>
                  </label>

                  <label class="admin-field admin-content-editor__field admin-content-structured-create-dialog__check" class:is-invalid={Boolean(getIssue('draft'))}>
                    <span class="admin-field__label">发布状态</span>
                    <span class="admin-content-structured-create-dialog__checkline">
                      <input name="draft" type="checkbox" bind:checked={draftValue} disabled={busy} />
                      <span>草稿</span>
                    </span>
                    <small>{getIssue('draft')}</small>
                  </label>
                {/if}

                <label class="admin-field admin-content-editor__field" class:is-invalid={Boolean(getIssue('authorsText', 'authors'))}>
                  <span class="admin-field__label">作者</span>
                  <textarea class="admin-field__control" name="authors" rows="3" bind:value={authorsValue} disabled={busy}></textarea>
                  <small>{getIssue('authorsText', 'authors')}</small>
                </label>

                {#if statusValue === 'shared'}
                  <label class="admin-field admin-content-editor__field" class:is-invalid={Boolean(getIssue('body', 'reason'))}>
                    <span class="admin-field__label">推荐理由</span>
                    <textarea class="admin-field__control" name="reason" rows="5" required bind:value={reasonValue} disabled={busy}></textarea>
                    <small>{getIssue('body', 'reason')}</small>
                  </label>
                {/if}

                <label class="admin-field admin-content-editor__field" class:is-invalid={Boolean(getIssue('tagsText', 'tags'))}>
                  <span class="admin-field__label">标签</span>
                  <textarea class="admin-field__control" name="tags" rows="2" bind:value={tagsValue} disabled={busy}></textarea>
                  <small>{getIssue('tagsText', 'tags')}</small>
                </label>
              {:else}
                <label class="admin-field admin-content-editor__field" class:is-invalid={Boolean(getIssue('href'))}>
                  <span class="admin-field__label">链接</span>
                  <input
                    class="admin-field__control"
                    name="href"
                    type="url"
                    required
                    bind:value={hrefValue}
                    disabled={busy}
                    aria-invalid={getIssue('href') ? 'true' : undefined}
                  />
                  <small>{getIssue('href')}</small>
                </label>

                <label class="admin-field admin-content-editor__field" class:is-invalid={Boolean(getIssue('label'))}>
                  <span class="admin-field__label">类型</span>
                  <input class="admin-field__control" name="label" type="text" bind:value={labelValue} disabled={busy} />
                  <small>{getIssue('label')}</small>
                </label>

                <label class="admin-field admin-content-editor__field" class:is-invalid={Boolean(getIssue('description'))}>
                  <span class="admin-field__label">描述</span>
                  <textarea class="admin-field__control" name="description" rows="4" bind:value={descriptionValue} disabled={busy}></textarea>
                  <small>{getIssue('description')}</small>
                </label>
              {/if}
            </div>
          </div>
        </div>

        <footer class="admin-modal__actions admin-content-structured-create-dialog__actions">
          <button class="admin-btn admin-btn--ghost admin-btn--compact" type="button" disabled={busy} onclick={closeDialog}>
            取消
          </button>
          <button class="admin-btn admin-btn--primary admin-btn--compact" type="submit" disabled={!canSubmit}>
            {dialogMode === 'edit' ? '保存' : '创建'}
          </button>
        </footer>
      </form>
    </div>
  </div>
{/if}