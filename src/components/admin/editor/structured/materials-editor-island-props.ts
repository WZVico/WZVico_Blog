import type { AdminMaterialsEditorValues } from '../../../../lib/admin-console/content-editor-payload';

export type MaterialsEditorIslandProps = {
  endpoint: string;
  exportEndpoint: string;
  deleteEndpoint: string;
  returnHref: string;
  entryId: string;
  relativePath: string;
  revision: string;
  initialFrontmatter: AdminMaterialsEditorValues;
};