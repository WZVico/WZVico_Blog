import { isAdminContentDeletableCollectionKey, type AdminContentDeletableCollectionKey } from '../../lib/admin-console/content-delete-contract';
import { closeClosestAdminDetailsMenu, initAdminDetailsMenus } from './details-menu';
import {
  getPayloadDeleteResult,
  getPayloadEditorPayload,
  getPayloadErrors,
  isPayloadOk,
  parseResponseBody
} from './entry-transport';
import {
  CONTENT_LIST_ACTION_FEEDBACK_DELETED,
  storeContentListActionFeedback
} from '../../components/admin/editor/shared/content-list-feedback';
import {
  dispatchAdminContentStatus
} from '../../components/admin/editor/list-actions/content-action-status-events';
import type { StatusState } from '../../components/admin/editor/list-actions/content-action-feedback';

const CLEANUP_KEY = '__astroWhonoAdminContentListActionsCleanup';
const ROOT_SELECTOR = '[data-admin-content-root]';
const ITEM_MENU_SELECTOR = '.admin-content-item__more';
const DELETE_ACTION_SELECTOR = '[data-admin-content-delete-action]';

type WindowWithAdminContentListActions = Window & {
  [CLEANUP_KEY]?: () => void;
};

type DeletePayload = {
  collection: AdminContentDeletableCollectionKey;
  entryId: string;
  revision: string;
  relativePath: string;
};

let busy = false;

const setStatus = (
  state: StatusState,
  text: string,
  options: Parameters<typeof dispatchAdminContentStatus>[2] = {}
) => {
  dispatchAdminContentStatus(state, text, options);
};

const getRoot = (): HTMLElement | null =>
  document.querySelector<HTMLElement>(ROOT_SELECTOR);

const getRequiredEndpoint = (root: HTMLElement, key: 'adminContentEntryEndpoint' | 'adminContentDeleteEndpoint'): string | null => {
  const endpoint = root.dataset[key]?.trim() ?? '';
  return endpoint || null;
};

const buildEntryEndpoint = (endpoint: string, collection: string, entryId: string): string => {
  const url = new URL(endpoint, window.location.href);
  url.searchParams.set('collection', collection);
  url.searchParams.set('entryId', entryId);
  return url.toString();
};

const setDeleteButtonsDisabled = (disabled: boolean) => {
  document.querySelectorAll<HTMLButtonElement>(DELETE_ACTION_SELECTOR).forEach((button) => {
    button.disabled = disabled;
  });
};

const reloadContentList = () => {
  storeContentListActionFeedback(CONTENT_LIST_ACTION_FEEDBACK_DELETED);
  setStatus('loading', '已删除，正在刷新列表…');
  window.location.reload();
};

const getRowTitle = (trigger: HTMLElement, entryId: string): string => {
  const row = trigger.closest<HTMLElement>('[data-admin-content-item]');
  return row?.querySelector<HTMLElement>('[data-admin-content-row-title]')?.textContent?.trim() || entryId;
};

const getRowCollectionLabel = (trigger: HTMLElement): string =>
  trigger
    .closest<HTMLElement>('.admin-content-module')
    ?.querySelector<HTMLElement>('.admin-content-module__head h3 span')
    ?.textContent
    ?.trim()
  || '该分类';

const getDeletePayload = (
  payload: unknown,
  collection: AdminContentDeletableCollectionKey,
  entryId: string
): DeletePayload | null => {
  const entryPayload = getPayloadEditorPayload(payload);
  if (!entryPayload || entryPayload.collection !== collection || entryPayload.entryId !== entryId) return null;
  if (typeof entryPayload.revision !== 'string' || typeof entryPayload.relativePath !== 'string') return null;
  return {
    collection,
    entryId,
    revision: entryPayload.revision,
    relativePath: entryPayload.relativePath
  };
};

const readDeleteActionDataset = (trigger: HTMLElement): {
  collection: AdminContentDeletableCollectionKey;
  entryId: string;
  expectedRelativePath: string;
} | null => {
  const rawCollection = trigger.dataset.collection?.trim() ?? '';
  const entryId = trigger.dataset.entryId?.trim() ?? '';
  const expectedRelativePath = trigger.dataset.relativePath?.trim() ?? '';

  if (!isAdminContentDeletableCollectionKey(rawCollection) || !entryId || !expectedRelativePath) {
    return null;
  }

  return {
    collection: rawCollection,
    entryId,
    expectedRelativePath
  };
};

const runDelete = async (trigger: HTMLElement) => {
  if (busy) {
    setStatus('warn', '操作进行中');
    return;
  }

  const root = getRoot();
  const entryEndpoint = root ? getRequiredEndpoint(root, 'adminContentEntryEndpoint') : null;
  const deleteEndpoint = root ? getRequiredEndpoint(root, 'adminContentDeleteEndpoint') : null;
  const action = readDeleteActionDataset(trigger);

  if (!root || !entryEndpoint || !deleteEndpoint || !action) {
    setStatus('error', '删除信息不完整，请刷新后重试');
    return;
  }

  busy = true;
  setDeleteButtonsDisabled(true);
  setStatus('loading', '正在确认删除');

  try {
    const loadResponse = await fetch(buildEntryEndpoint(entryEndpoint, action.collection, action.entryId), {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      },
      cache: 'no-store'
    });
    const loadPayload = await parseResponseBody(loadResponse);
    const entryPayload = getDeletePayload(loadPayload, action.collection, action.entryId);

    if (!loadResponse.ok || !isPayloadOk(loadPayload) || !entryPayload) {
      const payloadErrors = getPayloadErrors(loadPayload);
      setStatus('error', payloadErrors.length > 0 ? '删除确认失败' : '删除确认失败，请刷新后重试');
      return;
    }

    if (entryPayload.relativePath !== action.expectedRelativePath) {
      setStatus('warn', '列表已过期，请刷新后再删除');
      return;
    }

    const title = getRowTitle(trigger, action.entryId);
    const confirmed = window.confirm([
      `确认删除《${title}》？`,
      '',
      `类型：${getRowCollectionLabel(trigger)}`,
      `源文件：${entryPayload.relativePath}`,
      '',
      '文件会移到 .trash/content/，之后可从回收站手动恢复。'
    ].join('\n'));

    if (!confirmed) {
      setStatus('ready', '已取消删除', { autoClear: true });
      return;
    }

    setStatus('loading', '正在删除');
    const deleteResponse = await fetch(deleteEndpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8'
      },
      cache: 'no-store',
      body: JSON.stringify({
        collection: action.collection,
        entryId: action.entryId,
        revision: entryPayload.revision,
        expectedRelativePath: entryPayload.relativePath
      })
    });
    const deletePayload = await parseResponseBody(deleteResponse);

    if (!deleteResponse.ok || !isPayloadOk(deletePayload)) {
      const payloadErrors = getPayloadErrors(deletePayload);
      const state = deleteResponse.status === 409 ? 'warn' : 'error';
      const fallbackText = deleteResponse.status === 409 ? '检测到外部更新' : '删除失败，请检查控制台日志';
      setStatus(state, payloadErrors.length > 0 ? (deleteResponse.status === 409 ? '检测到外部更新' : '删除失败') : fallbackText);
      return;
    }

    const result = getPayloadDeleteResult(deletePayload);
    if (!result || !result.deleted || !result.trashedPath) {
      setStatus('error', '删除响应异常，请检查开发日志');
      return;
    }

    reloadContentList();
  } catch {
    setStatus('error', '删除请求失败，请稍后重试');
  } finally {
    busy = false;
    setDeleteButtonsDisabled(false);
  }
};

const handleClick = (event: MouseEvent) => {
  if (!(event.target instanceof Element)) return;

  const deleteTrigger = event.target.closest<HTMLElement>(DELETE_ACTION_SELECTOR);
  if (!deleteTrigger) return;

  event.preventDefault();
  closeClosestAdminDetailsMenu(deleteTrigger, ITEM_MENU_SELECTOR);
  void runDelete(deleteTrigger);
};

const initAdminContentListActions = () => {
  const windowWithCleanup = window as WindowWithAdminContentListActions;
  windowWithCleanup[CLEANUP_KEY]?.();

  const cleanupDetailsMenus = initAdminDetailsMenus({
    selector: ITEM_MENU_SELECTOR
  });

  document.addEventListener('click', handleClick);
  windowWithCleanup[CLEANUP_KEY] = () => {
    cleanupDetailsMenus();
    document.removeEventListener('click', handleClick);
  };
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdminContentListActions, { once: true });
} else {
  initAdminContentListActions();
}
