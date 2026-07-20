import { describe, expect, it } from 'vitest';
import {
  findBestPreviewSourceRangeIndex
} from '../src/lib/admin-console/preview-source-map';
import {
  EDITOR_FOCUS_BAND_CENTER_RATIO,
  EDITOR_FOCUS_BAND_END_RATIO,
  EDITOR_FOCUS_BAND_START_RATIO,
  PREVIEW_FOCUS_TARGET_RATIO,
  getPreviewFollowScrollTop
} from '../src/components/admin/editor/shared/editor-preview-follow';

describe('longform preview source following', () => {
  it('prefers the narrowest rendered block containing the cursor', () => {
    const ranges = [
      { start: 0, end: 120 },
      { start: 12, end: 42 },
      { start: 18, end: 30 }
    ];

    expect(findBestPreviewSourceRangeIndex(ranges, 24)).toBe(2);
  });

  it('uses the nearest rendered block for whitespace between blocks', () => {
    const ranges = [
      { start: 0, end: 10 },
      { start: 14, end: 30 }
    ];

    expect(findBestPreviewSourceRangeIndex(ranges, 11)).toBe(0);
    expect(findBestPreviewSourceRangeIndex(ranges, 13)).toBe(1);
  });

  it('aligns the semantic preview position to the editor cursor height', () => {
    expect(getPreviewFollowScrollTop({
      start: 100,
      end: 200,
      sourceOffset: 150,
      targetTop: 1000,
      targetHeight: 200,
      currentScrollTop: 0,
      scrollableDistance: 2000,
      viewportHeight: 500,
      viewportRatio: 0.4,
      force: true
    })).toBe(900);
  });

  it('maps the editor 30%-60% focus band midpoint to the preview center', () => {
    expect(EDITOR_FOCUS_BAND_START_RATIO).toBe(0.3);
    expect(EDITOR_FOCUS_BAND_CENTER_RATIO).toBe(0.45);
    expect(EDITOR_FOCUS_BAND_END_RATIO).toBe(0.6);
    expect(PREVIEW_FOCUS_TARGET_RATIO).toBe(0.5);

    expect(getPreviewFollowScrollTop({
      start: 100,
      end: 200,
      sourceOffset: 150,
      targetTop: 1000,
      targetHeight: 200,
      currentScrollTop: 0,
      scrollableDistance: 2000,
      viewportHeight: 500,
      viewportRatio: PREVIEW_FOCUS_TARGET_RATIO,
      force: true
    })).toBe(850);
  });

  it('does not jitter while the active preview position remains comfortably visible', () => {
    expect(getPreviewFollowScrollTop({
      start: 100,
      end: 200,
      sourceOffset: 150,
      targetTop: 1000,
      targetHeight: 200,
      currentScrollTop: 800,
      scrollableDistance: 2000,
      viewportHeight: 500,
      viewportRatio: 0.4
    })).toBe(800);
  });

  it('clamps the requested position to the preview scroll range', () => {
    expect(getPreviewFollowScrollTop({
      start: 0,
      end: 10,
      sourceOffset: 0,
      targetTop: 20,
      targetHeight: 40,
      currentScrollTop: 200,
      scrollableDistance: 1000,
      viewportHeight: 500,
      viewportRatio: 0.5,
      force: true
    })).toBe(0);
  });
});
