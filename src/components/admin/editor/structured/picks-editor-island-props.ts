import type { AdminPicksEditorValues } from '../../../../lib/admin-console/content-editor-payload';

export type PicksEditorIslandProps = {
  endpoint: string;
  exportEndpoint: string;
  deleteEndpoint: string;
  returnHref: string;
  entryId: string;
  relativePath: string;
  revision: string;
  initialFrontmatter: AdminPicksEditorValues;
  initialBody: string;
};