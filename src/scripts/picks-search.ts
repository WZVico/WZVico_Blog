import {
  buildSearchHaystack,
  createDebouncedAsyncRunner,
  tokenizeSearchQuery
} from '../utils/format';

const form = document.querySelector<HTMLFormElement>('[data-picks-search-form]');
const input = document.getElementById('picks-search') as HTMLInputElement | null;
const searchRoot = document.querySelector<HTMLElement>('[data-picks-search-root]');
const searchPanel = document.querySelector<HTMLElement>('[data-picks-search-panel]');
const searchToggleBtn = document.querySelector<HTMLButtonElement>('[data-picks-search-toggle]');
const btn = searchToggleBtn;
const statusEl = document.getElementById('picks-search-status') as HTMLDivElement | null;
const liveEl = document.getElementById('picks-search-live') as HTMLParagraphElement | null;
const browseRoot = document.querySelector<HTMLElement>('[data-picks-browse]');
const content = document.querySelector<HTMLElement>('.picks-content');
const resultsRoot = document.querySelector<HTMLElement>('[data-picks-search-results]');
const resultsSummaryEl = document.querySelector<HTMLElement>('[data-picks-search-results-summary]');
const resultsListEl = document.querySelector<HTMLElement>('[data-picks-search-results-list]');
const clearBtn = document.querySelector<HTMLButtonElement>('[data-picks-search-clear]');

const FILTER_DEBOUNCE_MS = 120;
const HOVER_PREVIEW_CLOSE_DELAY_MS = 48;
const HOVER_PREVIEW_MEDIA_QUERY = '(hover: hover) and (pointer: fine)';
const MAX_VISIBLE_RESULTS = 50;
const QUERY_PARAM_QUERY = 'q';

type PicksItem = {
  key: string;
  href: string;
  title: string;
  text: string;
  tags: string[];
  year: string;
  haystack: string;
};

const filterRunner = createDebouncedAsyncRunner(() => applyFilter(), FILTER_DEBOUNCE_MS);
let hoverCloseTimer: number | null = null;
let hoverPreviewActive = false;
const hoverPreviewMedia = window.matchMedia(HOVER_PREVIEW_MEDIA_QUERY);

const getTrimmedQuery = () => (input?.value || '').trim();
const isSearchOpen = () => searchRoot?.classList.contains('is-open') ?? false;
const hasSearchValue = () => Boolean(getTrimmedQuery());
const isInputFocused = () => document.activeElement === input;
const supportsHoverPreview = () => hoverPreviewMedia.matches;

const setSearchOpen = (open: boolean) => {
  if (!searchRoot) return;
  searchRoot.classList.toggle('is-open', open);
  searchToggleBtn?.setAttribute('aria-expanded', String(open));
  searchPanel?.setAttribute('aria-hidden', String(!open));
  if (input) input.tabIndex = open ? 0 : -1;
};

const clearHoverCloseTimer = () => {
  if (hoverCloseTimer === null) return;
  window.clearTimeout(hoverCloseTimer);
  hoverCloseTimer = null;
};

const openSearch = (options: { focusInput?: boolean } = {}) => {
  clearHoverCloseTimer();
  hoverPreviewActive = false;
  setSearchOpen(true);
  if (options.focusInput) {
    window.setTimeout(() => input?.focus(), 0);
  }
};

const closeSearch = () => {
  clearHoverCloseTimer();
  hoverPreviewActive = false;
  if (hasSearchValue()) return;
  setSearchOpen(false);
};

const openSearchHoverPreview = () => {
  if (!supportsHoverPreview() || !indexItems.length) return;
  clearHoverCloseTimer();
  if (isSearchOpen() && !hoverPreviewActive) return;
  hoverPreviewActive = true;
  setSearchOpen(true);
};

const scheduleHoverPreviewClose = () => {
  if (!supportsHoverPreview() || !hoverPreviewActive) return;
  clearHoverCloseTimer();
  hoverCloseTimer = window.setTimeout(() => {
    hoverCloseTimer = null;
    if (!hoverPreviewActive || hasSearchValue() || isInputFocused()) return;
    closeSearch();
  }, HOVER_PREVIEW_CLOSE_DELAY_MS);
};

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const includesAnyTerm = (value: string, terms: string[]) => {
  if (!value.trim()) return false;
  if (!terms.length) return true;
  const lower = value.toLowerCase();
  return terms.some((term) => lower.includes(term.toLowerCase()));
};

const getContextSnippet = (value: string, terms: string[], maxLength = 120) => {
  const normalized = value.trim();
  if (!normalized) return '';
  if (!terms.length) {
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
  }

  const lower = normalized.toLowerCase();
  let matchIndex = -1;
  let matchedTerm = '';

  for (const term of terms) {
    const index = lower.indexOf(term.toLowerCase());
    if (index >= 0 && (matchIndex === -1 || index < matchIndex)) {
      matchIndex = index;
      matchedTerm = term;
    }
  }

  if (matchIndex < 0) {
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized;
  }

  const before = Math.max(0, matchIndex - Math.floor((maxLength - matchedTerm.length) / 2));
  const after = Math.min(normalized.length, before + maxLength);
  const snippet = normalized.slice(before, after).trim();
  const prefix = before > 0 ? '…' : '';
  const suffix = after < normalized.length ? '…' : '';
  return `${prefix}${snippet}${suffix}`;
};

const highlightText = (value: string, terms: string[]) => {
  if (!value) return '';
  if (!terms.length) return escapeHtml(value);

  const validTerms = terms
    .map((term) => term.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!validTerms.length) return escapeHtml(value);

  const regex = new RegExp(`(${validTerms.map(escapeRegExp).join('|')})`, 'gi');
  const parts = value.split(regex);

  return parts
    .map((part) => {
      if (!part) return '';
      const matched = validTerms.some((term) => part.toLowerCase() === term.toLowerCase());
      const escaped = escapeHtml(part);
      return matched ? `<mark class="bit-search-result__mark">${escaped}</mark>` : escaped;
    })
    .join('');
};

const getNodeText = (nodes: HTMLElement[]) => nodes.map((node) => node.textContent ?? '').join(' ');

const buildIndex = (): PicksItem[] => {
  if (!content) return [];

  const items: PicksItem[] = [];
  let currentYear = '';
  let currentHeading: HTMLElement | null = null;
  let currentNodes: HTMLElement[] = [];

  const commitItem = () => {
    if (!currentHeading) return;

    const title =
      currentHeading.dataset.pickTitle?.trim() ||
      (currentHeading.textContent ?? '').replace(/\s+/g, ' ').trim();
    const tags = currentNodes
      .flatMap((node) => Array.from(node.querySelectorAll<HTMLElement>('.pick-tag')))
      .map((tag) => (tag.textContent ?? '').trim())
      .filter(Boolean);
    const bodyNodes = currentNodes.filter((node) => !node.classList.contains('pick-tags'));
    const text = getNodeText(bodyNodes).trim();
    const key = currentHeading.id || title;
    const tagText = tags.map((tag) => tag.replace(/^#+/, ''));

    items.push({
      key,
      href: `#${encodeURIComponent(currentHeading.id || '')}`,
      title,
      text,
      tags,
      year: currentYear,
      haystack: buildSearchHaystack([title, text, tags, tagText, currentYear])
    });
  };

  Array.from(content.children).forEach((child) => {
    if (!(child instanceof HTMLElement)) return;

    if (child.tagName === 'H2') {
      commitItem();
      currentYear = (child.textContent ?? '').trim();
      currentHeading = null;
      currentNodes = [];
      return;
    }

    if (child.tagName === 'H3') {
      commitItem();
      currentHeading = child;
      currentNodes = [];
      return;
    }

    if (currentHeading) {
      currentNodes.push(child);
    }
  });

  commitItem();
  return items;
};

const indexItems = buildIndex();

const setVisibleStatus = (text: string) => {
  if (!statusEl) return;
  statusEl.textContent = text;
};

const setLiveStatus = (text: string) => {
  if (!liveEl) return;
  liveEl.textContent = text;
};

const setStatus = (text: string) => {
  setVisibleStatus(text);
  setLiveStatus(text);
};

const formatResultsSummary = (count: number) =>
  count > MAX_VISIBLE_RESULTS
    ? `找到 ${count} 条结果，当前显示前 ${MAX_VISIBLE_RESULTS} 条`
    : `找到 ${count} 条结果`;

const isResultsVisible = () => resultsRoot?.hasAttribute('hidden') === false;
const getFirstResultLink = () => resultsListEl?.querySelector<HTMLAnchorElement>('.bit-search-result__link') ?? null;

const getFilterUrl = (query: string) => {
  const nextUrl = new URL(window.location.href);
  nextUrl.hash = '';
  if (query) {
    nextUrl.searchParams.set(QUERY_PARAM_QUERY, query);
  } else {
    nextUrl.searchParams.delete(QUERY_PARAM_QUERY);
  }
  const search = nextUrl.searchParams.toString();
  return `${nextUrl.pathname}${search ? `?${search}` : ''}`;
};

const syncUrlState = (query = getTrimmedQuery()) => {
  const next = getFilterUrl(query);
  const current = `${window.location.pathname}${window.location.search}`;
  if (next !== current) {
    window.history.replaceState({}, '', next);
  }
};

const showBrowse = () => {
  browseRoot?.removeAttribute('hidden');
  resultsRoot?.setAttribute('hidden', 'true');
  if (resultsListEl) {
    resultsListEl.innerHTML = '';
  }
  if (resultsSummaryEl) {
    resultsSummaryEl.textContent = '搜索结果';
  }
};

const getDisplaySnippet = (item: PicksItem, terms: string[]) => {
  const candidates = [item.text, item.title].filter(Boolean);
  const matchedCandidate = candidates.find((value) => includesAnyTerm(value, terms));
  const source = matchedCandidate || candidates[0] || '';
  return getContextSnippet(source, terms, 120);
};

const renderResults = (matchedItems: PicksItem[]) => {
  if (!resultsRoot || !resultsListEl) return;

  const visibleItems = matchedItems.slice(0, MAX_VISIBLE_RESULTS);
  const queryTerms = tokenizeSearchQuery(getTrimmedQuery());

  if (resultsSummaryEl) {
    resultsSummaryEl.textContent = formatResultsSummary(matchedItems.length);
  }

  resultsListEl.innerHTML = visibleItems
    .map((item) => {
      const snippet = getDisplaySnippet(item, queryTerms);
      const tags = item.tags
        .map((tag) => `<span class="bit-search-result__tag">${highlightText(tag, queryTerms)}</span>`)
        .join('');
      const metaTrail = item.year
        ? `<div class="bit-search-result__meta-line"><span class="bit-search-result__page">${escapeHtml(item.year)}</span></div>`
        : '';

      return `
        <article class="bit-card bit-card--search-result">
          <a class="bit-search-result__link" href="${escapeHtml(item.href)}">
            <div class="bit-search-result__layout">
              <div class="bit-search-result__content">
                <h3 class="picks-search-result__title">${highlightText(item.title, queryTerms)}</h3>
                ${snippet ? `<p class="bit-search-result__excerpt">${highlightText(snippet, queryTerms)}</p>` : ''}
                ${tags || metaTrail
                  ? `
                    <div class="bit-search-result__footer">
                      ${tags ? `<div class="bit-search-result__tags">${tags}</div>` : '<div></div>'}
                      ${metaTrail}
                    </div>
                  `
                  : ''}
              </div>
            </div>
          </a>
        </article>
      `;
    })
    .join('');

  browseRoot?.setAttribute('hidden', 'true');
  resultsRoot.removeAttribute('hidden');
};

const filterIndexItems = (queryTerms: string[]) =>
  indexItems.filter((item) => queryTerms.every((term) => item.haystack.includes(term)));

const applyFilter = () => {
  if (!input) return;
  filterRunner.cancel();

  const rawQuery = getTrimmedQuery();
  const queryTerms = tokenizeSearchQuery(rawQuery);

  if (rawQuery === '') {
    showBrowse();
    setStatus('');
    syncUrlState('');
    return;
  }

  syncUrlState(rawQuery);
  const matchedItems = filterIndexItems(queryTerms);

  if (matchedItems.length === 0) {
    if (resultsRoot && resultsListEl) {
      if (resultsSummaryEl) {
        resultsSummaryEl.textContent = '无匹配结果';
      }
      resultsListEl.innerHTML = '<p class="bits-search-results__empty">未找到相关内容，换个关键词试试。</p>';
      browseRoot?.setAttribute('hidden', 'true');
      resultsRoot.removeAttribute('hidden');
    }
    setStatus('');
    return;
  }

  renderResults(matchedItems);
  setStatus('');
};

const scheduleApplyFilter = (delay = FILTER_DEBOUNCE_MS) => {
  filterRunner.schedule(delay);
};

const resetFilters = (options: { focusInput?: boolean } = {}) => {
  filterRunner.cancel();
  if (input) {
    input.value = '';
  }
  showBrowse();
  setStatus('');
  syncUrlState('');
  if (options.focusInput) {
    openSearch();
    input?.focus();
  } else {
    closeSearch();
  }
};

input?.addEventListener('focus', () => {
  openSearch();
});

input?.addEventListener('input', () => {
  scheduleApplyFilter();
});

input?.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    resetFilters();
    return;
  }
  if (event.key !== 'ArrowDown' || !isResultsVisible()) return;
  const firstResultLink = getFirstResultLink();
  if (!firstResultLink) return;
  event.preventDefault();
  firstResultLink.focus();
});

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  applyFilter();
});

searchToggleBtn?.addEventListener('click', () => {
  if (hoverPreviewActive) {
    openSearch({ focusInput: true });
    return;
  }
  if (!isSearchOpen()) {
    openSearch({ focusInput: true });
    return;
  }
  if (!hasSearchValue()) {
    setSearchOpen(false);
    return;
  }
  resetFilters();
});

const handleHoverPreviewEnter = () => {
  openSearchHoverPreview();
};

const handleHoverPreviewLeave = (event: PointerEvent) => {
  const nextTarget = event.relatedTarget as Node | null;
  if (nextTarget && searchRoot?.contains(nextTarget)) return;
  scheduleHoverPreviewClose();
};

searchRoot?.addEventListener('pointerenter', handleHoverPreviewEnter);
searchRoot?.addEventListener('pointerleave', handleHoverPreviewLeave);

document.addEventListener('click', (event) => {
  const target = event.target as Node | null;
  if (!target) return;
  if (!isSearchOpen()) return;
  if (searchRoot?.contains(target)) return;
  if (hasSearchValue()) return;
  closeSearch();
});

clearBtn?.addEventListener('click', () => {
  resetFilters({ focusInput: true });
});

resultsListEl?.addEventListener('click', (event) => {
  const target = event.target as HTMLElement | null;
  const link = target?.closest<HTMLAnchorElement>('a[href]');
  if (!link) return;

  const nextUrl = new URL(link.href, window.location.href);
  const currentUrl = new URL(window.location.href);
  if (nextUrl.pathname !== currentUrl.pathname) {
    return;
  }

  event.preventDefault();
  resetFilters();

  if (!nextUrl.hash) return;
  const targetId = decodeURIComponent(nextUrl.hash.slice(1));
  const targetEl = document.getElementById(targetId);
  if (!targetEl) {
    window.location.hash = nextUrl.hash;
    return;
  }

  const basePath = getFilterUrl('');
  window.history.replaceState({}, '', basePath);
  window.requestAnimationFrame(() => {
    window.location.hash = nextUrl.hash;
    targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

resultsListEl?.addEventListener('keydown', (event) => {
  if (event.key !== 'ArrowUp') return;
  const target = event.target as HTMLElement | null;
  const currentLink = target?.closest<HTMLAnchorElement>('.bit-search-result__link');
  const firstResultLink = getFirstResultLink();
  if (!currentLink || !firstResultLink || currentLink !== firstResultLink) return;
  event.preventDefault();
  input?.focus();
});

const initialQuery = (new URL(window.location.href).searchParams.get(QUERY_PARAM_QUERY) ?? '').trim();
if (input && initialQuery) {
  input.value = initialQuery;
}
syncUrlState(initialQuery);
setSearchOpen(Boolean(initialQuery));

if (initialQuery) {
  applyFilter();
}

if (!indexItems.length && input && btn) {
  input.disabled = true;
  btn.disabled = true;
  setStatus('');
}
