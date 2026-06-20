import type { AdminAboutEditorValues } from '../../../../lib/admin-console/content-about-contract';

export type AboutEditorIslandProps = {
  endpoint: string;
  exportEndpoint: string;
  returnHref: string;
  entryId: string;
  revision: string;
  initialContent: AdminAboutEditorValues;
};
