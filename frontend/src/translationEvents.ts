/**
 * Tiny event bus: fires when an on-demand translation arrives, so the
 * I18nProvider can re-render every screen that uses useT() / tSync().
 */
type Listener = () => void;
const listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | null = null;

export function onTranslationArrived(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Debounced so a burst of translations causes one re-render. */
export function emitTranslationArrived() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    listeners.forEach((fn) => fn());
  }, 250);
}
