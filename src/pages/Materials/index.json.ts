import { getMaterials } from '../../lib/materials';

export async function GET() {
  const index = (await getMaterials()).map((item) => ({
    slug: item.slug,
    href: item.href,
    title: item.title,
    description: item.description ?? '',
    tags: [item.label, item.date.getUTCFullYear().toString()].filter((value): value is string => Boolean(value)),
    text: [item.href, item.description, item.label].filter(Boolean).join(' '),
    date: item.dateValue
  }));

  return new Response(JSON.stringify(index), {
    headers: {
      'content-type': 'application/json; charset=utf-8'
    }
  });
}
