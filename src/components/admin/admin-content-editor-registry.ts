import type { AdminContentWriteCollectionKey } from '../../lib/admin-console/content-collections';
import { getAdminContentCollectionCapability } from '../../lib/admin-console/content-collections';
import { getAdminContentEntryEditHref } from '../../lib/admin-console/content-routes';
import type { AdminAboutEditorPayload } from '../../lib/admin-console/content-about-contract';
import {
  type AdminBitsEditorPayload,
  type AdminContentWorkspaceEditorPayload,
  type AdminEssayEditorPayload,
  type AdminMemoEditorPayload,
  type AdminPicksEditorPayload
} from '../../lib/admin-console/content-editor-payload';
import type { BitsCardAuthorInput } from '../../lib/bits-card-view-model';
import {
  loadAdminContentSourceIndex,
  loadAdminContentSourceManifest
} from '../../lib/admin-console/content-source-index';
import type { BitsEditorIslandProps } from './editor/bits/bits-editor-island-props';
import type { EssayEditorShellProps } from './editor/essay/editor-shell-props';
import type {
  EditorOutlineEssaySourceItem,
  EditorOutlineListSourceItem
} from './editor/markdown/editor-outline-helpers';
import type { MemoEditorIslandProps } from './editor/fixed-page/memo-editor-island-props';
import type { AboutEditorIslandProps } from './editor/fixed-page/about-editor-island-props';
import type { PicksEditorIslandProps } from './editor/structured/picks-editor-island-props';

type WithBase = (path: string) => string;

type AuthorLibraryProfile = {
  name: string;
  avatar: string;
};

export type AdminContentEditorEndpoints = {
  endpoint: string;
  exportEndpoint: string;
  deleteEndpoint: string;
  previewEndpoint: string;
  imageUploadEndpoint: string;
};

export type AdminContentEditorStyleSlot =
  | 'adminContentEditor'
  | 'adminContentEditorAbout'
  | 'adminContentEditorBits'
  | 'adminContentEditorFrontmatter'
  | 'adminContentEditorGalleryInsert'
  | 'adminContentEditorImageInsert'
  | 'adminContentEditorMemo'
  | 'adminContentEditorStructured'
  | 'adminImageShared'
  | 'about'
  | 'article';

export type AdminContentEditorOutlineKind = 'none' | 'longform' | 'list';

export type AdminContentEditorInfoTrigger = {
  attribute: 'data-admin-article-info-trigger' | 'data-admin-bits-info-trigger';
  label: string;
  panelId: string;
};

export type AdminContentEditorPageCollectionKey = Exclude<AdminContentWriteCollectionKey, 'materials'>;
type AdminContentEditorPagePayload = Exclude<AdminContentWorkspaceEditorPayload, { collection: 'materials' }>;
export type AdminContentEditorIslandKey = AdminContentEditorPageCollectionKey;

export type AdminContentEditorOutlines = {
  essayOutlineItems: EditorOutlineEssaySourceItem[];
  bitsOutlineItems: EditorOutlineListSourceItem[];
};

export type AdminContentEditorIslandProps =
  | EssayEditorShellProps
  | BitsEditorIslandProps
  | PicksEditorIslandProps
  | MemoEditorIslandProps
  | AboutEditorIslandProps;

type BuildBaseIslandPropsInput<Payload extends AdminContentEditorPagePayload> = {
  payload: Payload;
  endpoints: AdminContentEditorEndpoints;
  returnHref: string;
};

type BuildEssayIslandPropsInput = BuildBaseIslandPropsInput<AdminEssayEditorPayload> & {
  essayOutlineItems: EditorOutlineEssaySourceItem[];
  initialArticleInfoOpen: boolean;
  authorProfiles: readonly AuthorLibraryProfile[];
};

type BuildBitsIslandPropsInput = BuildBaseIslandPropsInput<AdminBitsEditorPayload> & {
  defaultAuthor: BitsCardAuthorInput;
  bitsOutlineItems: EditorOutlineListSourceItem[];
};

type BuildPicksIslandPropsInput = BuildBaseIslandPropsInput<AdminPicksEditorPayload>;
type BuildMemoIslandPropsInput = BuildBaseIslandPropsInput<AdminMemoEditorPayload>;
type BuildAboutIslandPropsInput = BuildBaseIslandPropsInput<AdminAboutEditorPayload>;

type BuildIslandPropsInput<Payload extends AdminContentEditorPagePayload> =
  Payload extends AdminEssayEditorPayload
    ? BuildEssayIslandPropsInput
    : Payload extends AdminBitsEditorPayload
      ? BuildBitsIslandPropsInput
      : Payload extends AdminPicksEditorPayload
        ? BuildPicksIslandPropsInput
        : Payload extends AdminAboutEditorPayload
          ? BuildAboutIslandPropsInput
          : BuildMemoIslandPropsInput;

export type AdminContentEditorPageRegistration<
  Collection extends AdminContentEditorPageCollectionKey = AdminContentEditorPageCollectionKey,
  Payload extends AdminContentEditorPagePayload = AdminContentEditorPagePayload
> = {
  collection: Collection;
  workspaceClassName: string;
  articleClassName: string;
  island: AdminContentEditorIslandKey;
  styleSlots: readonly AdminContentEditorStyleSlot[];
  outlineKind: AdminContentEditorOutlineKind;
  infoTrigger: AdminContentEditorInfoTrigger | null;
  usesImagePicker: boolean;
  resolveReturnHref: (input: {
    withBase: WithBase;
    collectionHref: string;
  }) => string;
  buildIslandProps: (input: BuildIslandPropsInput<Payload>) => AdminContentEditorIslandProps;
};

export type AdminContentEditorOutlineRegistration = {
  collection: AdminContentWriteCollectionKey;
  outlineKind: AdminContentEditorOutlineKind;
};

const loadArticleStylesHref = async (): Promise<string> => {
  const { default: articleStylesHref } = await import('../../styles/article.css?url');
  return articleStylesHref;
};

const loadAboutStylesHref = async (): Promise<string> => {
  const { default: aboutStylesHref } = await import('../../styles/about.css?url');
  return aboutStylesHref;
};


const loadAdminImageSharedStylesHref = async (): Promise<string> => {
  const { default: adminImageSharedStylesHref } = await import('../../styles/components/admin/images/shared.css?url');
  return adminImageSharedStylesHref;
};

const STYLE_SLOT_LOADERS = {
  adminContentEditor: async () =>
    (await import('../../styles/components/admin/content/edit-core.css?url')).default,
  adminContentEditorAbout: async () =>
    (await import('../../styles/components/admin/content/edit-about.css?url')).default,
  adminContentEditorBits: async () =>
    (await import('../../styles/components/admin/content/edit-bits.css?url')).default,
  adminContentEditorFrontmatter: async () =>
    (await import('../../styles/components/admin/content/edit-frontmatter.css?url')).default,
  adminContentEditorGalleryInsert: async () =>
    (await import('../../styles/components/admin/content/edit-gallery-insert.css?url')).default,
  adminContentEditorImageInsert: async () =>
    (await import('../../styles/components/admin/content/edit-image-insert.css?url')).default,
  adminContentEditorMemo: async () =>
    (await import('../../styles/components/admin/content/edit-memo.css?url')).default,
  adminContentEditorStructured: async () =>
    (await import('../../styles/components/admin/content/edit-structured.css?url')).default,
  adminImageShared: loadAdminImageSharedStylesHref,
  about: loadAboutStylesHref,
  article: loadArticleStylesHref
} as const satisfies Record<AdminContentEditorStyleSlot, () => Promise<string>>;

export const ADMIN_CONTENT_EDITOR_BASE_STYLE_SLOTS = ['adminContentEditor'] as const satisfies readonly AdminContentEditorStyleSlot[];

export const loadAdminContentEditorStyleSlot = async (
  slot: AdminContentEditorStyleSlot
): Promise<string> =>
  STYLE_SLOT_LOADERS[slot]();

export const loadAdminContentEditorStyleHrefs = async (
  slots: readonly AdminContentEditorStyleSlot[],
  loadStyleSlot: (slot: AdminContentEditorStyleSlot) => Promise<string> = loadAdminContentEditorStyleSlot
): Promise<string[]> =>
  Promise.all(slots.map((slot) => loadStyleSlot(slot)));

export const loadAdminContentEditorBaseStyleHrefs = async (
  loadStyleSlot?: (slot: AdminContentEditorStyleSlot) => Promise<string>
): Promise<string[]> =>
  loadAdminContentEditorStyleHrefs(ADMIN_CONTENT_EDITOR_BASE_STYLE_SLOTS, loadStyleSlot);

const loadEssayOutlineItems = async (withBase: WithBase): Promise<EditorOutlineEssaySourceItem[]> => {
  const manifest = await loadAdminContentSourceManifest();
  return (await loadAdminContentSourceIndex(manifest, 'longform'))
    .map((item) => ({
      entryId: item.id,
      title: item.title,
      editHref: withBase(getAdminContentEntryEditHref('longform', item.id)),
      dateLabel: item.dateLabel,
      sourceError: item.sourceError
    }));
};

const loadBitsOutlineItems = async (withBase: WithBase): Promise<EditorOutlineListSourceItem[]> => {
  const manifest = await loadAdminContentSourceManifest();
  return (await loadAdminContentSourceIndex(manifest, 'bits'))
    .map((item) => ({
      entryId: item.id,
      title: item.title,
      editHref: withBase(getAdminContentEntryEditHref('bits', item.id)),
      dateLabel: item.dateLabel,
      sourceError: item.sourceError
    }));
};

export const createEmptyAdminContentEditorOutlines = (): AdminContentEditorOutlines => ({
  essayOutlineItems: [],
  bitsOutlineItems: []
});

export const loadAdminContentEditorOutlines = async (
  registration: AdminContentEditorOutlineRegistration,
  withBase: WithBase
): Promise<AdminContentEditorOutlines> => {
  if (registration.outlineKind === 'longform') {
    return {
      essayOutlineItems: await loadEssayOutlineItems(withBase),
      bitsOutlineItems: []
    };
  }

  if (registration.outlineKind === 'list') {
    return {
      essayOutlineItems: [],
      bitsOutlineItems: await loadBitsOutlineItems(withBase)
    };
  }

  return createEmptyAdminContentEditorOutlines();
};

const buildEssayEditorIslandProps = ({
  payload,
  endpoints,
  returnHref,
  essayOutlineItems,
  initialArticleInfoOpen,
  authorProfiles
}: BuildEssayIslandPropsInput): EssayEditorShellProps => ({
  ...endpoints,
  returnHref,
  entryId: payload.entryId,
  relativePath: payload.relativePath,
  defaultPublicSlug: payload.defaultPublicSlug,
  revision: payload.revision,
  initialFrontmatter: payload.values,
  initialBody: payload.bodyText,
  essayOutlineItems,
  initialArticleInfoOpen,
  authorProfiles
});

const buildBitsEditorIslandProps = ({
  payload,
  endpoints,
  returnHref,
  defaultAuthor,
  bitsOutlineItems
}: BuildBitsIslandPropsInput): BitsEditorIslandProps => ({
  ...endpoints,
  returnHref,
  entryId: payload.entryId,
  relativePath: payload.relativePath,
  defaultPublicSlug: payload.defaultPublicSlug,
  revision: payload.revision,
  initialFrontmatter: payload.values,
  initialBody: payload.bodyText,
  defaultAuthor,
  bitsOutlineItems
});

const buildPicksEditorIslandProps = ({
  payload,
  endpoints,
  returnHref
}: BuildPicksIslandPropsInput): PicksEditorIslandProps => ({
  endpoint: endpoints.endpoint,
  exportEndpoint: endpoints.exportEndpoint,
  deleteEndpoint: endpoints.deleteEndpoint,
  returnHref,
  entryId: payload.entryId,
  relativePath: payload.relativePath,
  revision: payload.revision,
  initialFrontmatter: payload.values,
  initialBody: payload.bodyText
});

const buildMemoEditorIslandProps = ({
  payload,
  endpoints,
  returnHref
}: BuildMemoIslandPropsInput): MemoEditorIslandProps => ({
  endpoint: endpoints.endpoint,
  exportEndpoint: endpoints.exportEndpoint,
  previewEndpoint: endpoints.previewEndpoint,
  imageUploadEndpoint: endpoints.imageUploadEndpoint,
  returnHref,
  entryId: payload.entryId,
  revision: payload.revision,
  initialFrontmatter: payload.values,
  initialBody: payload.bodyText
});

const buildAboutEditorIslandProps = ({
  payload,
  endpoints,
  returnHref
}: BuildAboutIslandPropsInput): AboutEditorIslandProps => ({
  endpoint: endpoints.endpoint,
  exportEndpoint: endpoints.exportEndpoint,
  returnHref,
  entryId: payload.entryId,
  revision: payload.revision,
  initialContent: payload.values
});

const CONTENT_EDITOR_PAGE_REGISTRY = {
  longform: {
    collection: 'longform',
    workspaceClassName: 'admin-content-edit-page--essay',
    articleClassName: 'admin-content-editor--svelte',
    island: 'longform',
    styleSlots: [
      'article',
      'adminContentEditor',
      'adminContentEditorFrontmatter',
      'adminContentEditorImageInsert',
      'adminContentEditorGalleryInsert'
    ],
    outlineKind: 'longform',
    infoTrigger: {
      attribute: 'data-admin-article-info-trigger',
      label: '修改信息',
      panelId: 'admin-editor-frontmatter-panel'
    },
    usesImagePicker: getAdminContentCollectionCapability('longform').imagePicker,
    resolveReturnHref: ({ withBase }) => withBase('/admin/content/'),
    buildIslandProps: buildEssayEditorIslandProps
  },
  bits: {
    collection: 'bits',
    workspaceClassName: 'admin-content-edit-page--bits',
    articleClassName: 'admin-content-editor--bits',
    island: 'bits',
    styleSlots: [
      'adminContentEditor',
      'adminContentEditorBits',
      'adminContentEditorFrontmatter',
      'adminImageShared'
    ],
    outlineKind: 'list',
    infoTrigger: {
      attribute: 'data-admin-bits-info-trigger',
      label: '修改信息',
      panelId: 'admin-editor-frontmatter-panel'
    },
    usesImagePicker: getAdminContentCollectionCapability('bits').imagePicker,
    resolveReturnHref: ({ collectionHref }) => collectionHref,
    buildIslandProps: buildBitsEditorIslandProps
  },
  picks: {
    collection: 'picks',
    workspaceClassName: 'admin-content-edit-page--picks',
    articleClassName: 'admin-content-editor--structured admin-content-editor--picks',
    island: 'picks',
    styleSlots: ['adminContentEditor', 'adminContentEditorStructured'],
    outlineKind: 'none',
    infoTrigger: null,
    usesImagePicker: getAdminContentCollectionCapability('picks').imagePicker,
    resolveReturnHref: ({ collectionHref }) => collectionHref,
    buildIslandProps: buildPicksEditorIslandProps
  },
  memo: {
    collection: 'memo',
    workspaceClassName: 'admin-content-edit-page--memo',
    articleClassName: 'admin-content-editor--memo',
    island: 'memo',
    styleSlots: [
      'article',
      'adminContentEditor',
      'adminContentEditorMemo',
      'adminContentEditorImageInsert'
    ],
    outlineKind: 'none',
    infoTrigger: null,
    usesImagePicker: getAdminContentCollectionCapability('memo').imagePicker,
    resolveReturnHref: ({ collectionHref }) => collectionHref,
    buildIslandProps: buildMemoEditorIslandProps
  },
  about: {
    collection: 'about',
    workspaceClassName: 'admin-content-edit-page--about',
    articleClassName: 'admin-content-editor--about',
    island: 'about',
    styleSlots: ['about', 'adminContentEditor', 'adminContentEditorAbout'],
    outlineKind: 'none',
    infoTrigger: null,
    usesImagePicker: getAdminContentCollectionCapability('about').imagePicker,
    resolveReturnHref: ({ collectionHref }) => collectionHref,
    buildIslandProps: buildAboutEditorIslandProps
  }
} as const satisfies {
  [Collection in AdminContentEditorPageCollectionKey]: AdminContentEditorPageRegistration<
    Collection,
    Extract<AdminContentEditorPagePayload, { collection: Collection }>
  >;
};

export const getAdminContentEditorPageRegistration = <Collection extends AdminContentEditorPageCollectionKey>(
  collection: Collection
): (typeof CONTENT_EDITOR_PAGE_REGISTRY)[Collection] =>
  CONTENT_EDITOR_PAGE_REGISTRY[collection];

export const getAdminContentEditorStyleSlots = (
  collection: AdminContentEditorPageCollectionKey
): readonly AdminContentEditorStyleSlot[] =>
  getAdminContentEditorPageRegistration(collection).styleSlots;

export const buildAdminContentEditorIslandProps = ({
  payload,
  endpoints,
  returnHref,
  defaultAuthor,
  outlines,
  initialArticleInfoOpen,
  authorProfiles
}: {
  payload: AdminContentEditorPagePayload;
  endpoints: AdminContentEditorEndpoints;
  returnHref: string;
  defaultAuthor: BitsCardAuthorInput;
  outlines: AdminContentEditorOutlines;
  initialArticleInfoOpen: boolean;
  authorProfiles: readonly AuthorLibraryProfile[];
}): AdminContentEditorIslandProps => {
  if (payload.collection === 'longform') {
    return CONTENT_EDITOR_PAGE_REGISTRY.longform.buildIslandProps({
      payload,
      endpoints,
      returnHref,
      essayOutlineItems: outlines.essayOutlineItems,
      initialArticleInfoOpen,
      authorProfiles
    });
  }

  if (payload.collection === 'bits') {
    return CONTENT_EDITOR_PAGE_REGISTRY.bits.buildIslandProps({
      payload,
      endpoints,
      returnHref,
      defaultAuthor,
      bitsOutlineItems: outlines.bitsOutlineItems
    });
  }

  if (payload.collection === 'picks') {
    return CONTENT_EDITOR_PAGE_REGISTRY.picks.buildIslandProps({
      payload,
      endpoints,
      returnHref
    });
  }


  if (payload.collection === 'about') {
    return CONTENT_EDITOR_PAGE_REGISTRY.about.buildIslandProps({
      payload,
      endpoints,
      returnHref
    });
  }

  return CONTENT_EDITOR_PAGE_REGISTRY.memo.buildIslandProps({
    payload,
    endpoints,
    returnHref
  });
};

