type Tone = 'info' | 'success' | 'error';
type PickFieldName = 'title' | 'authors' | 'reason' | 'tags' | 'date' | 'year' | 'slug' | 'draft';
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
  name: PickFieldName
): HTMLInputElement | HTMLTextAreaElement | null =>
  query<HTMLInputElement | HTMLTextAreaElement>(root, `[data-pick-field="${name}"]`);

const readItem = (form: HTMLFormElement): PickCreateItem => ({
  title: getField(form, 'title')?.value.trim() ?? '',
  authors: getField(form, 'authors')?.value.trim() ?? '',
  reason: getField(form, 'reason')?.value.trim() ?? '',
  tags: getField(form, 'tags')?.value.trim() ?? '',
  date: getField(form, 'date')?.value.trim() ?? '',
  year: getField(form, 'year')?.value.trim() ?? '',
  slug: getField(form, 'slug')?.value.trim() ?? '',
  draft: query<HTMLInputElement>(form, '[data-pick-field="draft"]')?.checked ? 'true' : ''
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
  const editEndpoint = root.dataset.picksEditEndpoint?.trim() ?? '';
  const editCollection = root.dataset.picksEditCollection?.trim() ?? '';
  const editEntryId = root.dataset.picksEditId?.trim() ?? '';
  const form = query<HTMLFormElement>(root, '[data-picks-create-form]');
  const submitBtn = query<HTMLButtonElement>(root, '[data-picks-create-submit]');
  const editSubmitBtn = query<HTMLButtonElement>(root, '[data-picks-edit-submit]');
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
        const errors = getErrors(result);
        throw new Error(errors[0] ?? '创建拾选失败');
      }

      const relativePath = getResultString(result, 'relativePath');
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

  editSubmitBtn?.addEventListener('click', async () => {
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
    if (!editEndpoint || !editCollection || !editEntryId) {
      setStatus(statusEl, '当前页面缺少编辑接口。', 'error');
      return;
    }

    const revision = root.dataset.picksEditRevision?.trim() ?? '';
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
          fields: {
            title: item.title,
            date: item.date,
            year: item.year,
            slug: item.slug,
            authorsText: item.authors,
            tagsText: item.tags,
            draft: item.draft === 'true',
            body: item.reason
          }
        })
      });
      const result = await response.json().catch(() => null) as unknown;

      if (!response.ok || !isRecord(result) || result.ok !== true) {
        const errors = getErrors(result);
        throw new Error(errors[0] ?? '保存拾选失败');
      }

      const latestRevision = getPayloadString(result, 'revision');
      if (latestRevision) root.dataset.picksEditRevision = latestRevision;

      const relativePath = getResultString(result, 'relativePath');
      setStatus(statusEl, relativePath ? `已保存：${relativePath}` : '已保存拾选修改。', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存拾选失败';
      setStatus(statusEl, message, 'error');
    } finally {
      editSubmitBtn.disabled = false;
      editSubmitBtn.setAttribute('aria-busy', 'false');
    }
  });
};

export const initPicksCreate = (): void => {
  initPicksIntro();
  initPicksEntryCreate();
};
