type Tone = 'info' | 'success' | 'error';
type MaterialFieldName = 'title' | 'href' | 'label' | 'description' | 'date';
type MaterialCreateItem = Record<MaterialFieldName, string>;

const FIELD_NAMES = ['title', 'href', 'label', 'description'] as const satisfies readonly MaterialFieldName[];

const query = <T extends Element>(root: ParentNode | null, selector: string): T | null =>
  root?.querySelector<T>(selector) ?? null;

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getErrors = (result: unknown): string[] => {
  const errors = isRecord(result) && Array.isArray(result.errors)
    ? result.errors.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  if (errors.length > 0) return errors;

  return isRecord(result) && Array.isArray(result.issues)
    ? result.issues
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

const getField = (
  root: ParentNode,
  name: MaterialFieldName
): HTMLInputElement | HTMLTextAreaElement | null =>
  query<HTMLInputElement | HTMLTextAreaElement>(root, `[data-material-field="${name}"]`);

const readItem = (form: HTMLFormElement): MaterialCreateItem => ({
  title: getField(form, 'title')?.value.trim() ?? '',
  href: getField(form, 'href')?.value.trim() ?? '',
  label: getField(form, 'label')?.value.trim() ?? '',
  description: getField(form, 'description')?.value.trim() ?? '',
  date: getField(form, 'date')?.value.trim() ?? ''
});

const resetFormFields = (form: HTMLFormElement) => {
  FIELD_NAMES.forEach((name) => {
    const field = getField(form, name);
    if (field) field.value = '';
  });
};

export const initMaterialsCreate = (): void => {
  const root = query<HTMLElement>(document, '[data-materials-create-root]');
  if (!root || root.dataset.initialized === 'true') return;
  root.dataset.initialized = 'true';

  const endpoint = root.dataset.materialsCreateEndpoint?.trim() ?? '';
  const editEndpoint = root.dataset.materialsEditEndpoint?.trim() ?? '';
  const editCollection = root.dataset.materialsEditCollection?.trim() ?? '';
  const editEntryId = root.dataset.materialsEditId?.trim() ?? '';
  const form = query<HTMLFormElement>(root, '[data-materials-create-form]');
  const submitBtn = query<HTMLButtonElement>(root, '[data-materials-create-submit]');
  const editSubmitBtn = query<HTMLButtonElement>(root, '[data-materials-edit-submit]');
  const statusEl = query<HTMLElement>(root, '[data-materials-create-status]');

  if (!form || !endpoint) return;

  form.addEventListener('input', () => {
    clearStatus(statusEl);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearStatus(statusEl);

    const item = readItem(form);
    if (!item.title) {
      setStatus(statusEl, '请填写资料标题。', 'error');
      getField(form, 'title')?.focus();
      return;
    }
    if (!item.href) {
      setStatus(statusEl, '请填写资料链接。', 'error');
      getField(form, 'href')?.focus();
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.setAttribute('aria-busy', 'true');
    }
    setStatus(statusEl, '正在创建资料...');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ item })
      });
      const result = await response.json().catch(() => null) as {
        ok?: boolean;
        errors?: unknown;
        result?: {
          relativePath?: unknown;
        };
      } | null;

      if (!response.ok || !result?.ok) {
        const errors = getErrors(result);
        throw new Error(errors[0] ?? '创建资料失败');
      }

      const relativePath = getResultString(result, 'relativePath');
      resetFormFields(form);
      setStatus(statusEl, relativePath ? `已创建：${relativePath}` : '已创建资料。', 'success');
      getField(form, 'title')?.focus();
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建资料失败';
      setStatus(statusEl, message, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.setAttribute('aria-busy', 'false');
      }
    }
  });

  editSubmitBtn?.addEventListener('click', async () => {
    clearStatus(statusEl);

    const item = readItem(form);
    if (!item.title) {
      setStatus(statusEl, '请填写资料标题。', 'error');
      getField(form, 'title')?.focus();
      return;
    }
    if (!item.href) {
      setStatus(statusEl, '请填写资料链接。', 'error');
      getField(form, 'href')?.focus();
      return;
    }
    if (!editEndpoint || !editCollection || !editEntryId) {
      setStatus(statusEl, '当前页面缺少编辑接口。', 'error');
      return;
    }

    const revision = root.dataset.materialsEditRevision?.trim() ?? '';
    if (!revision) {
      setStatus(statusEl, '缺少 revision，请重新打开当前条目。', 'error');
      return;
    }

    editSubmitBtn.disabled = true;
    editSubmitBtn.setAttribute('aria-busy', 'true');
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
          fields: item
        })
      });
      const result = await response.json().catch(() => null) as unknown;

      if (!response.ok || !isRecord(result) || result.ok !== true) {
        const errors = getErrors(result);
        throw new Error(errors[0] ?? '保存资料失败');
      }

      const latestRevision = getPayloadString(result, 'revision');
      if (latestRevision) root.dataset.materialsEditRevision = latestRevision;

      const relativePath = getResultString(result, 'relativePath');
      setStatus(statusEl, relativePath ? `已保存：${relativePath}` : '已保存资料修改。', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存资料失败';
      setStatus(statusEl, message, 'error');
    } finally {
      editSubmitBtn.disabled = false;
      editSubmitBtn.setAttribute('aria-busy', 'false');
    }
  });
};
