import { getCollection, type CollectionEntry } from 'astro:content';
import { formatISODateUtc } from '../utils/format';

export type MaterialsEntry = CollectionEntry<'materials'>;

export type MaterialItem = {
  slug: string;
  title: string;
  href: string;
  date: Date;
  dateValue: string;
  label?: string;
  description?: string;
};

export type MaterialGroup = {
  title: string;
  list: Array<MaterialItem & { displayDate: string }>;
};

const toDisplayDate = (date: Date): string => {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${month}/${day}`;
};

export const getMaterials = async (): Promise<MaterialItem[]> => {
  const entries = await getCollection('materials');

  return entries
    .map((entry) => ({
      slug: entry.id.replace(/\.md$/i, ''),
      title: entry.data.title,
      href: entry.data.href,
      date: entry.data.date,
      dateValue: formatISODateUtc(entry.data.date),
      ...(entry.data.label ? { label: entry.data.label } : {}),
      ...(entry.data.description ? { description: entry.data.description } : {})
    }))
    .sort((left, right) => right.date.valueOf() - left.date.valueOf());
};

export const groupMaterials = (items: readonly MaterialItem[]): MaterialGroup[] => {
  const groups = new Map<number, Array<MaterialItem & { displayDate: string; sourceIndex: number }>>();

  items.forEach((item, index) => {
    const year = item.date.getUTCFullYear();
    const list = groups.get(year) ?? [];
    list.push({
      ...item,
      displayDate: toDisplayDate(item.date),
      sourceIndex: index
    });
    groups.set(year, list);
  });

  return Array.from(groups.entries())
    .sort(([left], [right]) => right - left)
    .map(([year, list]) => ({
      title: String(year),
      list: list
        .sort((left, right) => {
          const dateOrder = right.date.valueOf() - left.date.valueOf();
          return dateOrder || left.sourceIndex - right.sourceIndex;
        })
        .map(({ sourceIndex: _sourceIndex, ...item }) => item)
    }));
};
