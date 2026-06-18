import {
  ADMIN_SIDEBAR_NAV_ADMIN,
  ADMIN_SIDEBAR_NAV_MODE_STORAGE_KEY,
  ADMIN_SIDEBAR_NAV_PUBLIC,
  isAdminSidebarNavMode,
  type AdminSidebarNavMode
} from '../lib/admin-console/ui-prefs-keys';

type SidebarNavElements = {
  container: HTMLElement;
  stage: HTMLElement;
  panels: Record<AdminSidebarNavMode, HTMLElement>;
};

type Cleanup = () => void;

const NAV_SWITCH_LABEL = '后台导航';

const getNavSwitchTitle = (mode: AdminSidebarNavMode): string =>
  mode === ADMIN_SIDEBAR_NAV_ADMIN ? '切换到前台导航' : '切换到后台导航';

const readStoredMode = (): AdminSidebarNavMode | null => {
  try {
    const stored = sessionStorage.getItem(ADMIN_SIDEBAR_NAV_MODE_STORAGE_KEY);
    return isAdminSidebarNavMode(stored) ? stored : null;
  } catch (_) {
    return null;
  }
};

const writeStoredMode = (mode: AdminSidebarNavMode) => {
  try {
    sessionStorage.setItem(ADMIN_SIDEBAR_NAV_MODE_STORAGE_KEY, mode);
  } catch (_) {}
};

const getSidebarNavElements = (): SidebarNavElements[] =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-admin-sidebar-nav]'))
    .map((container) => {
      const stage = container.querySelector<HTMLElement>('[data-admin-nav-stage]');
      const publicPanel = container.querySelector<HTMLElement>(
        `[data-admin-nav-panel="${ADMIN_SIDEBAR_NAV_PUBLIC}"]`
      );
      const adminPanel = container.querySelector<HTMLElement>(
        `[data-admin-nav-panel="${ADMIN_SIDEBAR_NAV_ADMIN}"]`
      );

      if (!stage || !publicPanel || !adminPanel) return null;

      return {
        container,
        stage,
        panels: {
          [ADMIN_SIDEBAR_NAV_PUBLIC]: publicPanel,
          [ADMIN_SIDEBAR_NAV_ADMIN]: adminPanel
        }
      };
    })
    .filter((entry): entry is SidebarNavElements => entry !== null);

const setNavItemDelays = (elements: readonly SidebarNavElements[]) => {
  elements.forEach(({ panels }) => {
    Object.values(panels).forEach((panel) => {
      Array.from(panel.children).forEach((item, index) => {
        if (item instanceof HTMLElement) {
          item.style.setProperty('--sidebar-nav-item-delay', `${45 + index * 18}ms`);
        }
      });
    });
  });
};

const updatePanelAccessibility = (
  elements: readonly SidebarNavElements[],
  mode: AdminSidebarNavMode
) => {
  elements.forEach(({ panels }) => {
    Object.entries(panels).forEach(([panelMode, panel]) => {
      const isActive = panelMode === mode;
      panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      panel.toggleAttribute('inert', !isActive);
    });
  });
};

const syncStageHeight = (elements: readonly SidebarNavElements[], mode: AdminSidebarNavMode) => {
  elements.forEach((entry) => {
    entry.stage.style.setProperty('--sidebar-nav-stage-height', `${entry.panels[mode].offsetHeight}px`);
  });
};

const markPanelsReady = (elements: readonly SidebarNavElements[]) => {
  elements.forEach(({ container }) => {
    container.dataset.adminNavReady = 'true';
  });
};

const clearStageState = (elements: readonly SidebarNavElements[]) => {
  elements.forEach(({ container, stage, panels }) => {
    delete container.dataset.adminNavReady;
    stage.style.removeProperty('--sidebar-nav-stage-height');
    Object.values(panels).forEach((panel) => panel.removeAttribute('inert'));
  });
};

const syncSwitchers = (
  switchers: readonly HTMLButtonElement[],
  mode: AdminSidebarNavMode
) => {
  const isAdminMode = mode === ADMIN_SIDEBAR_NAV_ADMIN;
  const title = getNavSwitchTitle(mode);
  switchers.forEach((button) => {
    button.setAttribute('aria-checked', isAdminMode ? 'true' : 'false');
    button.setAttribute('aria-label', NAV_SWITCH_LABEL);
    button.setAttribute('title', title);
  });
};

export function initAdminSidebarNavMode() {
  const navElements = getSidebarNavElements();
  const switchers = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-admin-nav-switcher]')
  );
  if (switchers.length === 0 || navElements.length === 0) return;

  const root = document.documentElement;
  const initialMode = isAdminSidebarNavMode(root.dataset.adminNavMode)
    ? root.dataset.adminNavMode
    : (readStoredMode() ?? ADMIN_SIDEBAR_NAV_PUBLIC);
  let current: AdminSidebarNavMode = initialMode;
  let pendingFrame: number | null = null;
  let resizeObserver: ResizeObserver | null = null;
  const cleanupSwitchers: Cleanup[] = [];

  setNavItemDelays(navElements);

  const applyMode = (mode: AdminSidebarNavMode, persist: boolean, animate = true) => {
    const previous = current;
    current = mode;

    if (animate) {
      syncStageHeight(navElements, previous);
    }
    root.dataset.adminNavMode = mode;
    updatePanelAccessibility(navElements, mode);
    syncSwitchers(switchers, mode);

    if (pendingFrame !== null) {
      cancelAnimationFrame(pendingFrame);
      pendingFrame = null;
    }

    if (animate) {
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = null;
        syncStageHeight(navElements, mode);
      });
    } else {
      syncStageHeight(navElements, mode);
    }

    if (persist) writeStoredMode(mode);
  };

  applyMode(current, false, false);
  markPanelsReady(navElements);

  const syncCurrentStageHeight = () => syncStageHeight(navElements, current);
  window.addEventListener('resize', syncCurrentStageHeight);
  window.addEventListener('load', syncCurrentStageHeight, { once: true });

  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(syncCurrentStageHeight);
    navElements.forEach(({ panels }) => {
      Object.values(panels).forEach((panel) => resizeObserver?.observe(panel));
    });
  }

  switchers.forEach((button) => {
    const handleClick = () => {
      applyMode(
        current === ADMIN_SIDEBAR_NAV_ADMIN ? ADMIN_SIDEBAR_NAV_PUBLIC : ADMIN_SIDEBAR_NAV_ADMIN,
        true
      );
    };
    button.addEventListener('click', handleClick);
    cleanupSwitchers.push(() => button.removeEventListener('click', handleClick));
  });

  return () => {
    window.removeEventListener('resize', syncCurrentStageHeight);
    window.removeEventListener('load', syncCurrentStageHeight);
    if (pendingFrame !== null) {
      cancelAnimationFrame(pendingFrame);
      pendingFrame = null;
    }
    resizeObserver?.disconnect();
    cleanupSwitchers.forEach((cleanup) => cleanup());
    clearStageState(navElements);
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAdminSidebarNavMode, { once: true });
} else {
  initAdminSidebarNavMode();
}
