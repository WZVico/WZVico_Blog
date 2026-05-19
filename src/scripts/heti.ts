import Heti from 'heti/js/heti-addon';

const SPACED_ATTRIBUTE = 'data-heti-spaced';
const DEFAULT_SELECTOR = '.heti';

type HetiInstance = {
  spacingElements: (elmList: NodeListOf<Element>) => void;
};

export const initHeti = (rootSelector = DEFAULT_SELECTOR) => {
  if (typeof document === 'undefined') return;

  const run = () => {
    const roots = document.querySelectorAll(`${rootSelector}:not([${SPACED_ATTRIBUTE}])`);
    if (!roots.length) return;

    const heti = new Heti(rootSelector) as HetiInstance;
    heti.spacingElements(roots);

    roots.forEach((root) => {
      root.setAttribute(SPACED_ATTRIBUTE, 'true');
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
    return;
  }

  run();
};
