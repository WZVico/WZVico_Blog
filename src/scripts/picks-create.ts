type Tone = 'info' | 'success' | 'error';
type PickFieldName = 'title' | 'authors' | 'reason' | 'tags';
type PickCreateItem = Record<PickFieldName, string>;

const FIELD_NAMES = ['title', 'authors', 'reason', 'tags'] as const satisfies readonly PickFieldName[];

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
  name: PickFieldName
): HTMLInputElement | HTMLTextAreaElement | null =>
  query<HTMLInputElement | HTMLTextAreaElement>(root, `[data-pick-field="${name}"]`);

const readItem = (form: HTMLFormElement): PickCreateItem => ({
  title: getField(form, 'title')?.value.trim() ?? '',
  authors: getField(form, 'authors')?.value.trim() ?? '',
  reason: getField(form, 'reason')?.value.trim() ?? '',
  tags: getField(form, 'tags')?.value.trim() ?? ''
});

const resetFormFields = (form: HTMLFormElement) => {
  FIELD_NAMES.forEach((name) => {
    const field = getField(form, name);
    if (field) field.value = '';
  });
};

const initPicksIntro = (): void => {
  const root = query<HTMLElement>(document, '[data-picks-intro-root]');
  if (!root || root.dataset.initialized === 'true') return;
  root.dataset.initialized = 'true';

  const endpoint = root.dataset.picksIntroEndpoint?.trim() ?? '';
  const form = query<HTMLFormElement>(root, '[data-picks-intro-form]');
  const field = query<HTMLTextAreaElement>(root, '[data-picks-intro-field]');
  const submitBtn = query<HTMLButtonElement>(root, '[data-picks-intro-submit]');
  const statusEl = query<HTMLElement>(root, '[data-picks-intro-status]');

  if (!form || !field || !endpoint) return;

  form.addEventListener('input', () => {
    clearStatus(statusEl);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearStatus(statusEl);

    const intro = field.value.trim();
    if (!intro) {
      setStatus(statusEl, '请填写 /picks/ 页面介绍。', 'error');
      field.focus();
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.setAttribute('aria-busy', 'true');
    }
    setStatus(statusEl, '正在保存介绍...');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ action: 'updateIntro', intro })
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
        throw new Error(errors[0] ?? '保存介绍失败');
      }

      const relativePath = typeof result.result?.relativePath === 'string' ? result.result.relativePath : '';
      setStatus(statusEl, relativePath ? `已保存：${relativePath}` : '已保存介绍。', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存介绍失败';
      setStatus(statusEl, message, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.setAttribute('aria-busy', 'false');
      }
    }
  });
};

const initPicksEntryCreate = (): void => {
  const root = query<HTMLElement>(document, '[data-picks-create-root]');
  if (!root || root.dataset.initialized === 'true') return;
  root.dataset.initialized = 'true';

  const endpoint = root.dataset.picksCreateEndpoint?.trim() ?? '';
  const form = query<HTMLFormElement>(root, '[data-picks-create-form]');
  const submitBtn = query<HTMLButtonElement>(root, '[data-picks-create-submit]');
  const statusEl = query<HTMLElement>(root, '[data-picks-create-status]');

  if (!form || !endpoint) return;

  form.addEventListener('input', () => {
    clearStatus(statusEl);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearStatus(statusEl);

    const item = readItem(form);
    if (!item.title) {
      setStatus(statusEl, '请填写拾选标题。', 'error');
      getField(form, 'title')?.focus();
      return;
    }
    if (!item.reason) {
      setStatus(statusEl, '请填写推荐理由。', 'error');
      getField(form, 'reason')?.focus();
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.setAttribute('aria-busy', 'true');
    }
    setStatus(statusEl, '正在写入拾选...');

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
        throw new Error(errors[0] ?? '创建拾选失败');
      }

      const relativePath = typeof result.result?.relativePath === 'string' ? result.result.relativePath : '';
      resetFormFields(form);
      setStatus(statusEl, relativePath ? `已写入：${relativePath}` : '已写入拾选。', 'success');
      getField(form, 'title')?.focus();
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建拾选失败';
      setStatus(statusEl, message, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.setAttribute('aria-busy', 'false');
      }
    }
  });
};

export const initPicksCreate = (): void => {
  initPicksIntro();
  initPicksEntryCreate();
};
