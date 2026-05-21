import type {
  SidebarNavId,
  SiteSocialPresetId
} from '@/lib/theme-settings';
import { validateAdminThemeSettings } from '@/lib/admin-console/theme-shared';
import { type EditableSettings } from './form-codec';

export type ValidationIssue = {
  message: string;
  focusTarget?: () => HTMLElement | null;
};

type QueryAll = <T extends Element>(parent: ParentNode, selector: string) => T[];

type ValidationContext = {
  form: HTMLFormElement;
  queryAll: QueryAll;
  footerStartYearMax: number;
  socialCustomAddBtn: HTMLButtonElement;
  inputSiteTitle: HTMLInputElement;
  inputSiteDescription: HTMLTextAreaElement;
  inputSiteDefaultLocale: HTMLInputElement;
  inputSiteFavicon: HTMLInputElement;
  inputSiteFooterStartYear: HTMLInputElement;
  inputSiteFooterShowCurrentYear: HTMLInputElement;
  inputSiteFooterCopyright: HTMLInputElement;
  inputSiteAdminOverviewPublicVisible: HTMLInputElement;
  inputSiteAdminOverviewHiddenMessage: HTMLInputElement;
  inputSiteSocialGithub: HTMLInputElement;
  inputSiteSocialX: HTMLInputElement;
  inputSiteSocialEmail: HTMLInputElement;
  inputSiteSocialGithubDisplayText: HTMLInputElement;
  inputSiteSocialXDisplayText: HTMLInputElement;
  inputSiteSocialEmailDisplayText: HTMLInputElement;
  inputShellBrandTitle: HTMLInputElement;
  inputShellQuote: HTMLTextAreaElement;
  inputHomeIntroLead: HTMLTextAreaElement;
  inputHomeShowIntroLead: HTMLInputElement;
  inputHomeIntroMore: HTMLTextAreaElement;
  inputHomeShowIntroMore: HTMLInputElement;
  inputHomeIntroMoreLinkPrimary: HTMLSelectElement;
  inputHomeShowHero: HTMLInputElement;
  inputHeroImageSrc: HTMLInputElement;
  inputHeroImageAlt: HTMLInputElement;
  inputPageLongformTitle: HTMLInputElement;
  inputPageArchiveTitle: HTMLInputElement;
  inputPageMaterialsTitle: HTMLInputElement;
  inputPageBitsTitle: HTMLInputElement;
  inputPageReadsTitle: HTMLInputElement;
  inputPageAboutTitle: HTMLInputElement;
  inputPageLongformSubtitle: HTMLInputElement;
  inputPageArchiveSubtitle: HTMLInputElement;
  inputPageMaterialsSubtitle: HTMLInputElement;
  inputPageBitsSubtitle: HTMLInputElement;
  inputPageReadsSubtitle: HTMLInputElement;
  inputPageAboutSubtitle: HTMLInputElement;
  inputArticleMetaShowDate: HTMLInputElement;
  inputArticleMetaDateLabel: HTMLInputElement;
  inputArticleMetaShowTags: HTMLInputElement;
  inputArticleMetaShowWordCount: HTMLInputElement;
  inputArticleMetaShowReadingTime: HTMLInputElement;
  inputSidebarActionsShowRssLink: HTMLInputElement;
  inputSidebarActionsShowThemeToggle: HTMLInputElement;
  inputSidebarActionsShowAdminEntry: HTMLInputElement;
  inputPageBitsAuthorName: HTMLInputElement;
  inputPageBitsAuthorAvatar: HTMLInputElement;
  inputSidebarDividerDefault: HTMLInputElement;
  getPresetFieldTarget: (id: SiteSocialPresetId, field: 'order' | 'href') => () => HTMLElement | null;
  getCustomFieldTarget: (
    index: number,
    field: 'order' | 'iconKey' | 'id' | 'label' | 'href' | 'displayText'
  ) => () => HTMLElement | null;
  getCustomVisibilityTarget: (index: number) => () => HTMLElement | null;
  getNavFieldTarget: (
    id: SidebarNavId,
    field: 'label' | 'ornament' | 'order' | 'visible'
  ) => () => HTMLElement | null;
  getFirstNavLabelTarget: () => HTMLElement | null;
};

const CUSTOM_ITEM_PATH_RE = /^site\.socialLinks\.custom\[(\d+)\](?:\.(id|label|href|displayText|iconKey|order|visible))?$/;
const NAV_PATH_RE = /^shell\.nav(?:(?:\.([a-z]+))|\[(\d+)\])(?:\.(id|label|ornament|order|visible))?$/;
const PAGE_TITLE_INPUT_KEYS = ['longform', 'archive', 'bits', 'picks', 'materials', 'about'] as const;

export const createValidation = ({
  form,
  queryAll,
  footerStartYearMax,
  socialCustomAddBtn,
  inputSiteTitle,
  inputSiteDescription,
  inputSiteDefaultLocale,
  inputSiteFavicon,
  inputSiteFooterStartYear,
  inputSiteFooterShowCurrentYear,
  inputSiteFooterCopyright,
  inputSiteAdminOverviewPublicVisible,
  inputSiteAdminOverviewHiddenMessage,
  inputSiteSocialGithub,
  inputSiteSocialX,
  inputSiteSocialEmail,
  inputSiteSocialGithubDisplayText,
  inputSiteSocialXDisplayText,
  inputSiteSocialEmailDisplayText,
  inputShellBrandTitle,
  inputShellQuote,
  inputHomeIntroLead,
  inputHomeShowIntroLead,
  inputHomeIntroMore,
  inputHomeShowIntroMore,
  inputHomeIntroMoreLinkPrimary,
  inputHomeShowHero,
  inputHeroImageSrc,
  inputHeroImageAlt,
  inputPageLongformTitle,
  inputPageArchiveTitle,
  inputPageMaterialsTitle,
  inputPageBitsTitle,
  inputPageReadsTitle,
  inputPageAboutTitle,
  inputPageLongformSubtitle,
  inputPageArchiveSubtitle,
  inputPageMaterialsSubtitle,
  inputPageBitsSubtitle,
  inputPageReadsSubtitle,
  inputPageAboutSubtitle,
  inputArticleMetaShowDate,
  inputArticleMetaDateLabel,
  inputArticleMetaShowTags,
  inputArticleMetaShowWordCount,
  inputArticleMetaShowReadingTime,
  inputSidebarActionsShowRssLink,
  inputSidebarActionsShowThemeToggle,
  inputSidebarActionsShowAdminEntry,
  inputPageBitsAuthorName,
  inputPageBitsAuthorAvatar,
  inputSidebarDividerDefault,
  getPresetFieldTarget,
  getCustomFieldTarget,
  getCustomVisibilityTarget,
  getNavFieldTarget,
  getFirstNavLabelTarget
}: ValidationContext) => {
  const createIssue = (message: string, focusTarget?: () => HTMLElement | null): ValidationIssue =>
    focusTarget ? { message, focusTarget } : { message };

  const resolveIssueField = (issue: ValidationIssue): HTMLElement | null => {
    const candidate = issue.focusTarget?.();
    return candidate instanceof HTMLElement ? candidate : null;
  };

  const clearInvalidFields = (): void => {
    queryAll<HTMLElement>(form, '[aria-invalid="true"]').forEach((element) => element.removeAttribute('aria-invalid'));
  };

  const markInvalidFields = (issues: readonly ValidationIssue[]): void => {
    clearInvalidFields();
    const seen = new Set<HTMLElement>();
    issues.forEach((issue) => {
      const field = resolveIssueField(issue);
      if (!field || seen.has(field)) return;
      field.setAttribute('aria-invalid', 'true');
      seen.add(field);
    });
  };

  const pageTitleTargets: Record<(typeof PAGE_TITLE_INPUT_KEYS)[number], () => HTMLElement | null> = {
    longform: () => inputPageLongformTitle,
    archive: () => inputPageArchiveTitle,
    bits: () => inputPageBitsTitle,
    picks: () => inputPageReadsTitle,
    materials: () => inputPageMaterialsTitle,
    about: () => inputPageAboutTitle
  };
  const pageSubtitleTargets: Record<(typeof PAGE_TITLE_INPUT_KEYS)[number], () => HTMLElement | null> = {
    longform: () => inputPageLongformSubtitle,
    archive: () => inputPageArchiveSubtitle,
    bits: () => inputPageBitsSubtitle,
    picks: () => inputPageReadsSubtitle,
    materials: () => inputPageMaterialsSubtitle,
    about: () => inputPageAboutSubtitle
  };

  const resolveSharedIssueTarget = (path: string): (() => HTMLElement | null) | undefined => {
    switch (path) {
      case 'site.title':
        return () => inputSiteTitle;
      case 'site.description':
        return () => inputSiteDescription;
      case 'site.defaultLocale':
        return () => inputSiteDefaultLocale;
      case 'site.favicon':
        return () => inputSiteFavicon;
      case 'site.footer.startYear':
        return () => inputSiteFooterStartYear;
      case 'site.footer.showCurrentYear':
        return () => inputSiteFooterShowCurrentYear;
      case 'site.footer.copyright':
        return () => inputSiteFooterCopyright;
      case 'site.adminOverview.publicVisible':
        return () => inputSiteAdminOverviewPublicVisible;
      case 'site.adminOverview.hiddenMessage':
        return () => inputSiteAdminOverviewHiddenMessage;
      case 'site.socialLinks.github':
        return () => inputSiteSocialGithub;
      case 'site.socialLinks.x':
        return () => inputSiteSocialX;
      case 'site.socialLinks.email':
        return () => inputSiteSocialEmail;
      case 'site.socialLinks.displayText.github':
        return () => inputSiteSocialGithubDisplayText;
      case 'site.socialLinks.displayText.x':
        return () => inputSiteSocialXDisplayText;
      case 'site.socialLinks.displayText.email':
        return () => inputSiteSocialEmailDisplayText;
      case 'site.socialLinks.custom':
        return () => socialCustomAddBtn;
      case 'shell.brandTitle':
        return () => inputShellBrandTitle;
      case 'shell.quote':
        return () => inputShellQuote;
      case 'shell.nav':
        return getFirstNavLabelTarget;
      case 'home.introLead':
        return () => inputHomeIntroLead;
      case 'home.showIntroLead':
        return () => inputHomeShowIntroLead;
      case 'home.introMore':
        return () => inputHomeIntroMore;
      case 'home.showIntroMore':
        return () => inputHomeShowIntroMore;
      case 'home.introMoreLinks':
        return () => inputHomeIntroMoreLinkPrimary;
      case 'home.heroPresetId':
        return () => inputHomeShowHero;
      case 'home.heroImageSrc':
        return () => inputHeroImageSrc;
      case 'home.heroImageAlt':
        return () => inputHeroImageAlt;
      case 'page.bits.defaultAuthor.name':
        return () => inputPageBitsAuthorName;
      case 'page.bits.defaultAuthor.avatar':
        return () => inputPageBitsAuthorAvatar;
      case 'ui.sidebarActions.showRssLink':
        return () => inputSidebarActionsShowRssLink;
      case 'ui.sidebarActions.showThemeToggle':
        return () => inputSidebarActionsShowThemeToggle;
      case 'ui.sidebarActions.showAdminEntry':
        return () => inputSidebarActionsShowAdminEntry;
      case 'ui.articleMeta.showDate':
        return () => inputArticleMetaShowDate;
      case 'ui.articleMeta.dateLabel':
        return () => inputArticleMetaDateLabel;
      case 'ui.articleMeta.showTags':
        return () => inputArticleMetaShowTags;
      case 'ui.articleMeta.showWordCount':
        return () => inputArticleMetaShowWordCount;
      case 'ui.articleMeta.showReadingTime':
        return () => inputArticleMetaShowReadingTime;
      case 'ui.layout.sidebarDivider':
        return () => inputSidebarDividerDefault;
      default:
        break;
    }

    if (path.startsWith('site.socialLinks.presetOrder.')) {
      const presetId = path.slice('site.socialLinks.presetOrder.'.length) as SiteSocialPresetId;
      return getPresetFieldTarget(presetId, 'order');
    }

    const customMatch = path.match(CUSTOM_ITEM_PATH_RE);
    if (customMatch) {
      const index = Number.parseInt(customMatch[1] ?? '', 10);
      const field = customMatch[2];
      if (!Number.isInteger(index)) return undefined;
      if (field === 'visible') return getCustomVisibilityTarget(index);
      if (field && field !== 'visible') {
        return getCustomFieldTarget(index, field as 'id' | 'label' | 'href' | 'displayText' | 'iconKey' | 'order');
      }
      return getCustomFieldTarget(index, 'id');
    }

    if (path === 'home.introMoreLinks' || path.startsWith('home.introMoreLinks[')) {
      return () => inputHomeIntroMoreLinkPrimary;
    }

    if (path.startsWith('page.')) {
      const segments = path.split('.');
      const pageId = segments[1] as (typeof PAGE_TITLE_INPUT_KEYS)[number] | undefined;
      const field = segments[2];
      if (pageId && PAGE_TITLE_INPUT_KEYS.includes(pageId)) {
        if (field === 'title') return pageTitleTargets[pageId];
        if (field === 'subtitle') return pageSubtitleTargets[pageId];
      }
    }

    const navMatch = path.match(NAV_PATH_RE);
    if (navMatch) {
      const navId = navMatch[1] as SidebarNavId | undefined;
      const field = navMatch[3];
      if (!navId) return getFirstNavLabelTarget;
      if (!field || field === 'id' || field === 'label') return getNavFieldTarget(navId, 'label');
      if (field === 'ornament' || field === 'order' || field === 'visible') {
        return getNavFieldTarget(navId, field);
      }
      return getFirstNavLabelTarget;
    }

    return undefined;
  };

  const validateSettings = (settings: EditableSettings): ValidationIssue[] =>
    validateAdminThemeSettings(settings, { footerStartYearMax }).map((issue) =>
      createIssue(issue.message, resolveSharedIssueTarget(issue.path))
    );

  return {
    validateSettings,
    clearInvalidFields,
    markInvalidFields,
    resolveIssueField
  };
};
