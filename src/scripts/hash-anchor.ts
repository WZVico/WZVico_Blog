const SANITIZED_ID_PREFIX = 'user-content-';

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const decodeHashId = (hash: string): string => {
  const raw = hash.replace(/^#/, '');

  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

const getHashTarget = (hash: string): HTMLElement | null => {
  const id = decodeHashId(hash);
  if (!id) return null;

  return document.getElementById(id)
    ?? (!id.startsWith(SANITIZED_ID_PREFIX)
      ? document.getElementById(`${SANITIZED_ID_PREFIX}${id}`)
      : null);
};

const getSamePageHash = (link: HTMLAnchorElement): string => {
  const nextUrl = new URL(link.href, window.location.href);
  const currentUrl = new URL(window.location.href);

  if (
    nextUrl.origin !== currentUrl.origin
    || nextUrl.pathname !== currentUrl.pathname
    || nextUrl.search !== currentUrl.search
  ) {
    return '';
  }

  return nextUrl.hash;
};

const scrollToHashTarget = (hash: string, behavior: ScrollBehavior): boolean => {
  const target = getHashTarget(hash);
  if (!target) return false;

  target.scrollIntoView({ behavior, block: 'start' });
  return true;
};

document.addEventListener('click', (event) => {
  const target = event.target instanceof Element
    ? event.target.closest<HTMLAnchorElement>('a[href]')
    : null;
  if (!target) return;

  const hash = getSamePageHash(target);
  if (!hash) return;

  const id = decodeHashId(hash);
  if (!id || document.getElementById(id)) return;
  if (!document.getElementById(`${SANITIZED_ID_PREFIX}${id}`)) return;

  event.preventDefault();
  window.history.pushState({}, '', hash);
  scrollToHashTarget(hash, prefersReducedMotion() ? 'auto' : 'smooth');
});

window.addEventListener('hashchange', () => {
  const id = decodeHashId(window.location.hash);
  if (!id || document.getElementById(id)) return;
  scrollToHashTarget(window.location.hash, 'auto');
});

const scrollInitialHash = () => {
  if (!window.location.hash) return;
  const id = decodeHashId(window.location.hash);
  if (!id || document.getElementById(id)) return;
  window.requestAnimationFrame(() => {
    scrollToHashTarget(window.location.hash, 'auto');
  });
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', scrollInitialHash, { once: true });
} else {
  scrollInitialHash();
}

export {};
