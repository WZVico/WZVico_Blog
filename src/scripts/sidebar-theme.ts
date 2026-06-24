const THEME_KEY = 'theme';
const THEME_MODE_KEY = 'theme-mode';

type Theme = 'light' | 'dark';
type ThemeMode = Theme | 'system';
type LegacyMediaQueryList = {
  addListener?: (listener: () => void) => void;
};

const root = document.documentElement;
const body = document.body;

const themeBtn = document.getElementById('theme-toggle');
const readerBtn = document.getElementById('reader-toggle');
const readerExit = document.getElementById('reader-exit');
const readerExitAnchor = readerExit?.closest('.reader-exit-anchor') as HTMLElement | null;
const colorSchemeMq = window.matchMedia('(prefers-color-scheme: dark)');
const mobileMq = window.matchMedia('(max-width: 900px)');

const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const isLongPage = () =>
  /^(?:\/(?:archive|longform|picks)(?:\/|$))/.test(window.location.pathname);

const isArticlePage = () => body?.classList.contains('article-page') ?? false;

let updateFloating = () => {};

const isTheme = (value: string | null): value is Theme =>
  value === 'light' || value === 'dark';

const isThemeMode = (value: string | null): value is ThemeMode =>
  value === 'system' || isTheme(value);

const getSystemTheme = (): Theme => colorSchemeMq.matches ? 'dark' : 'light';

const resolveTheme = (mode: ThemeMode): Theme =>
  mode === 'system' ? getSystemTheme() : mode;

const readThemeMode = (): ThemeMode => {
  try {
    const storedMode = localStorage.getItem(THEME_MODE_KEY);
    if (isThemeMode(storedMode)) return storedMode;

    const legacyTheme = localStorage.getItem(THEME_KEY);
    if (isTheme(legacyTheme)) return legacyTheme;
  } catch (_) {}

  return 'system';
};

const writeThemeMode = (mode: ThemeMode) => {
  try {
    localStorage.setItem(THEME_MODE_KEY, mode);
    if (mode === 'system') {
      localStorage.removeItem(THEME_KEY);
    } else {
      localStorage.setItem(THEME_KEY, mode);
    }
  } catch (_) {}
};

const getNextThemeMode = (mode: ThemeMode): ThemeMode => {
  if (mode === 'system') return 'light';
  if (mode === 'light') return 'dark';
  return 'system';
};

const getThemeModeLabel = (mode: ThemeMode, theme: Theme): string => {
  if (mode === 'system') {
    return `跟随系统（${theme === 'dark' ? '深色模式' : '浅色模式'}）`;
  }

  return theme === 'dark' ? '深色模式' : '浅色模式';
};

let activeThemeMode: ThemeMode = readThemeMode();

const applyTheme = (theme: Theme, mode: ThemeMode = activeThemeMode) => {
  root.dataset.theme = theme;
  root.dataset.themeMode = mode;
  const dark = theme === 'dark';
  if (themeBtn) {
    themeBtn.setAttribute('aria-pressed', mode === 'system' ? 'mixed' : (dark ? 'true' : 'false'));
    const label = getThemeModeLabel(mode, theme);
    themeBtn.setAttribute('aria-label', label);
    themeBtn.setAttribute('title', label);
  }
};

const setThemeMode = (mode: ThemeMode, persist = true) => {
  activeThemeMode = mode;
  applyTheme(resolveTheme(mode), mode);
  if (persist) writeThemeMode(mode);
};

const listenSystemThemeChange = (listener: () => void) => {
  if (typeof colorSchemeMq.addEventListener === 'function') {
    colorSchemeMq.addEventListener('change', listener);
    return;
  }

  // Support older Safari/WebView MediaQueryList listeners.
  const legacyColorSchemeMq = colorSchemeMq as unknown as LegacyMediaQueryList;
  legacyColorSchemeMq.addListener?.(listener);
};

const initTheme = () => {
  setThemeMode(activeThemeMode, false);
  themeBtn?.addEventListener('click', () => {
    setThemeMode(getNextThemeMode(activeThemeMode));
  });

  const syncSystemTheme = () => {
    if (activeThemeMode === 'system') setThemeMode('system', false);
  };

  listenSystemThemeChange(syncSystemTheme);
};

const isReaderOn = () => body?.dataset.reading === 'immersive';
const isImmersivePage = body?.classList.contains('immersive-page');

const setReaderDisabled = (disabled: boolean) => {
  if (!readerBtn) return;
  readerBtn.setAttribute('aria-pressed', 'false');
  readerBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
  if (disabled) {
    readerBtn.setAttribute('title', '阅读模式（仅文章/阅读页可用）');
    readerBtn.setAttribute('aria-label', '阅读模式（仅文章/阅读页可用）');
    readerBtn.tabIndex = -1;
  } else {
    readerBtn.setAttribute('title', '阅读模式');
    readerBtn.setAttribute('aria-label', '阅读模式');
    readerBtn.tabIndex = 0;
  }
};

const applyReader = (on: boolean) => {
  if (!body) return;
  if (on) {
    body.dataset.reading = 'immersive';
  } else {
    delete body.dataset.reading;
  }
  if (readerBtn) {
    readerBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  if (readerExit) {
    readerExit.setAttribute('aria-label', '退出阅读');
    readerExit.setAttribute('title', '退出阅读');
  }
  setVisible(readerExit as HTMLElement | null, on);
  updateFloating();
};

const createScrollTopButton = () => {
  const template = document.getElementById('scroll-top-template');
  if (!(template instanceof HTMLTemplateElement)) return null;

  const button = template.content.firstElementChild?.cloneNode(true);
  if (!(button instanceof HTMLButtonElement)) return null;

  button.addEventListener('click', () => {
    const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
    window.scrollTo({ top: 0, behavior });
  });
  return button;
};

const setVisible = (el: HTMLElement | null, visible: boolean) => {
  if (!el) return;
  if (visible) {
    el.dataset.visible = 'true';
    el.removeAttribute('aria-hidden');
    el.tabIndex = 0;
  } else {
    delete el.dataset.visible;
    el.setAttribute('aria-hidden', 'true');
    el.tabIndex = -1;
  }
};

const setReaderExitInline = (inlineVisible: boolean) => {
  if (!readerExitAnchor) return;
  if (readerExitAnchor.hasAttribute('data-reader-exit-inline') === inlineVisible) return;
  readerExitAnchor.toggleAttribute('data-reader-exit-inline', inlineVisible);
};

const initFloatingActions = () => {
  if (!isLongPage()) return;

  let scrollTopBtn: HTMLButtonElement | null = null;
  let ticking = false;

  const ensureScrollTop = () => {
    if (scrollTopBtn || !body) return;
    const nextButton = createScrollTopButton();
    if (!nextButton) return;
    scrollTopBtn = nextButton;
    body.appendChild(scrollTopBtn);
  };

  const update = () => {
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    const scrolledPast = y > 0;
    const isReading = isReaderOn();
    const floatExit = isReading && mobileMq.matches && scrolledPast;
    const shouldEnableScrollTop = mobileMq.matches || isArticlePage();

    if (shouldEnableScrollTop) {
      ensureScrollTop();
      if (scrollTopBtn) {
        scrollTopBtn.dataset.stack = floatExit ? 'true' : 'false';
      }
      setVisible(scrollTopBtn, scrolledPast);
    } else {
      setVisible(scrollTopBtn, false);
    }

    if (readerExit) {
      if (floatExit) {
        readerExit.classList.add('float-action');
      } else {
        readerExit.classList.remove('float-action');
      }
    }
    setReaderExitInline(isReading && !floatExit);
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      update();
      ticking = false;
    });
  };

  updateFloating = update;
  mobileMq.addEventListener('change', update);
  window.addEventListener('scroll', onScroll, { passive: true });
  update();
};

const initReader = () => {
  if (!readerBtn) return;
  if (!isImmersivePage) {
    setReaderDisabled(true);
    return;
  }

  setReaderDisabled(false);
  applyReader(false);

  readerBtn.addEventListener('click', () => {
    applyReader(!isReaderOn());
  });

  readerExit?.addEventListener('click', () => {
    applyReader(false);
  });
};

initTheme();
initFloatingActions();
initReader();
