type Tone = 'info' | 'success' | 'error';

type SaveResponse = {
  ok?: boolean;
  errors?: unknown;
  issues?: unknown;
  result?: {
    relativePath?: unknown;
  };
  payload?: {
    revision?: unknown;
  };
};

const query = <T extends Element>(root: ParentNode | null, selector: string): T | null =>
  root?.querySelector<T>(selector) ?? null;

const queryAll = <T extends Element>(root: ParentNode | null, selector: string): T[] =>
  Array.from(root?.querySelectorAll<T>(selector) ?? []);

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

const readFields = (form: HTMLFormElement): Record<string, string | boolean> => {
  const fields: Record<string, string | boolean> = {};

  queryAll<HTMLInputElement | HTMLTextAreaElement>(form, '[data-category-entry-field]').forEach((field) => {
    const key = field.dataset.categoryEntryField?.trim();
    if (!key) return;

    if (field instanceof HTMLInputElement && field.type === 'checkbox') {
      fields[key] = field.checked;
      return;
    }

    fields[key] = field.value;
  });

  return fields;
};

const getErrors = (result: SaveResponse | null): string[] => {
  const errors = Array.isArray(result?.errors)
    ? result.errors.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
  if (errors.length > 0) return errors;

  const issues = Array.isArray(result?.issues)
    ? result.issues
        .map((item) => {
          if (typeof item === 'string') return item;
          if (typeof item === 'object' && item !== null && 'message' in item) {
            const message = (item as { message?: unknown }).message;
            return typeof message === 'string' ? message : '';
          }
          return '';
        })
        .filter(Boolean)
    : [];

  return issues;
};

export const initCategoryEntryEditor = (): void => {
  const root = query<HTMLElement>(document, '[data-category-entry-editor-root]');
  if (!root || root.dataset.initialized === 'true') return;
  root.dataset.initialized = 'true';

  const form = query<HTMLFormElement>(root, '[data-category-entry-editor-form]');
  const endpoint = root.dataset.categoryEntryEndpoint?.trim() ?? '';
  const collection = root.dataset.categoryEntryCollection?.trim() ?? '';
  const entryId = root.dataset.categoryEntryId?.trim() ?? '';
  const submitBtn = query<HTMLButtonElement>(root, '[data-category-entry-submit]');
  const statusEl = query<HTMLElement>(root, '[data-category-entry-status]');
  const revisionEl = query<HTMLElement>(root, '[data-category-entry-revision]');

  if (!form || !endpoint || !collection || !entryId) return;

  form.addEventListener('input', () => {
    clearStatus(statusEl);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearStatus(statusEl);

    const revision = root.dataset.categoryEntryRevision?.trim() ?? '';
    if (!revision) {
      setStatus(statusEl, '缺少 revision，请重新打开当前条目。', 'error');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.setAttribute('aria-busy', 'true');
    }
    setStatus(statusEl, '正在保存修改...');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          collection,
          entryId,
          revision,
          fields: readFields(form)
        })
      });
      const result = await response.json().catch(() => null) as SaveResponse | null;

      if (!response.ok || !result?.ok) {
        const errors = getErrors(result);
        throw new Error(errors[0] ?? '保存内容失败');
      }

      const latestRevision = typeof result.payload?.revision === 'string' ? result.payload.revision : '';
      if (latestRevision) {
        root.dataset.categoryEntryRevision = latestRevision;
        if (revisionEl) revisionEl.textContent = latestRevision;
      }

      const relativePath = typeof result.result?.relativePath === 'string' ? result.result.relativePath : '';
      setStatus(statusEl, relativePath ? `已保存：${relativePath}` : '已保存修改。', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存内容失败';
      setStatus(statusEl, message, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.setAttribute('aria-busy', 'false');
      }
    }
  });
};
