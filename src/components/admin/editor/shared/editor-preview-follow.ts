import {
  findBestPreviewSourceRangeIndex,
  PREVIEW_SOURCE_END_ATTR,
  PREVIEW_SOURCE_START_ATTR,
  type PreviewSourceRange
} from '../../../../lib/admin-console/preview-source-map';

export type EditorSourcePosition = {
  offset: number;
  line: number;
  viewportRatio: number;
};

export const EDITOR_FOCUS_BAND_START_RATIO = 0.3;
export const EDITOR_FOCUS_BAND_END_RATIO = 0.6;
export const EDITOR_FOCUS_BAND_CENTER_RATIO = 0.45;
export const PREVIEW_FOCUS_TARGET_RATIO = 0.5;

type PreviewSourceTarget = PreviewSourceRange & {
  element: HTMLElement;
};

export type PreviewFollowScrollInput = PreviewSourceRange & {
  sourceOffset: number;
  targetTop: number;
  targetHeight: number;
  currentScrollTop: number;
  scrollableDistance: number;
  viewportHeight: number;
  viewportRatio: number;
  force?: boolean;
};

const DEFAULT_VIEWPORT_RATIO = 0.3;
const MIN_VIEWPORT_RATIO = 0.2;
const MAX_VIEWPORT_RATIO = 0.72;
const COMFORTABLE_VIEWPORT_START_RATIO = 0.16;
const COMFORTABLE_VIEWPORT_END_RATIO = 0.84;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const parseSourceOffset = (element: HTMLElement, attribute: string): number | null => {
  const rawValue = element.getAttribute(attribute);
  if (rawValue === null || rawValue.trim() === '') return null;

  const value = Number(rawValue);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

const readPreviewSourceTargets = (articleElement: HTMLElement): PreviewSourceTarget[] =>
  Array.from(articleElement.querySelectorAll<HTMLElement>(`[${PREVIEW_SOURCE_START_ATTR}][${PREVIEW_SOURCE_END_ATTR}]`))
    .map((element): PreviewSourceTarget | null => {
      const start = parseSourceOffset(element, PREVIEW_SOURCE_START_ATTR);
      const end = parseSourceOffset(element, PREVIEW_SOURCE_END_ATTR);
      if (start === null || end === null || end < start) return null;
      return { element, start, end };
    })
    .filter((target): target is PreviewSourceTarget => target !== null);

const getSourceProgress = ({ start, end, sourceOffset }: Pick<PreviewFollowScrollInput, 'start' | 'end' | 'sourceOffset'>) => {
  const span = end - start;
  if (span <= 0) return 0;
  return clamp((sourceOffset - start) / span, 0, 1);
};

export const getPreviewFollowScrollTop = ({
  start,
  end,
  sourceOffset,
  targetTop,
  targetHeight,
  currentScrollTop,
  scrollableDistance,
  viewportHeight,
  viewportRatio,
  force = false
}: PreviewFollowScrollInput): number => {
  const sourceProgress = getSourceProgress({ start, end, sourceOffset });
  const targetAnchor = targetTop + targetHeight * sourceProgress;
  const currentViewportAnchor = targetAnchor - currentScrollTop;
  const comfortableStart = viewportHeight * COMFORTABLE_VIEWPORT_START_RATIO;
  const comfortableEnd = viewportHeight * COMFORTABLE_VIEWPORT_END_RATIO;

  if (!force && currentViewportAnchor >= comfortableStart && currentViewportAnchor <= comfortableEnd) {
    return currentScrollTop;
  }

  const desiredViewportRatio = clamp(
    Number.isFinite(viewportRatio) ? viewportRatio : DEFAULT_VIEWPORT_RATIO,
    MIN_VIEWPORT_RATIO,
    MAX_VIEWPORT_RATIO
  );
  return clamp(
    targetAnchor - viewportHeight * desiredViewportRatio,
    0,
    Math.max(0, scrollableDistance)
  );
};

export const scrollPreviewToSourcePosition = ({
  previewElement,
  articleElement,
  position,
  force = false
}: {
  previewElement: HTMLElement | null;
  articleElement: HTMLElement | null;
  position: EditorSourcePosition | null;
  force?: boolean;
}): boolean => {
  if (!previewElement || !articleElement || !position) return false;

  const targets = readPreviewSourceTargets(articleElement);
  const targetIndex = findBestPreviewSourceRangeIndex(targets, position.offset);
  const target = targetIndex >= 0 ? targets[targetIndex] : null;
  if (!target) return false;

  const previewRect = previewElement.getBoundingClientRect();
  const targetRect = target.element.getBoundingClientRect();
  const nextScrollTop = getPreviewFollowScrollTop({
    start: target.start,
    end: target.end,
    sourceOffset: position.offset,
    targetTop: targetRect.top - previewRect.top + previewElement.scrollTop,
    targetHeight: targetRect.height,
    currentScrollTop: previewElement.scrollTop,
    scrollableDistance: Math.max(0, previewElement.scrollHeight - previewElement.clientHeight),
    viewportHeight: previewElement.clientHeight,
    viewportRatio: position.viewportRatio,
    force
  });

  if (Math.abs(nextScrollTop - previewElement.scrollTop) < 1) return false;
  previewElement.scrollTop = nextScrollTop;
  return true;
};
