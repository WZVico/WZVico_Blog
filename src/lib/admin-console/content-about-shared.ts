import type { AboutContent } from '../about-content';

export type AdminAboutEditorValues = AboutContent;

const ABOUT_FIELD_LABELS: Readonly<Record<string, string>> = {
  introLines: '开头介绍',
  guide: '栏目指引',
  tech: '关于这里',
  faq: '常见问题',
  contact: '联系与订阅',
  body: '页面内容'
};

export const getAdminAboutWriteFieldLabel = (field: string): string =>
  ABOUT_FIELD_LABELS[field] ?? field;

export const isAdminAboutFrontmatterIssuePath = (path?: string): boolean =>
  Boolean(path && (
    path.startsWith('introLines')
    || path.startsWith('guide')
    || path.startsWith('tech')
    || path.startsWith('faq')
    || path.startsWith('contact')
  ));
