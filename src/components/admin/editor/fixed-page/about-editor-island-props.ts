import type { AdminAboutEditorValues } from '../../../../lib/admin-console/content-about-shared';

export type AboutEditorIslandProps = {
  endpoint: string;
  exportEndpoint: string;
  returnHref: string;
  entryId: string;
  revision: string;
  initialContent: AdminAboutEditorValues;
};
