import {
  createWithBase,
  normalizeBitsAvatarPath
} from '../utils/format';

type Tone = 'info' | 'success' | 'error';
type AuthorProfile = {
  name: string;
  avatar: string;
};

const base = import.meta.env.BASE_URL ?? '/';
const withBase = createWithBase(base);

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

const updateEmptyState = (root: HTMLElement) => {
  const emptyEl = query<HTMLElement>(root, '[data-author-library-empty]');
  const hasRows = queryAll<HTMLElement>(root, '[data-author-library-row]').length > 0;
  if (emptyEl) emptyEl.hidden = hasRows;
};

const updatePreview = (row: HTMLElement) => {
  const name = query<HTMLInputElement>(row, '[data-author-library-name]')?.value.trim() ?? '';
  const avatar = query<HTMLInputElement>(row, '[data-author-library-avatar-input]')?.value.trim() ?? '';
  const image = query<HTMLImageElement>(row, '[data-author-library-preview-img]');
  const fallback = query<HTMLElement>(row, '[data-author-library-preview-fallback]');
  const preview = query<HTMLElement>(row, '[data-author-library-preview]');
  const avatarSrc = buildAvatarSrc(avatar);

  if (fallback) fallback.textContent = getInitial(name);
  if (preview) preview.dataset.hasImage = avatarSrc ? 'true' : 'false';
  if (!image) return;

  image.hidden = !avatarSrc;
  if (avatarSrc) {
    image.src = avatarSrc;
  } else {
    image.removeAttribute('src');
  }
};

const createRow = (
  author: AuthorProfile,
  index: number
): HTMLElement => {
  const row = document.createElement('article');
  row.className = 'admin-category-author-manager__row';
  row.dataset.authorLibraryRow = '';

  const preview = document.createElement('div');
  preview.className = 'admin-category-author-manager__avatar';
  preview.dataset.authorLibraryPreview = '';
  preview.setAttribute('aria-hidden', 'true');

  const image = document.createElement('img');
  image.alt = '';
  image.loading = 'lazy';
  image.decoding = 'async';
  image.dataset.authorLibraryPreviewImg = '';
  image.addEventListener('error', () => {
    image.hidden = true;
    preview.dataset.hasImage = 'false';
  });
  preview.appendChild(image);

  const fallback = document.createElement('span');
  fallback.dataset.authorLibraryPreviewFallback = '';
  preview.appendChild(fallback);
  row.appendChild(preview);

  const nameLabel = document.createElement('label');
  nameLabel.className = 'admin-category-author-manager__field admin-category-author-manager__field--name';
  const nameText = document.createElement('span');
  nameText.textContent = '名称 *';
  const nameInput = document.createElement('input');
  nameInput.className = 'admin-field__control';
  nameInput.type = 'text';
  nameInput.autocomplete = 'off';
  nameInput.value = author.name;
  nameInput.dataset.authorLibraryName = '';
  nameInput.setAttribute('aria-label', `作者 #${index + 1} 名称`);
  nameLabel.append(nameText, nameInput);
  row.appendChild(nameLabel);

  const avatarLabel = document.createElement('label');
  avatarLabel.className = 'admin-category-author-manager__field admin-category-author-manager__field--avatar';
  const avatarText = document.createElement('span');
  avatarText.textContent = '头像（可选）';
  const avatarInput = document.createElement('input');
  avatarInput.className = 'admin-field__control';
  avatarInput.type = 'text';
  avatarInput.autocomplete = 'off';
  avatarInput.spellcheck = false;
  avatarInput.placeholder = 'author/avatar.webp';
  avatarInput.value = author.avatar;
  avatarInput.dataset.authorLibraryAvatarInput = '';
  avatarInput.setAttribute('aria-label', `作者 #${index + 1} 头像`);
  avatarLabel.append(avatarText, avatarInput);
  row.appendChild(avatarLabel);

  const removeButton = document.createElement('button');
  removeButton.className = 'admin-btn admin-btn--ghost admin-category-author-manager__remove';
  removeButton.type = 'button';
  removeButton.dataset.authorLibraryRemove = '';
  removeButton.textContent = '删除';
  row.appendChild(removeButton);

  updatePreview(row);
  return row;
};

const renderRows = (root: HTMLElement, authors: readonly AuthorProfile[]) => {
  const listEl = query<HTMLElement>(root, '[data-author-library-list]');
  if (!listEl) return;

  listEl.replaceChildren();
  authors.forEach((author, index) => {
    listEl.appendChild(createRow(author, index));
  });
  updateEmptyState(root);
};

const readAuthors = (root: HTMLElement): { authors: AuthorProfile[]; errors: string[] } => {
  const authors: AuthorProfile[] = [];
  const errors: string[] = [];
  const seenNames = new Set<string>();

  queryAll<HTMLElement>(root, '[data-author-library-row]').forEach((row, index) => {
    const nameInput = query<HTMLInputElement>(row, '[data-author-library-name]');
    const avatarInput = query<HTMLInputElement>(row, '[data-author-library-avatar-input]');
    const name = nameInput?.value.trim() ?? '';
    const avatar = avatarInput?.value.trim() ?? '';

    if (!name) {
      errors.push(`作者 #${index + 1} 请填写名称`);
      nameInput?.focus();
      return;
    }

    const key = getAuthorKey(name);
    if (seenNames.has(key)) {
      errors.push(`作者名称不能重复：${name}`);
      nameInput?.focus();
      return;
    }
    seenNames.add(key);

    authors.push({ name, avatar });
  });

  return { authors, errors };
};

export const initAuthorLibrary = (): void => {
  const root = query<HTMLElement>(document, '[data-author-library-root]');
  if (!root || root.dataset.initialized === 'true') return;
  root.dataset.initialized = 'true';

  const endpoint = root.dataset.authorLibraryEndpoint?.trim() ?? '';
  const addForm = query<HTMLFormElement>(root, '[data-author-library-add-form]');
  const addNameEl = query<HTMLInputElement>(root, '[data-author-library-add-name]');
  const addAvatarEl = query<HTMLInputElement>(root, '[data-author-library-add-avatar]');
  const listEl = query<HTMLElement>(root, '[data-author-library-list]');
  const saveBtn = query<HTMLButtonElement>(root, '[data-author-library-save]');
  const statusEl = query<HTMLElement>(root, '[data-author-library-status]');

  renderRows(root, parseInitialAuthors(root.dataset.authorLibraryInitial));

  addForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    clearStatus(statusEl);

    const name = addNameEl?.value.trim() ?? '';
    const avatar = addAvatarEl?.value.trim() ?? '';
    if (!name) {
      setStatus(statusEl, '请填写作者名称。', 'error');
      addNameEl?.focus();
      return;
    }

    const existingKeys = new Set(
      readAuthors(root).authors.map((author) => getAuthorKey(author.name))
    );
    if (existingKeys.has(getAuthorKey(name))) {
      setStatus(statusEl, `作者已存在：${name}`, 'error');
      addNameEl?.focus();
      return;
    }

    listEl?.appendChild(createRow({ name, avatar }, queryAll<HTMLElement>(root, '[data-author-library-row]').length));
    if (addNameEl) addNameEl.value = '';
    if (addAvatarEl) addAvatarEl.value = '';
    updateEmptyState(root);
    setStatus(statusEl, '已加入列表，保存后会写入作者库。');
    addNameEl?.focus();
  });

  root.addEventListener('input', (event) => {
    if (!(event.target instanceof Element)) return;
    clearStatus(statusEl);
    const row = event.target.closest<HTMLElement>('[data-author-library-row]');
    if (row) updatePreview(row);
  });

  root.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const removeButton = event.target.closest<HTMLButtonElement>('[data-author-library-remove]');
    if (!removeButton) return;

    removeButton.closest<HTMLElement>('[data-author-library-row]')?.remove();
    updateEmptyState(root);
    clearStatus(statusEl);
    setStatus(statusEl, '已从列表移除，保存后生效。');
  });

  saveBtn?.addEventListener('click', async () => {
    clearStatus(statusEl);
    if (!endpoint) {
      setStatus(statusEl, '当前页面缺少保存接口。', 'error');
      return;
    }

    const { authors, errors } = readAuthors(root);
    if (errors.length > 0) {
      setStatus(statusEl, errors[0] ?? '作者库校验失败。', 'error');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.setAttribute('aria-busy', 'true');
    setStatus(statusEl, '正在保存作者库...');

    try {
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
          relativePath?: unknown;
          authors?: unknown;
        };
      } | null;

      if (!response.ok || !result?.ok) {
        const responseErrors = Array.isArray(result?.errors)
          ? result.errors.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          : [];
        throw new Error(responseErrors[0] ?? '保存作者库失败');
      }

      const savedAuthors = Array.isArray(result.result?.authors)
        ? parseInitialAuthors(JSON.stringify(result.result.authors))
        : authors;
      renderRows(root, savedAuthors);
      const relativePath = typeof result.result?.relativePath === 'string' ? result.result.relativePath : '';
      setStatus(statusEl, relativePath ? `已保存：${relativePath}` : '已保存作者库。', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存作者库失败';
      setStatus(statusEl, message, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.setAttribute('aria-busy', 'false');
    }
  });
};
