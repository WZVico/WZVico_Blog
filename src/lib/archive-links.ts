type WithBase = (path: string) => string;

export const getArchiveAuthorHref = (authorName: string, withBase: WithBase): string => {
  const normalizedName = authorName.trim();
  const query = new URLSearchParams();
  if (normalizedName) {
    query.set('q', normalizedName);
  }
  const search = query.toString();
  return withBase(`/archive/${search ? `?${search}` : ''}`);
};
