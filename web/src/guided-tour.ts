import { announce, button, el } from './dom.ts';
import { isTourStep, loadTourProgress, saveTourProgress, transitionTourProgress } from './tour-state.ts';
import type { TourProgress, TourStepIndex, TourStorage } from './tour-state.ts';

export type { TourProgress, TourStepIndex } from './tour-state.ts';

export const TOUR_STEPS = [
  { target: 'cancelled-date', page: 'route', title: 'Start with the cancelled date',
    body: 'Choose “Rescue this date” to repair the gap while keeping all four locked shows.' },
  { target: 'options', page: 'options', title: 'Compare the three ways forward',
    body: 'Compare the replacement, detour and day-off cards, then read their PASS, FAIL and UNKNOWN checks.' },
  { target: 'breakpoint-limit', page: 'breakpoint', title: 'Try to overturn the recommendation',
    body: 'Set the additional-travel limit to 354.1 km (354,100 metres), choose “Apply this value”, and watch the recommendation change.' },
  { target: 'evidence', page: 'evidence', title: 'Inspect the working',
    body: 'Inspect the fit map, leave-one-artist-out results and Tag Bridge, including any UNKNOWN evidence.' },
  { target: 'exports', page: 'audit', title: 'Take the decision with you',
    body: 'Download the audit JSON and open the selected option’s promoter sheet to print A4 or save a PNG.' },
  { target: 'ai', page: 'ai', title: 'Explore AI research, optionally',
    body: 'Explore “Rescue with AI (Pro)” through a saved demo or choose live research when you are ready.' },
] as const;

export interface GuidedTourOptions {
  readonly navigate: (step: TourStepIndex) => void;
  readonly getTarget: (step: TourStepIndex) => HTMLElement | null;
  /** Prepare the labelled synthetic demo; called only after an explicit start/resume. */
  readonly onStart: () => void;
  readonly onExit: (completed: boolean) => void;
  readonly getReturnFocus?: () => HTMLElement | null;
  readonly storage?: TourStorage;
}

export interface GuidedTourController {
  readonly start: (trigger?: HTMLElement) => void;
  readonly resume: (trigger?: HTMLElement) => void;
  readonly goTo: (step: TourStepIndex) => void;
  readonly refresh: () => void;
  readonly skip: () => void;
  readonly dispose: () => void;
  readonly isActive: () => boolean;
  readonly getProgress: () => TourProgress;
}

function browserStorage(): TourStorage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}

const focusable = 'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

/** Nonmodal coach marks: real controls remain clickable, keyboard-focusable and unmodified. */
export function createGuidedTour(options: GuidedTourOptions): GuidedTourController {
  const storage = options.storage ?? browserStorage();
  let progress = loadTourProgress(storage);
  let active = false;
  let disposed = false;
  let frame = 0;
  let shouldFocus = false;
  let shouldScroll = false;
  let returnFocus: HTMLElement | undefined;
  let target: HTMLElement | null = null;
  let oldDescription: string | null = null;
  let oldTabIndex: string | null = null;
  let temporaryTabIndex = false;
  let saved = true;

  const layer = el('div', 'guided-tour-layer');
  layer.hidden = true;
  const highlight = el('div', 'guided-tour-highlight');
  highlight.setAttribute('aria-hidden', 'true');
  const card = el('section', 'guided-tour-card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'false');
  card.setAttribute('aria-labelledby', 'guided-tour-title');
  card.setAttribute('aria-describedby', 'guided-tour-description');
  card.tabIndex = -1;
  const top = el('div', 'guided-tour-top');
  const label = el('p', 'guided-tour-label');
  const skip = button('Skip', () => exit(false), 'guided-tour-skip');
  skip.title = 'Skip guided tour (Esc)';
  top.append(label, skip);
  const track = el('div', 'guided-tour-track');
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-valuemin', '1');
  track.setAttribute('aria-valuemax', '6');
  track.setAttribute('aria-label', 'Guided tour progress');
  for (let index = 0; index < TOUR_STEPS.length; index += 1) {
    const segment = el('span');
    segment.setAttribute('aria-hidden', 'true');
    track.append(segment);
  }
  const title = el('h2');
  title.id = 'guided-tour-title';
  const description = el('p', 'guided-tour-description');
  description.id = 'guided-tour-description';
  const focus = button('Focus highlighted area', focusTarget, 'guided-tour-focus');
  const actions = el('div', 'guided-tour-actions');
  const back = button('Back', () => goTo(Math.max(0, progress.step - 1) as TourStepIndex), 'button button-secondary');
  const next = button('Next', () => progress.step === 5 ? exit(true) : goTo((progress.step + 1) as TourStepIndex), 'button button-primary');
  actions.append(back, next);
  const hint = el('p', 'guided-tour-hint');
  card.append(top, track, title, description, focus, actions, hint);
  layer.append(highlight, card);
  document.body.append(layer);

  function persist(): void { saved = saveTourProgress(progress, storage); }
  function clearTarget(): void {
    if (!target) return;
    target.classList.remove('guided-tour-target');
    if (oldDescription === null) target.removeAttribute('aria-describedby');
    else target.setAttribute('aria-describedby', oldDescription);
    if (temporaryTabIndex) {
      if (oldTabIndex === null) target.removeAttribute('tabindex');
      else target.setAttribute('tabindex', oldTabIndex);
    }
    observer?.unobserve(target);
    target = null;
    temporaryTabIndex = false;
  }

  function setTarget(nextTarget: HTMLElement | null): void {
    if (nextTarget === target) return;
    clearTarget();
    target = nextTarget;
    if (!target) return;
    oldDescription = target.getAttribute('aria-describedby');
    oldTabIndex = target.getAttribute('tabindex');
    target.setAttribute('aria-describedby', [oldDescription, description.id].filter(Boolean).join(' '));
    target.classList.add('guided-tour-target');
    observer?.observe(target);
  }

  function refresh(): void {
    if (!active || disposed || frame) return;
    frame = window.requestAnimationFrame(position);
  }

  function position(): void {
    frame = 0;
    if (!active || disposed) return;
    // The software keyboard can shrink the visual viewport without resizing the layout viewport.
    const view = window.visualViewport;
    const visible = {
      left: view?.offsetLeft ?? 0, top: view?.offsetTop ?? 0,
      width: view?.width ?? window.innerWidth, height: view?.height ?? window.innerHeight,
    };
    const right = visible.left + visible.width;
    const bottom = visible.top + visible.height;
    setTarget(options.getTarget(progress.step));
    focus.disabled = target === null;
    if (shouldScroll && target) {
      target.scrollIntoView({ behavior: 'auto', block: target.getBoundingClientRect().height > visible.height * .55 ? 'start' : 'center' });
      shouldScroll = false;
    }
    const margin = 16;
    const gap = 14;
    const width = Math.max(1, Math.min(356, visible.width - margin * 2));
    card.style.width = `${width}px`;
    card.style.maxHeight = `${Math.max(1, visible.height - margin * 2)}px`;
    const height = card.getBoundingClientRect().height;
    const minimumTop = visible.top + margin;
    const minimumLeft = visible.left + margin;
    const roomBottom = Math.max(minimumTop, bottom - height - margin);
    let left = Math.max(minimumLeft, right - width - margin);
    let topPosition = roomBottom;
    const rect = target?.getBoundingClientRect();
    highlight.hidden = !rect || rect.bottom <= visible.top || rect.top >= bottom || rect.right <= visible.left || rect.left >= right;
    if (rect) {
      const x = clamp(rect.left - 5, visible.left + 3, right - 3);
      const y = clamp(rect.top - 5, visible.top + 3, bottom - 3);
      highlight.style.left = `${x}px`;
      highlight.style.top = `${y}px`;
      highlight.style.width = `${Math.max(0, Math.min(right - 3, rect.right + 5) - x)}px`;
      highlight.style.height = `${Math.max(0, Math.min(bottom - 3, rect.bottom + 5) - y)}px`;
      if (rect.right + gap + width <= right - margin) {
        left = rect.right + gap;
        topPosition = clamp(rect.top, minimumTop, roomBottom);
      } else if (rect.left - gap - width >= minimumLeft) {
        left = rect.left - gap - width;
        topPosition = clamp(rect.top, minimumTop, roomBottom);
      } else {
        left = clamp(rect.left, minimumLeft, right - width - margin);
        if (rect.bottom + gap + height <= bottom - margin) topPosition = rect.bottom + gap;
        else if (rect.top - gap - height >= minimumTop) topPosition = rect.top - gap - height;
        else topPosition = rect.top > visible.top + visible.height / 2 ? minimumTop : roomBottom;
      }
    }
    card.style.left = `${clamp(left, minimumLeft, right - width - margin)}px`;
    card.style.top = `${clamp(topPosition, minimumTop, roomBottom)}px`;
    if (shouldFocus) { shouldFocus = false; card.focus({ preventScroll: true }); }
  }

  function paint(): void {
    const step = TOUR_STEPS[progress.step];
    label.textContent = `Guided demo · ${progress.step + 1} of ${TOUR_STEPS.length}`;
    title.textContent = step.title;
    description.textContent = step.body;
    track.setAttribute('aria-valuenow', String(progress.step + 1));
    track.setAttribute('aria-valuetext', `Step ${progress.step + 1} of 6: ${step.title}`);
    for (const [index, segment] of [...track.children].entries()) {
      segment.classList.toggle('is-reached', index <= progress.step);
    }
    back.disabled = progress.step === 0;
    next.textContent = progress.step === 5 ? 'Finish tour' : 'Next';
    hint.textContent = saved ? 'Esc to skip · Progress saved on this device.' : 'Esc to skip · Progress lasts for this tab.';
    layer.dataset.step = String(progress.step + 1);
  }

  function begin(resume: boolean, trigger?: HTMLElement): void {
    if (disposed) return;
    if (active) { card.focus({ preventScroll: true }); return; }
    const activeElement = document.activeElement;
    returnFocus = trigger ?? (activeElement instanceof HTMLElement
      && activeElement !== document.body && activeElement !== document.documentElement ? activeElement : undefined);
    progress = transitionTourProgress(progress, { type: resume ? 'resume' : 'start' });
    persist();
    active = true;
    layer.hidden = false;
    document.body.classList.add('guided-tour-is-active');
    options.onStart();
    paint();
    shouldFocus = true;
    shouldScroll = true;
    options.navigate(progress.step);
    refresh();
    announce(`Guided tour started. Step ${progress.step + 1} of 6. Press Escape to skip at any time.`);
  }

  function goTo(step: TourStepIndex): void {
    if (!isTourStep(step)) throw new RangeError('Unknown guided tour step.');
    if (!active || disposed) return;
    if (progress.step === step) { refresh(); return; }
    progress = transitionTourProgress(progress, { type: 'go-to', step });
    persist();
    paint();
    shouldFocus = true;
    shouldScroll = true;
    options.navigate(step);
    refresh();
  }

  function exit(completed: boolean): void {
    if (!active || disposed) return;
    progress = transitionTourProgress(progress, { type: completed ? 'complete' : 'skip' });
    persist();
    active = false;
    if (frame) { window.cancelAnimationFrame(frame); frame = 0; }
    layer.hidden = true;
    clearTarget();
    document.body.classList.remove('guided-tour-is-active');
    options.onExit(completed);
    const destination = returnFocus?.isConnected && !returnFocus.matches(':disabled') && returnFocus.getClientRects().length
      ? returnFocus : options.getReturnFocus?.();
    destination?.focus({ preventScroll: true });
    announce(completed ? 'Guided tour complete. You can restart it at any time.' : 'Guided tour skipped. You can resume it at any time.');
  }

  function focusTarget(): void {
    if (!target) return;
    const control = target.matches(focusable) ? target
      : [...target.querySelectorAll<HTMLElement>(focusable)].find(node => node.getClientRects().length > 0);
    const destination = control ?? target;
    if (!control) { target.tabIndex = -1; temporaryTabIndex = true; }
    destination.focus({ preventScroll: true });
    destination.scrollIntoView({ block: 'center', behavior: 'auto' });
    keepFocusVisible(destination);
  }

  function keepFocusVisible(destination: HTMLElement): void {
    if (!active || !target?.contains(destination)) return;
    const rect = destination.getBoundingClientRect();
    const floating = card.getBoundingClientRect();
    if (rect.right <= floating.left || rect.left >= floating.right || rect.bottom <= floating.top || rect.top >= floating.bottom) return;
    const view = window.visualViewport;
    const middle = (view?.offsetTop ?? 0) + (view?.height ?? window.innerHeight) / 2;
    const desired = floating.top < middle ? floating.bottom + 14 : floating.top - rect.height - 14;
    window.scrollBy({ top: rect.top - desired, behavior: 'auto' });
    refresh();
  }

  function keydown(event: KeyboardEvent): void {
    if (active && event.key === 'Escape') { event.preventDefault(); exit(false); }
  }
  function focusChanged(event: FocusEvent): void {
    if (event.target instanceof HTMLElement && !card.contains(event.target)) keepFocusVisible(event.target);
  }
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(refresh);
  observer?.observe(card);
  window.addEventListener('resize', refresh);
  window.addEventListener('scroll', refresh, true);
  document.addEventListener('keydown', keydown);
  document.addEventListener('focusin', focusChanged);
  const viewport = window.visualViewport;
  viewport?.addEventListener('resize', refresh);
  viewport?.addEventListener('scroll', refresh);

  return {
    start: trigger => begin(false, trigger), resume: trigger => begin(true, trigger), goTo, refresh,
    skip: () => exit(false), isActive: () => active, getProgress: () => ({ ...progress }),
    dispose() {
      if (disposed) return;
      if (active) exit(false);
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', refresh);
      window.removeEventListener('scroll', refresh, true);
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('focusin', focusChanged);
      viewport?.removeEventListener('resize', refresh);
      viewport?.removeEventListener('scroll', refresh);
      layer.remove();
    },
  };
}
