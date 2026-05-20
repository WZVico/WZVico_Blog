type Tone = 'info' | 'success' | 'error';
type MaterialFieldName = 'title' | 'href' | 'label' | 'description';
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

const getField = (
  root: ParentNode,
  name: MaterialFieldName
): HTMLInputElement | HTMLTextAreaElement | null =>
  query<HTMLInputElement | HTMLTextAreaElement>(root, `[data-material-field="${name}"]`);

const readItem = (form: HTMLFormElement): MaterialCreateItem => ({
  title: getField(form, 'title')?.value.trim() ?? '',
  href: getField(form, 'href')?.value.trim() ?? '',
  label: getField(form, 'label')?.value.trim() ?? '',
  description: getField(form, 'description')?.value.trim() ?? ''
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
  const form = query<HTMLFormElement>(root, '[data-materials-create-form]');
  const submitBtn = query<HTMLButtonElement>(root, '[data-materials-create-submit]');
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
        const errors = Array.isArray(result?.errors)
          ? result.errors.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
          : [];
        throw new Error(errors[0] ?? '创建资料失败');
      }

      const relativePath = typeof result.result?.relativePath === 'string' ? result.result.relativePath : '';
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
};
