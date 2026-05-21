import type { AboutContent } from '@/lib/about-content';

type Tone = 'info' | 'success' | 'error';

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

const getField = (
  root: ParentNode,
  selector: string
): HTMLInputElement | HTMLTextAreaElement | null =>
  query<HTMLInputElement | HTMLTextAreaElement>(root, selector);

const getNamedField = (
  root: ParentNode,
  name: string
): HTMLInputElement | HTMLTextAreaElement | null =>
  getField(root, `[data-about-field="${name}"]`);

const readField = (root: ParentNode, selector: string): string =>
  getField(root, selector)?.value.trim() ?? '';

const readNamedField = (root: ParentNode, name: string): string =>
  getNamedField(root, name)?.value.trim() ?? '';

const writeNamedField = (root: ParentNode, name: string, value: string) => {
  const field = getNamedField(root, name);
  if (field) field.value = value;
};

const validateRequiredFields = (form: HTMLFormElement): HTMLElement | null =>
  queryAll<HTMLInputElement | HTMLTextAreaElement>(form, '[data-about-required]').find(
    (field) => field.value.trim().length === 0
  ) ?? null;

const resizeTextarea = (field: HTMLTextAreaElement) => {
  field.style.height = 'auto';
  field.style.height = `${Math.max(field.scrollHeight, field.offsetHeight)}px`;
};

const resizeTextareas = (root: ParentNode) => {
  queryAll<HTMLTextAreaElement>(root, 'textarea.admin-field__control').forEach(resizeTextarea);
};

const renumberFaqRows = (form: HTMLFormElement) => {
  queryAll<HTMLElement>(form, '[data-about-faq-index]').forEach((row, index) => {
    row.dataset.aboutFaqIndex = String(index);
  });
};

const getFaqTemplate = (form: HTMLFormElement): HTMLTemplateElement | null =>
  query<HTMLTemplateElement>(form, 'template[data-about-faq-template]');

const createFaqRow = (
  form: HTMLFormElement,
  item: { question?: string; answer?: string } = {}
): HTMLElement | null => {
  const template = getFaqTemplate(form);
  const row = template?.content.firstElementChild?.cloneNode(true);
  if (!(row instanceof HTMLElement)) return null;

  const question = getField(row, '[data-about-faq-field="question"]');
  const answer = getField(row, '[data-about-faq-field="answer"]');
  if (question) question.value = item.question ?? '';
  if (answer) answer.value = item.answer ?? '';
  return row;
};

const renderFaqItems = (form: HTMLFormElement, items: AboutContent['faq']['items']) => {
  const list = query<HTMLElement>(form, '[data-about-faq-list]');
  if (!list) return;

  list.replaceChildren();
  items.forEach((item) => {
    const row = createFaqRow(form, item);
    if (row) list.appendChild(row);
  });
  renumberFaqRows(form);
};

const collectContent = (form: HTMLFormElement): AboutContent => ({
  introLines: readNamedField(form, 'introLines')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean),
  guide: {
    title: readNamedField(form, 'guide.title'),
    items: queryAll<HTMLElement>(form, '[data-about-guide-index]').map((row) => ({
      title: readField(row, '[data-about-guide-field="title"]'),
      href: readField(row, '[data-about-guide-field="href"]'),
      description: readField(row, '[data-about-guide-field="description"]')
    }))
  },
  tech: {
    title: readNamedField(form, 'tech.title'),
    groups: queryAll<HTMLElement>(form, '[data-about-tech-group-index]').map((group) => ({
      title: readField(group, '[data-about-tech-group-field="title"]'),
      items: queryAll<HTMLElement>(group, '[data-about-tech-item-index]').map((row) => ({
        title: readField(row, '[data-about-tech-field="title"]'),
        description: readField(row, '[data-about-tech-field="description"]')
      }))
    }))
  },
  faq: {
    title: readNamedField(form, 'faq.title'),
    items: queryAll<HTMLElement>(form, '[data-about-faq-index]').map((row) => ({
      question: readField(row, '[data-about-faq-field="question"]'),
      answer: readField(row, '[data-about-faq-field="answer"]')
    }))
  },
  contact: {
    title: readNamedField(form, 'contact.title'),
    note: readNamedField(form, 'contact.note')
  }
});

const applyContent = (form: HTMLFormElement, content: AboutContent) => {
  writeNamedField(form, 'introLines', content.introLines.join('\n'));
  writeNamedField(form, 'guide.title', content.guide.title);
  queryAll<HTMLElement>(form, '[data-about-guide-index]').forEach((row, index) => {
    const item = content.guide.items[index];
    if (!item) return;
    const title = getField(row, '[data-about-guide-field="title"]');
    const href = getField(row, '[data-about-guide-field="href"]');
    const description = getField(row, '[data-about-guide-field="description"]');
    if (title) title.value = item.title;
    if (href) href.value = item.href;
    if (description) description.value = item.description;
  });

  writeNamedField(form, 'tech.title', content.tech.title);
  queryAll<HTMLElement>(form, '[data-about-tech-group-index]').forEach((group, groupIndex) => {
    const nextGroup = content.tech.groups[groupIndex];
    if (!nextGroup) return;
    const title = getField(group, '[data-about-tech-group-field="title"]');
    if (title) title.value = nextGroup.title;
    queryAll<HTMLElement>(group, '[data-about-tech-item-index]').forEach((row, itemIndex) => {
      const item = nextGroup.items[itemIndex];
      if (!item) return;
      const itemTitle = getField(row, '[data-about-tech-field="title"]');
      const itemDescription = getField(row, '[data-about-tech-field="description"]');
      if (itemTitle) itemTitle.value = item.title;
      if (itemDescription) itemDescription.value = item.description;
    });
  });

  writeNamedField(form, 'faq.title', content.faq.title);
  renderFaqItems(form, content.faq.items);

  writeNamedField(form, 'contact.title', content.contact.title);
  writeNamedField(form, 'contact.note', content.contact.note);
  resizeTextareas(form);
};

export const initAboutContent = (): void => {
  const root = query<HTMLElement>(document, '[data-about-content-root]');
  if (!root || root.dataset.initialized === 'true') return;
  root.dataset.initialized = 'true';

  const endpoint = root.dataset.aboutContentEndpoint?.trim() ?? '';
  const form = query<HTMLFormElement>(root, '[data-about-content-form]');
  const submitBtn = query<HTMLButtonElement>(root, '[data-about-content-submit]');
  const statusEl = query<HTMLElement>(root, '[data-about-content-status]');

  if (!form || !endpoint) return;

  resizeTextareas(form);

  form.addEventListener('input', (event) => {
    if (event.target instanceof HTMLTextAreaElement) {
      resizeTextarea(event.target);
    }
    clearStatus(statusEl);
  });

  form.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const addButton = target?.closest('[data-about-faq-add]');
    if (addButton) {
      const list = query<HTMLElement>(form, '[data-about-faq-list]');
      const row = createFaqRow(form);
      if (!list || !row) return;
      list.appendChild(row);
      renumberFaqRows(form);
      resizeTextareas(row);
      getField(row, '[data-about-faq-field="question"]')?.focus();
      clearStatus(statusEl);
      return;
    }

    const removeButton = target?.closest('[data-about-faq-remove]');
    if (removeButton) {
      const row = removeButton.closest('[data-about-faq-index]');
      if (row instanceof HTMLElement) {
        row.remove();
        renumberFaqRows(form);
        setStatus(statusEl, '已删除问答，保存后生效。');
      }
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearStatus(statusEl);

    const emptyField = validateRequiredFields(form);
    if (emptyField) {
      setStatus(statusEl, '请补全空白文案后再保存。', 'error');
      emptyField.focus();
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.setAttribute('aria-busy', 'true');
    }
    setStatus(statusEl, '正在保存 About 页面文案...');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json'
        },
        body: JSON.stringify({ content: collectContent(form) })
      });
      const result = await response.json().catch(() => null) as {
        ok?: boolean;
        errors?: unknown;
        content?: AboutContent;
        relativePath?: unknown;
      } | null;

      if (!response.ok || !result?.ok) {
        const errors = Array.isArray(result?.errors)
          ? result.errors.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
          : [];
        throw new Error(errors[0] ?? '保存 About 页面文案失败');
      }

      if (result.content) {
        applyContent(form, result.content);
      }
      const relativePath = typeof result.relativePath === 'string' ? result.relativePath : '';
      setStatus(statusEl, relativePath ? `已保存：${relativePath}` : '已保存 About 页面文案。', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存 About 页面文案失败';
      setStatus(statusEl, message, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.setAttribute('aria-busy', 'false');
      }
    }
  });
};
