import type { AdminAboutEditorValues } from './content-about-shared';
import { parseAdminAboutSourceContent } from './content-about-source';
import type { AdminContentValidationIssue } from './content-entry-contract';

export type { AdminAboutEditorValues } from './content-about-shared';
export {
  getAdminAboutWriteFieldLabel,
  isAdminAboutFrontmatterIssuePath
} from './content-about-shared';

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
