const TAG_ITEM_SELECTOR = '.meta-line__item--tags';
const META_ITEM_SELECTOR = ':scope > .meta-line__item';
const AVATAR_SELECTOR = '.article-author-avatar';
const LINE_START_CLASS = 'is-line-start';
const AFTER_AVATAR_LINE_CLASS = 'is-after-avatar-line';

const getVisibleRect = (element: HTMLElement): DOMRect | null => {
  const rects = element.getClientRects();
  return rects.item(0);
};

const getMetaItemsBefore = (tagItem: HTMLElement): HTMLElement[] => {
  const metaLine = tagItem.closest<HTMLElement>('.meta-line--items');
  if (!metaLine) return [];

  const items = Array.from(metaLine.querySelectorAll<HTMLElement>(META_ITEM_SELECTOR));
  const tagIndex = items.indexOf(tagItem);
  return tagIndex > 0 ? items.slice(0, tagIndex) : [];
};

const getPreviousVisibleMetaItem = (tagItem: HTMLElement): HTMLElement | null => {
  const previousItems = getMetaItemsBefore(tagItem);

  for (let index = previousItems.length - 1; index >= 0; index -= 1) {
    const item = previousItems[index];
    if (item && getVisibleRect(item)) return item;
  }

  return null;
};

const hasVisibleAvatarBeforeTagLine = (tagItem: HTMLElement, tagRect: DOMRect): boolean =>
  getMetaItemsBefore(tagItem).some((item) => {
    const itemRect = getVisibleRect(item);
    if (!itemRect || itemRect.top >= tagRect.top - 1) return false;

    return Array.from(item.querySelectorAll<HTMLElement>(AVATAR_SELECTOR))
      .some((avatar) => Boolean(getVisibleRect(avatar)));
  });

const updateMetaTagSeparators = (): void => {
  const tagItems = Array.from(document.querySelectorAll<HTMLElement>(TAG_ITEM_SELECTOR));

  tagItems.forEach((tagItem) => {
    tagItem.classList.remove(LINE_START_CLASS);
    tagItem.classList.remove(AFTER_AVATAR_LINE_CLASS);

    const tagRect = getVisibleRect(tagItem);
    const previousItem = getPreviousVisibleMetaItem(tagItem);
    const previousRect = previousItem ? getVisibleRect(previousItem) : null;

    if (!tagRect || !previousRect) return;

    const isOnNextFlexLine = tagRect.top >= previousRect.bottom - 1;
    tagItem.classList.toggle(LINE_START_CLASS, isOnNextFlexLine);
    tagItem.classList.toggle(
      AFTER_AVATAR_LINE_CLASS,
      isOnNextFlexLine && hasVisibleAvatarBeforeTagLine(tagItem, tagRect)
    );
  });
};

let frameId = 0;

const scheduleMetaTagSeparatorUpdate = (): void => {
  if (frameId) window.cancelAnimationFrame(frameId);
  frameId = window.requestAnimationFrame(() => {
    frameId = 0;
    updateMetaTagSeparators();
  });
};

const startMetaTagSeparatorUpdates = (): void => {
  scheduleMetaTagSeparatorUpdate();
  window.addEventListener('load', scheduleMetaTagSeparatorUpdate, { once: true });
  window.addEventListener('resize', scheduleMetaTagSeparatorUpdate, { passive: true });

  document.fonts?.ready.then(scheduleMetaTagSeparatorUpdate).catch(() => {});
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startMetaTagSeparatorUpdates, { once: true });
} else {
  startMetaTagSeparatorUpdates();
}
