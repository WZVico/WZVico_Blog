import { getMaterials } from '../../lib/materials';

export async function GET() {
  const index = getMaterials().map((item) => ({
    slug: item.slug,
    href: item.href,
    title: item.title,
    description: item.description ?? '',
    tags: [item.label, item.group].filter((value): value is string => Boolean(value)),
    text: [item.href, item.description, item.label, item.group].filter(Boolean).join(' '),
    date: item.date ?? null
  }));

  return new Response(JSON.stringify(index), {
    headers: {
      'content-type': 'application/json; charset=utf-8'
    }
  });
}
