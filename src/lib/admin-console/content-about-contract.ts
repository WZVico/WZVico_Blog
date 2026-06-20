import type { AboutContent } from '../about-content';
import { parseAdminAboutSourceContent } from './content-about-source';
import type { AdminContentValidationIssue } from './content-entry-contract';

export type AdminAboutEditorValues = AboutContent;

export type AdminAboutEditorPayload = {
  collection: 'about';
  entryId: string;
  publicEntryId: string;
  defaultPublicSlug: string;
  revision: string;
  relativePath: string;
  writable: true;
  readonlyReason: null;
  bodyText: string;
  values: AdminAboutEditorValues;
};

export type AdminAboutWritePlan = {
  issues: AdminContentValidationIssue[];
  changedFields: string[];
  patches: [];
  bodyText?: string;
};

type AdminAboutPayloadSourceState = {
  entryId: string;
  publicEntryId: string;
  defaultPublicSlug: string;
  revision: string;
  relativePath: string;
  sourceText: string;
  bodyText: string;
};

const ABOUT_FIELD_LABELS: Readonly<Record<string, string>> = {
  introLines: '开头介绍',
  guide: '栏目指引',
  tech: '关于这里',
  faq: '常见问题',
  contact: '联系与订阅',
  body: '页面内容'
};

export const createAdminAboutEditorValues = (sourceText: string): AdminAboutEditorValues =>
  parseAdminAboutSourceContent(sourceText);

export const buildAdminAboutEditorPayload = (
  state: AdminAboutPayloadSourceState
): AdminAboutEditorPayload => ({
  collection: 'about',
  entryId: state.entryId,
  publicEntryId: state.publicEntryId,
  defaultPublicSlug: state.defaultPublicSlug,
  revision: state.revision,
  relativePath: state.relativePath,
  writable: true,
  readonlyReason: null,
  bodyText: state.bodyText,
  values: createAdminAboutEditorValues(state.sourceText)
});

export const getAdminAboutWriteFieldLabel = (field: string): string =>
  ABOUT_FIELD_LABELS[field] ?? field;

export const isAdminAboutFrontmatterIssuePath = (path?: string): boolean =>
  Boolean(path && (path.startsWith('introLines') || path.startsWith('guide') || path.startsWith('tech') || path.startsWith('faq') || path.startsWith('contact')));
