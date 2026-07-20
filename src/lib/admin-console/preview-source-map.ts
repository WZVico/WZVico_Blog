export const PREVIEW_SOURCE_START_ATTR = 'data-admin-source-start';
export const PREVIEW_SOURCE_END_ATTR = 'data-admin-source-end';

export const PREVIEW_SOURCE_BLOCK_TAG_NAMES: ReadonlySet<string> = new Set([
  'blockquote',
  'details',
  'div',
  'dl',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'li',
  'ol',
  'p',
  'pre',
  'table',
  'ul'
]);

export type PreviewSourceRange = {
  start: number;
  end: number;
};

const getRangeSpan = (range: PreviewSourceRange): number =>
  Math.max(0, range.end - range.start);

const getRangeDistance = (range: PreviewSourceRange, sourceOffset: number): number => {
  if (sourceOffset < range.start) return range.start - sourceOffset;
  if (sourceOffset > range.end) return sourceOffset - range.end;
  return 0;
};

/**
 * Selects the narrowest rendered block containing the source offset. When the
 * cursor is on whitespace between blocks, selects the nearest block instead.
 */
export const findBestPreviewSourceRangeIndex = (
  ranges: readonly PreviewSourceRange[],
  sourceOffset: number
): number => {
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestSpan = Number.POSITIVE_INFINITY;

  ranges.forEach((range, index) => {
    const distance = getRangeDistance(range, sourceOffset);
    const span = getRangeSpan(range);

    if (
      distance < bestDistance
      || (distance === bestDistance && span < bestSpan)
      || (distance === bestDistance && span === bestSpan && index > bestIndex)
    ) {
      bestIndex = index;
      bestDistance = distance;
      bestSpan = span;
    }
  });

  return bestIndex;
};
