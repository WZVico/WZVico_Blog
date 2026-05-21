type SplitTagInputOptions = {
  stripLeadingHash?: boolean;
  fallbackWhitespace?: boolean;
};

const HARD_DELIMITERS = new Set([',', '，', '、', '；', ';', '\n', '\r']);
const SPACE_RE = /\s+/g;

const getClosingQuote = (char: string): string | null => {
  switch (char) {
    case '"':
    case "'":
      return char;
    case '“':
      return '”';
    case '‘':
      return '’';
    default:
      return null;
  }
};

const hasHardDelimiter = (value: string): boolean => {
  let closingQuote: string | null = null;

  for (const char of value) {
    if (closingQuote) {
      if (char === closingQuote) closingQuote = null;
      continue;
    }

    closingQuote = getClosingQuote(char);
    if (closingQuote) continue;
    if (HARD_DELIMITERS.has(char)) return true;
  }

  return false;
};

const pushPart = (parts: string[], part: string): void => {
  parts.push(part);
};

const splitOutsideQuotes = (value: string, splitOnWhitespace: boolean): string[] => {
  const parts: string[] = [];
  let buffer = '';
  let closingQuote: string | null = null;

  for (const char of value) {
    if (closingQuote) {
      if (char === closingQuote) {
        closingQuote = null;
      } else {
        buffer += char;
      }
      continue;
    }

    closingQuote = getClosingQuote(char);
    if (closingQuote) continue;

    const shouldSplit = splitOnWhitespace ? /\s/.test(char) : HARD_DELIMITERS.has(char);
    if (shouldSplit) {
      pushPart(parts, buffer);
      buffer = '';
      continue;
    }

    buffer += char;
  }

  pushPart(parts, buffer);
  return parts;
};

const normalizeTagPart = (
  value: string,
  options: SplitTagInputOptions
): string => {
  const trimmed = value.trim().replace(SPACE_RE, ' ');
  const withoutHash = options.stripLeadingHash ? trimmed.replace(/^#+/, '').trim() : trimmed;
  return withoutHash.replace(SPACE_RE, ' ');
};

export const splitTagInput = (
  value: string,
  options: SplitTagInputOptions = {}
): string[] => {
  const fallbackWhitespace = options.fallbackWhitespace ?? true;
  const splitOnWhitespace = fallbackWhitespace && !hasHardDelimiter(value);

  return Array.from(
    new Set(
      splitOutsideQuotes(value, splitOnWhitespace)
        .map((part) => normalizeTagPart(part, options))
        .filter(Boolean)
    )
  );
};
