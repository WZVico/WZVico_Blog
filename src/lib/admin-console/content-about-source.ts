import {
  DEFAULT_ABOUT_CONTENT,
  normalizeAboutContent,
  type AboutContent
} from '../about-content';
import type { AdminContentValidationIssue } from './content-entry-contract';
import { createAdminContentValidationIssue as createIssue } from './content-entry-utils';

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const compactSummaryLines = (lines: readonly string[]): string =>
  lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');

const readRequiredString = (
  value: unknown,
  path: string,
  label: string,
  issues: AdminContentValidationIssue[]
): string => {
  if (typeof value !== 'string') {
    issues.push(createIssue(path, `${label}必须是文本`));
    return '';
  }
  const normalized = value.trim();
  if (!normalized) {
    issues.push(createIssue(path, `请填写${label}`));
  }
  return normalized;
};

const readStringArray = (
  value: unknown,
  path: string,
  label: string,
  issues: AdminContentValidationIssue[]
): string[] => {
  if (!Array.isArray(value)) {
    issues.push(createIssue(path, `${label}必须是文本数组`));
    return [];
  }

  const items = value.map((item, index) =>
    readRequiredString(item, `${path}[${index}]`, `${label}第 ${index + 1} 行`, issues)
  ).filter(Boolean);

  if (items.length === 0) {
    issues.push(createIssue(path, `请至少填写一行${label}`));
  }
  return items;
};

const readObjectArray = <Item>(
  value: unknown,
  path: string,
  label: string,
  issues: AdminContentValidationIssue[],
  readItem: (item: Record<string, unknown>, index: number) => Item
): Item[] => {
  if (!Array.isArray(value)) {
    issues.push(createIssue(path, `${label}必须是数组`));
    return [];
  }

  const items: Item[] = [];
  value.forEach((item, index) => {
    if (!isPlainRecord(item)) {
      issues.push(createIssue(`${path}[${index}]`, `${label}第 ${index + 1} 项必须是对象`));
      return;
    }
    items.push(readItem(item, index));
  });
  return items;
};

export const parseAdminAboutSourceContent = (sourceText: string): AboutContent => {
  try {
    return normalizeAboutContent(JSON.parse(sourceText) as unknown);
  } catch {
    return normalizeAboutContent(DEFAULT_ABOUT_CONTENT);
  }
};

export const stringifyAdminAboutContent = (content: AboutContent): string =>
  `${JSON.stringify(normalizeAboutContent(content), null, 2)}\n`;

export const renderAdminAboutBodyText = (sourceText: string): string => {
  const content = parseAdminAboutSourceContent(sourceText);
  return compactSummaryLines([
    '关于',
    ...content.introLines,
    content.guide.title,
    ...content.guide.items.flatMap((item) => [item.title, item.href, item.description]),
    content.tech.title,
    ...content.tech.groups.flatMap((group) => [
      group.title,
      ...group.items.flatMap((item) => [item.title, item.description])
    ]),
    content.faq.title,
    ...content.faq.items.flatMap((item) => [item.question, item.answer]),
    content.contact.title,
    content.contact.note
  ]);
};

export const parseAdminAboutEditorContent = (
  input: unknown
): { content?: AboutContent; issues: AdminContentValidationIssue[] } => {
  const issues: AdminContentValidationIssue[] = [];
  if (!isPlainRecord(input)) {
    return {
      issues: [createIssue('about', '关于内容必须是对象')]
    };
  }

  const guideInput = isPlainRecord(input.guide) ? input.guide : {};
  const techInput = isPlainRecord(input.tech) ? input.tech : {};
  const faqInput = isPlainRecord(input.faq) ? input.faq : {};
  const contactInput = isPlainRecord(input.contact) ? input.contact : {};

  const content: AboutContent = {
    introLines: readStringArray(input.introLines, 'introLines', '开头介绍', issues),
    guide: {
      title: readRequiredString(guideInput.title, 'guide.title', '栏目指引大标题', issues),
      items: readObjectArray(guideInput.items, 'guide.items', '栏目指引', issues, (item, index) => ({
        title: readRequiredString(item.title, `guide.items[${index}].title`, '栏目名', issues),
        href: readRequiredString(item.href, `guide.items[${index}].href`, '栏目路径文字', issues),
        description: readRequiredString(item.description, `guide.items[${index}].description`, '栏目说明', issues)
      }))
    },
    tech: {
      title: readRequiredString(techInput.title, 'tech.title', '项目大标题', issues),
      groups: readObjectArray(techInput.groups, 'tech.groups', '项目分组', issues, (group, groupIndex) => ({
        title: readRequiredString(group.title, `tech.groups[${groupIndex}].title`, '分组标题', issues),
        items: readObjectArray(group.items, `tech.groups[${groupIndex}].items`, '项目条目', issues, (item, itemIndex) => ({
          title: readRequiredString(item.title, `tech.groups[${groupIndex}].items[${itemIndex}].title`, '项目名', issues),
          description: readRequiredString(item.description, `tech.groups[${groupIndex}].items[${itemIndex}].description`, '项目说明', issues)
        }))
      }))
    },
    faq: {
      title: readRequiredString(faqInput.title, 'faq.title', '常见问题大标题', issues),
      items: readObjectArray(faqInput.items, 'faq.items', '常见问题', issues, (item, index) => ({
        question: readRequiredString(item.question, `faq.items[${index}].question`, '问题', issues),
        answer: readRequiredString(item.answer, `faq.items[${index}].answer`, '回答', issues)
      }))
    },
    contact: {
      title: readRequiredString(contactInput.title, 'contact.title', '联系区大标题', issues),
      note: readRequiredString(contactInput.note, 'contact.note', '联系区说明', issues)
    }
  };

  if (content.guide.items.length === 0) {
    issues.push(createIssue('guide.items', '请至少保留一个栏目指引'));
  }
  if (content.tech.groups.length === 0) {
    issues.push(createIssue('tech.groups', '请至少保留一个项目分组'));
  }
  if (content.faq.items.length === 0) {
    issues.push(createIssue('faq.items', '请至少保留一个常见问题'));
  }

  return issues.length > 0
    ? { issues }
    : {
        content: normalizeAboutContent(content),
        issues: []
      };
};