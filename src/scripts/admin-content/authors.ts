import {
  createWithBase,
  normalizeBitsAvatarPath
} from '../../utils/format';

type Tone = 'info' | 'success' | 'error';

type AuthorProfile = {
  name: string;
  avatar: string;
};

type EditableRow = {
  kind: 'new' | 'existing';
  index: number;
};

const base = import.meta.env.BASE_URL ?? '/';
const withBase = createWithBase(base);

const query = <T extends Element>(root: ParentNode | null, selector: string): T | null =>
  root?.querySelector<T>(selector) ?? null;

const queryAll = <T extends Element>(root: ParentNode | null, selector: string): T[] =>
  Array.from(root?.querySelectorAll<T>(selector) ?? []);

const parseInitialAuthors = (value: string | undefined): AuthorProfile[] => {
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
        avatar: typeof item.avatar === 'string' ? item.avatar.trim() : ''
      }))
      .filter((item) => item.name.length > 0);
  } catch {
    return [];
  }
};

const getAuthorKey = (name: string): string =>
  name.trim().toLocaleLowerCase();

const getInitial = (name: string): string => {
  const trimmed = name.trim();
  return trimmed ? Array.from(trimmed)[0]?.toLocaleUpperCase() ?? '?' : '?';
};

const buildAvatarSrc = (avatar: string): string => {
  const normalized = normalizeBitsAvatarPath(avatar);
  return normalized ? withBase(normalized) : '';
};

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

const getEditValues = (row: HTMLElement): AuthorProfile => ({
  name: query<HTMLInputElement>(row, '[data-author-content-name-input]')?.value.trim() ?? '',
  avatar: query<HTMLInputElement>(row, '[data-author-content-avatar-input]')?.value.trim() ?? ''
});

const updateAvatarPreview = (row: HTMLElement) => {
  const values = getEditValues(row);
  const preview = query<HTMLElement>(row, '[data-author-content-avatar]');
  const image = query<HTMLImageElement>(row, '[data-author-content-avatar-img]');
  const fallback = query<HTMLElement>(row, '[data-author-content-avatar-fallback]');
  const avatarSrc = buildAvatarSrc(values.avatar);

  if (fallback) fallback.textContent = getInitial(values.name);
  if (preview) preview.dataset.hasImage = avatarSrc ? 'true' : 'false';
  if (!image) return;

  image.hidden = !avatarSrc;
  if (avatarSrc) {
    image.src = avatarSrc;
  } else {
    image.removeAttribute('src');
  }
};

const createAvatar = (author: AuthorProfile): HTMLElement => {
  const preview = document.createElement('div');
  preview.className = 'admin-content-author-avatar';
  preview.dataset.authorContentAvatar = '';
  preview.setAttribute('aria-hidden', 'true');

  const image = document.createElement('img');
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.dataset.authorContentAvatarImg = '';
  image.addEventListener('error', () => {
    image.hidden = true;
    preview.dataset.hasImage = 'false';
  });
  preview.appendChild(image);

  const fallback = document.createElement('span');
  fallback.dataset.authorContentAvatarFallback = '';
  fallback.textContent = getInitial(author.name);
  preview.appendChild(fallback);

  const avatarSrc = buildAvatarSrc(author.avatar);
  preview.dataset.hasImage = avatarSrc ? 'true' : 'false';
  if (avatarSrc) {
    image.src = avatarSrc;
  } else {
    image.hidden = true;
  }

  return preview;
};

const createViewMain = (author: AuthorProfile): HTMLElement => {
  const main = document.createElement('div');
  main.className = 'admin-content-author-main';

  const name = document.createElement('span');
  name.className = 'admin-content-row-title admin-content-author-name';
  name.textContent = author.name;
  main.appendChild(name);

  return main;
};

const createEditMain = (author: AuthorProfile, rowLabel: string): HTMLElement => {
  const main = document.createElement('div');
  main.className = 'admin-content-author-editor';

  const nameLabel = document.createElement('label');
  nameLabel.className = 'admin-content-author-field admin-content-author-field--name';
  const nameText = document.createElement('span');
  nameText.textContent = '名称';
  const nameInput = document.createElement('input');
  nameInput.className = 'admin-field__control';
  nameInput.type = 'text';
  nameInput.autocomplete = 'off';
  nameInput.value = author.name;
  nameInput.dataset.authorContentNameInput = '';
  nameInput.setAttribute('aria-label', `${rowLabel}名称`);
  nameLabel.append(nameText, nameInput);

  const avatarLabel = document.createElement('label');
  avatarLabel.className = 'admin-content-author-field admin-content-author-field--avatar';
  const avatarText = document.createElement('span');
  avatarText.textContent = '头像链接';
  const avatarInput = document.createElement('input');
  avatarInput.className = 'admin-field__control';
  avatarInput.type = 'text';
  avatarInput.autocomplete = 'off';
  avatarInput.spellcheck = false;
  avatarInput.placeholder = 'author/avatar.webp';
  avatarInput.value = author.avatar;
  avatarInput.dataset.authorContentAvatarInput = '';
  avatarInput.setAttribute('aria-label', `${rowLabel}头像链接`);
  avatarLabel.append(avatarText, avatarInput);

  main.append(nameLabel, avatarLabel);
  return main;
};

const createBulkSelect = (label: string): HTMLElement => {
  const wrapper = document.createElement('label');
  wrapper.className = 'admin-content-bulk-select';
  wrapper.title = label;

  const checkbox = document.createElement('input');
  checkbox.className = 'admin-content-bulk-checkbox';
  checkbox.type = 'checkbox';
  checkbox.dataset.authorContentSelect = '';
  checkbox.setAttribute('aria-label', label);
  wrapper.appendChild(checkbox);
  return wrapper;
};

const createActionButton = (label: string, action: string, tone: 'normal' | 'danger' = 'normal'): HTMLButtonElement => {
  const button = document.createElement('button');
  button.className = `admin-btn admin-btn--ghost admin-btn--compact${tone === 'danger' ? ' admin-content-author-delete' : ''}`;
  button.type = 'button';
  button.textContent = label;
  button.dataset.authorContentAction = action;
  return button;
};

const createActions = (isEditing: boolean): HTMLElement => {
  const actions = document.createElement('div');
  actions.className = 'admin-content-item__actions admin-content-author-actions';

  if (isEditing) {
    actions.append(
      createActionButton('保存', 'save'),
      createActionButton('取消', 'cancel')
    );
  } else {
    actions.append(
      createActionButton('编辑', 'edit'),
      createActionButton('删除', 'delete', 'danger')
    );
  }

  return actions;
};

const createRow = (
  author: AuthorProfile,
  index: number,
  editing: EditableRow | null
): HTMLElement => {
  const isNew = index < 0;
  const isEditing = Boolean(editing && editing.index === index && editing.kind === (isNew ? 'new' : 'existing'));
  const label = isNew ? '新建作者' : `作者 ${author.name || index + 1}`;
  const row = document.createElement('li');
  row.className = `admin-row admin-row--plain admin-row--interactive admin-row--table admin-content-item admin-content-author-item${isEditing ? ' is-editing' : ''}`;
  row.dataset.authorContentRow = '';
  row.dataset.authorIndex = String(index);
  row.dataset.authorKind = isNew ? 'new' : 'existing';

  row.appendChild(createBulkSelect(isNew ? '选择新建作者' : `选择作者 ${author.name}`));
  row.appendChild(createAvatar(author));
  row.appendChild(isEditing ? createEditMain(author, label) : createViewMain(author));
  row.appendChild(createActions(isEditing));

  if (isEditing) updateAvatarPreview(row);
  return row;
};

const validateAuthors = (authors: readonly AuthorProfile[]): string[] => {
  const errors: string[] = [];
  const seenNames = new Set<string>();

  authors.forEach((author, index) => {
    const name = author.name.trim();
    if (!name) {
      errors.push(`作者 #${index + 1} 请填写名称`);
      return;
    }

    const key = getAuthorKey(name);
    if (seenNames.has(key)) {
      errors.push(`作者名称不能重复：${name}`);
      return;
    }
    seenNames.add(key);
  });

  return errors;
};

const persistAuthors = async (endpoint: string, authors: readonly AuthorProfile[]): Promise<AuthorProfile[]> => {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ authors })
  });
  const result = await response.json().catch(() => null) as {
    ok?: boolean;
    errors?: unknown;
    result?: {
      authors?: unknown;
    };
  } | null;

  if (!response.ok || !result?.ok) {
    const responseErrors = Array.isArray(result?.errors)
      ? result.errors.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
    throw new Error(responseErrors[0] ?? '保存作者库失败');
  }

  return Array.isArray(result.result?.authors)
    ? parseInitialAuthors(JSON.stringify(result.result.authors))
    : authors.slice();
};

export const initAdminContentAuthors = (): void => {
  const root = query<HTMLElement>(document, '[data-author-content-root]');
  if (!root || root.dataset.initialized === 'true') return;
  root.dataset.initialized = 'true';

  const endpoint = root.dataset.authorContentEndpoint?.trim() ?? '';
  const listEl = query<HTMLElement>(root, '[data-author-content-list]');
  const emptyEl = query<HTMLElement>(root, '[data-author-content-empty]');
  const countEl = query<HTMLElement>(root, '[data-author-content-count]');
  const newBtn = query<HTMLButtonElement>(root, '[data-author-content-new]');
  const statusEl = query<HTMLElement>(root, '[data-author-content-status]');
  let authors = parseInitialAuthors(root.dataset.authorContentInitial);
  let editing: EditableRow | null = null;
  let draftAuthor: AuthorProfile | null = null;
  let busy = false;

  const render = () => {
    if (!listEl) return;
    listEl.replaceChildren();
    if (draftAuthor) {
      listEl.appendChild(createRow(draftAuthor, -1, editing));
    }
    authors.forEach((author, index) => {
      listEl.appendChild(createRow(author, index, editing));
    });
    if (emptyEl) emptyEl.hidden = authors.length > 0 || Boolean(draftAuthor);
    if (countEl) countEl.textContent = String(authors.length);
    if (newBtn) newBtn.disabled = Boolean(draftAuthor) || busy;
  };

  const setBusy = (nextBusy: boolean) => {
    busy = nextBusy;
    queryAll<HTMLButtonElement>(root, 'button').forEach((button) => {
      if (button.dataset.authorContentAction === 'cancel') return;
      button.disabled = busy;
    });
    if (newBtn) newBtn.disabled = busy || Boolean(draftAuthor);
  };

  const focusEditingName = () => {
    query<HTMLInputElement>(root, '[data-author-content-name-input]')?.focus();
  };

  render();

  newBtn?.addEventListener('click', () => {
    clearStatus(statusEl);
    draftAuthor = { name: '', avatar: '' };
    editing = { kind: 'new', index: -1 };
    render();
    focusEditingName();
  });

  root.addEventListener('input', (event) => {
    if (!(event.target instanceof Element)) return;
    const row = event.target.closest<HTMLElement>('[data-author-content-row]');
    if (row) updateAvatarPreview(row);
    clearStatus(statusEl);
  });

  root.addEventListener('click', async (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('[data-author-content-action]');
    if (!button || busy) return;

    const row = button.closest<HTMLElement>('[data-author-content-row]');
    if (!row) return;

    const action = button.dataset.authorContentAction;
    const index = Number.parseInt(row.dataset.authorIndex ?? '', 10);
    const isNew = row.dataset.authorKind === 'new';
    clearStatus(statusEl);

    if (action === 'edit' && Number.isInteger(index)) {
      draftAuthor = null;
      editing = { kind: 'existing', index };
      render();
      focusEditingName();
      return;
    }

    if (action === 'cancel') {
      if (isNew) draftAuthor = null;
      editing = null;
      render();
      return;
    }

    if (action === 'delete' && Number.isInteger(index)) {
      const author = authors[index];
      if (!author) return;
      if (!window.confirm(`删除作者“${author.name}”？`)) return;
      if (!endpoint) {
        setStatus(statusEl, '当前页面缺少保存接口。', 'error');
        return;
      }

      const nextAuthors = authors.filter((_, itemIndex) => itemIndex !== index);
      setBusy(true);
      setStatus(statusEl, '正在删除作者...');
      try {
        authors = await persistAuthors(endpoint, nextAuthors);
        editing = null;
        draftAuthor = null;
        render();
        setStatus(statusEl, '已删除作者。', 'success');
      } catch (error) {
        setStatus(statusEl, error instanceof Error ? error.message : '删除作者失败', 'error');
      } finally {
        setBusy(false);
      }
      return;
    }

    if (action === 'save') {
      if (!endpoint) {
        setStatus(statusEl, '当前页面缺少保存接口。', 'error');
        return;
      }

      const values = getEditValues(row);
      const nextAuthors = isNew
        ? [...authors, values]
        : authors.map((author, itemIndex) => itemIndex === index ? values : author);
      const errors = validateAuthors(nextAuthors);
      if (errors.length > 0) {
        setStatus(statusEl, errors[0] ?? '作者库校验失败。', 'error');
        query<HTMLInputElement>(row, '[data-author-content-name-input]')?.focus();
        return;
      }

      setBusy(true);
      setStatus(statusEl, isNew ? '正在新建作者...' : '正在保存作者...');
      try {
        authors = await persistAuthors(endpoint, nextAuthors);
        editing = null;
        draftAuthor = null;
        render();
        setStatus(statusEl, isNew ? '已新建作者。' : '已保存作者。', 'success');
      } catch (error) {
        setStatus(statusEl, error instanceof Error ? error.message : '保存作者失败', 'error');
      } finally {
        setBusy(false);
      }
    }
  });
};
