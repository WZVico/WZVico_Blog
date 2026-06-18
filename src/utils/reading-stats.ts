import { cleanMarkdownToText } from './excerpt';

export const READING_SPEED_CHARS_PER_MINUTE = 320;
const READABLE_TEXT_UNIT_REGEX =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[A-Za-z0-9]+/gu;

export function countReadableTextUnits(text: string): number {
  return text.match(READABLE_TEXT_UNIT_REGEX)?.length ?? 0;
}

export function countReadableMarkdownUnits(markdown: string): number {
  return countReadableTextUnits(cleanMarkdownToText(markdown));
}

export function getEstimatedReadingMinutes(readingUnitCount: number): number {
  return Math.max(1, Math.ceil(readingUnitCount / READING_SPEED_CHARS_PER_MINUTE));
}
