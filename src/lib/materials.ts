import rawMaterialsData from '../data/materials.json';

export type MaterialItem = {
  slug: string;
  title: string;
  href: string;
  date?: string;
  label?: string;
  description?: string;
  group?: string;
};

export type MaterialGroup = {
  title: string;
  list: Array<MaterialItem & { displayDate: string }>;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_DAY_RE = /^\d{2}-\d{2}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const normalizeDate = (value: unknown): string | undefined => {
  const raw = asString(value);
  if (!raw) return undefined;
  return DATE_RE.test(raw) ? raw : undefined;
};

const normalizeGroup = (value: unknown, date?: string): string => {
  const raw = asString(value);
  if (raw) return raw;
  return date ? date.slice(0, 4) : '资料';
};

const toDisplayDate = (date?: string): string => {
  if (!date) return 'LINK';
  const monthDay = date.slice(5);
  return MONTH_DAY_RE.test(monthDay) ? monthDay.replace('-', '/') : 'LINK';
};

const normalizeSlug = (value: unknown, fallback: string): string => {
  const raw = asString(value);
  if (!raw) return fallback;
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
};

export const getMaterials = (): MaterialItem[] => {
  const materialsData: unknown = rawMaterialsData;
  const rawItems = isRecord(materialsData) && Array.isArray(materialsData.items)
    ? materialsData.items
    : [];

  return rawItems.flatMap((item, index) => {
    if (!isRecord(item)) return [];

    const title = asString(item.title);
    const href = asString(item.href);
    if (!title || !href) return [];

    const date = normalizeDate(item.date);
    const label = asString(item.label);
    const description = asString(item.description);
    return [{
      slug: normalizeSlug(item.slug, `material-${index + 1}`),
      title,
      href,
      ...(date ? { date } : {}),
      ...(label ? { label } : {}),
      ...(description ? { description } : {}),
      group: normalizeGroup(item.group, date)
    }];
  });
};

export const groupMaterials = (items: readonly MaterialItem[]): MaterialGroup[] => {
  const groups = new Map<string, Array<MaterialItem & { displayDate: string; sourceIndex: number }>>();

  items.forEach((item, index) => {
    const groupTitle = normalizeGroup(item.group, item.date);
    const list = groups.get(groupTitle) ?? [];
    list.push({
      ...item,
      displayDate: toDisplayDate(item.date),
      sourceIndex: index
    });
    groups.set(groupTitle, list);
  });

  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a, 'zh-CN', { numeric: true }))
    .map(([title, list]) => ({
      title,
      list: list
        .sort((a, b) => {
          if (a.date && b.date && a.date !== b.date) return b.date.localeCompare(a.date);
          if (a.date && !b.date) return -1;
          if (!a.date && b.date) return 1;
          return a.sourceIndex - b.sourceIndex;
        })
        .map(({ sourceIndex: _sourceIndex, ...item }) => item)
    }));
};
