const META_LINE_SELECTOR = '.meta-line--items';
const META_ITEM_SELECTOR = ':scope > .meta-line__item';
const LINE_START_CLASS = 'is-line-start';
const LINE_BREAK_TOLERANCE = 1;

const getVisibleRect = (element: HTMLElement): DOMRect | null => {
  const rects = element.getClientRects();
  return rects.item(0);
};

const updateMetaLineStarts = (): void => {
  const metaLines = Array.from(document.querySelectorAll<HTMLElement>(META_LINE_SELECTOR));

  metaLines.forEach((metaLine) => {
    const items = Array.from(metaLine.querySelectorAll<HTMLElement>(META_ITEM_SELECTOR));

    items.forEach((item) => item.classList.remove(LINE_START_CLASS));

    let currentLineBottom: number | null = null;

    items.forEach((item) => {
      const itemRect = getVisibleRect(item);
      if (!itemRect) return;

      if (currentLineBottom === null) {
        currentLineBottom = itemRect.bottom;
        return;
      }

      if (itemRect.top >= currentLineBottom - LINE_BREAK_TOLERANCE) {
        item.classList.add(LINE_START_CLASS);
        currentLineBottom = itemRect.bottom;
        return;
      }

      currentLineBottom = Math.max(currentLineBottom, itemRect.bottom);
    });
  });
};

let frameId = 0;

const scheduleMetaLineStartUpdate = (): void => {
  if (frameId) window.cancelAnimationFrame(frameId);
  frameId = window.requestAnimationFrame(() => {
    frameId = 0;
    updateMetaLineStarts();
  });
};

const startMetaLineStartUpdates = (): void => {
  scheduleMetaLineStartUpdate();
  window.addEventListener('load', scheduleMetaLineStartUpdate, { once: true });
  window.addEventListener('resize', scheduleMetaLineStartUpdate, { passive: true });

  document.fonts?.ready.then(scheduleMetaLineStartUpdate).catch(() => {});
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startMetaLineStartUpdates, { once: true });
} else {
  startMetaLineStartUpdates();
}
