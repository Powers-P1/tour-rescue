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
  readonly descriptions?: readonly {readonly title:string;readonly body:string}[];
  readonly navigate: (step: TourStepIndex) => void;
  readonly getTarget: (step: TourStepIndex) => HTMLElement | null;
  /** Neighboring controls for the same task that must also stay clear of the coach. */
  readonly getRelatedControls?: (step: TourStepIndex) => readonly HTMLElement[];
  readonly objective?: (step:TourStepIndex)=>{complete:boolean;task:string};
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

export interface GuideRectangle { readonly left:number;readonly top:number;readonly width:number;readonly height:number }
/** Reserve nearby visible task controls together when they fit in the free band. */
export function guideControlBounds(primary:GuideRectangle|null,related:readonly GuideRectangle[],view:GuideRectangle):GuideRectangle|null {
  const visible=[...(primary?[primary]:[]),...related].filter(rect=>rect.width>0&&rect.height>0&&
    rect.top+rect.height>view.top&&rect.top<view.top+view.height);
  let bounds=visible[0]??primary;
  for(const rect of visible.slice(1)){
    if(!bounds){bounds=rect;continue;}
    const left=Math.min(bounds.left,rect.left),top=Math.min(bounds.top,rect.top);
    const combined={left,top,width:Math.max(bounds.left+bounds.width,rect.left+rect.width)-left,
      height:Math.max(bounds.top+bounds.height,rect.top+rect.height)-top};
    if(combined.height<=view.height-32-14-76)bounds=combined;
  }
  return bounds;
}
/** Place the coach and, when needed, move the control into the remaining free band. */
export function placeGuideCard(view:GuideRectangle,card:{readonly width:number;readonly height:number},
  control:GuideRectangle|null,compactDock:boolean,scrollRange:{readonly minimum:number;readonly maximum:number}) {
  const margin=16,gap=14,right=view.left+view.width,bottom=view.top+view.height;
  const minLeft=view.left+margin,minTop=view.top+margin;
  const maxLeft=Math.max(minLeft,right-card.width-margin),maxTop=Math.max(minTop,bottom-card.height-margin);
  let left=maxLeft,top=maxTop,scrollDelta=0;
  if(!control)return {left,top,scrollDelta};
  const controlRight=control.left+control.width,controlBottom=control.top+control.height;
  if(compactDock){
    // A stable dock lets adjacent actions scroll clear instead of following the goal.
    if(controlBottom>top-gap&&control.top<bottom)
      scrollDelta=clamp(controlBottom+gap-top,scrollRange.minimum,scrollRange.maximum);
  }else if(controlRight+gap+card.width<=right-margin){
    left=controlRight+gap;top=clamp(control.top,minTop,maxTop);
  }else if(control.left-gap-card.width>=minLeft){
    left=control.left-gap-card.width;top=clamp(control.top,minTop,maxTop);
  }else{
    left=clamp(control.left,minLeft,maxLeft);
    if(controlBottom+gap+card.height<=bottom-margin)top=controlBottom+gap;
    else if(control.top-gap-card.height>=minTop)top=control.top-gap-card.height;
    else{
      const choices=[{top:maxTop,controlTop:maxTop-gap-control.height},
        {top:minTop,controlTop:minTop+card.height+gap}]
        .map(choice=>({...choice,scrollDelta:control.top-choice.controlTop}))
        .filter(choice=>choice.controlTop>=minTop&&choice.controlTop+control.height<=bottom-margin&&
          choice.scrollDelta>=scrollRange.minimum&&choice.scrollDelta<=scrollRange.maximum)
        .sort((a,b)=>Math.abs(a.scrollDelta)-Math.abs(b.scrollDelta));
      const choice=choices[0];
      if(choice){top=choice.top;scrollDelta=choice.scrollDelta;}
      else top=control.top>view.top+view.height/2?minTop:maxTop;
    }
  }
  return {left:clamp(left,minLeft,maxLeft),top:clamp(top,minTop,maxTop),scrollDelta};
}

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
  let compact = false;
  let revealControl = false;

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
  const minimize = button('−', () => {
    compact = !compact;
    card.classList.toggle('is-compact', compact);
    minimize.textContent = compact ? '+' : '−';
    minimize.setAttribute('aria-label', compact ? 'Expand guided tour' : 'Minimize guided tour');
    revealControl = true;
    refresh();
  }, 'guided-tour-minimize');
  minimize.setAttribute('aria-label', 'Minimize guided tour');
  top.append(label, minimize, skip);
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
  const next = button('Next', () => {if(options.objective&&!options.objective(progress.step).complete)return;progress.step === 5 ? exit(true) : goTo((progress.step + 1) as TourStepIndex);}, 'button button-primary');
  actions.append(back, next);
  const hint = el('p', 'guided-tour-hint');
  const objective=el('p','guided-tour-objective');objective.setAttribute('role','status');objective.setAttribute('aria-live','polite');
  card.append(top, track, title, description,objective, focus, actions, hint);
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
    updateObjective();
    // The software keyboard can shrink the visual viewport without resizing the layout viewport.
    const view = window.visualViewport;
    const visible = {
      left: view?.offsetLeft ?? 0, top: view?.offsetTop ?? 0,
      width: view?.width ?? window.innerWidth, height: view?.height ?? window.innerHeight,
    };
    const right = visible.left + visible.width;
    let bottom = visible.top + visible.height;
    const mobile = visible.width <= 600;
    if(mobile)for(const nav of document.querySelectorAll<HTMLElement>('.mobile-tabs')){
      const rect=nav.getBoundingClientRect();
      if(getComputedStyle(nav).position==='fixed'&&rect.width>0&&rect.height>0&&
        rect.top<bottom&&rect.bottom>visible.top&&rect.left<right&&rect.right>visible.left)
        bottom=Math.min(bottom,rect.top);
    }
    const previousTarget=target;
    setTarget(options.getTarget(progress.step));
    if(target!==previousTarget&&target?.matches(focusable)&&!options.objective?.(progress.step).complete)shouldScroll=true;
    focus.disabled = target === null;
    const reveal=shouldScroll||revealControl;
    revealControl=false;
    if (shouldScroll && target) {
      target.scrollIntoView({ behavior: 'auto', block: target.getBoundingClientRect().height > visible.height * .55 ? 'start' : 'center' });
      shouldScroll = false;
    }
    const margin = 16;
    const width = Math.max(1, Math.min(356, visible.width - margin * 2));
    card.style.width = `${width}px`;
    const rect = target?.getBoundingClientRect();
    const usableHeight=bottom-visible.top;
    const related=options.getRelatedControls?.(progress.step)??[];
    let protectedRect=guideControlBounds(rect??null,related.filter(control=>control.getClientRects().length)
      .map(control=>control.getBoundingClientRect()),{...visible,height:usableHeight});
    const focused=document.activeElement;
    if(focused instanceof HTMLElement&&!layer.contains(focused)&&focused.matches(focusable)&&focused.getClientRects().length){
      const focusedRect=focused.getBoundingClientRect();
      if(protectedRect&&protectedRect.top+protectedRect.height>visible.top&&protectedRect.top<bottom){
        const combined={left:Math.min(protectedRect.left,focusedRect.left),top:Math.min(protectedRect.top,focusedRect.top),
          width:Math.max(protectedRect.left+protectedRect.width,focusedRect.right)-Math.min(protectedRect.left,focusedRect.left),
          height:Math.max(protectedRect.top+protectedRect.height,focusedRect.bottom)-Math.min(protectedRect.top,focusedRect.top)};
        protectedRect=combined.height<=bottom-visible.top-32-14-76?combined:focusedRect;
      }else protectedRect=focusedRect;
    }
    // On a short phone, allow the coach to scroll internally before covering a control.
    const controlHeight=protectedRect&&protectedRect.height<=usableHeight-32-14-76?protectedRect.height:48;
    card.style.maxHeight = `${Math.max(76,usableHeight-margin*2-(mobile&&!compact?controlHeight+14:0))}px`;
    const height = card.getBoundingClientRect().height;
    const scrolling=document.scrollingElement??document.documentElement;
    const readingEvidence=mobile&&progress.step===3&&!!options.objective?.(progress.step).complete;
    const placement=placeGuideCard({...visible,height:usableHeight},{width,height},protectedRect,mobile&&(compact||readingEvidence),
      {minimum:-window.scrollY,maximum:Math.max(0,scrolling.scrollHeight-scrolling.clientHeight)-window.scrollY});
    card.style.left = `${placement.left}px`;
    card.style.top = `${placement.top}px`;
    // Once evidence is open, let the reader scroll its contents. Reposition only
    // after an explicit focus/reveal request, rather than snapping to its summary.
    if(placement.scrollDelta&&(!(mobile&&compact)||reveal)&&(!readingEvidence||reveal)){
      const before=window.scrollY;
      window.scrollBy({top:placement.scrollDelta,behavior:'auto'});
      if(Math.abs(window.scrollY-before)>.5){revealControl=true;refresh();return;}
    }
    highlight.hidden = !rect || rect.bottom <= visible.top || rect.top >= bottom || rect.right <= visible.left || rect.left >= right;
    if (rect) {
      const x = clamp(rect.left - 5, visible.left + 3, right - 3);
      const y = clamp(rect.top - 5, visible.top + 3, bottom - 3);
      highlight.style.left = `${x}px`;
      highlight.style.top = `${y}px`;
      highlight.style.width = `${Math.max(0, Math.min(right - 3, rect.right + 5) - x)}px`;
      highlight.style.height = `${Math.max(0, Math.min(bottom - 3, rect.bottom + 5) - y)}px`;
    }
    if (shouldFocus) { shouldFocus = false; card.focus({ preventScroll: true }); }
  }

  function paint(): void {
    const step = options.descriptions?.[progress.step] ?? TOUR_STEPS[progress.step];
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
    updateObjective();
  }
  function updateObjective():void{
    const value=options.objective?.(progress.step);objective.hidden=!value;next.disabled=!!value&&!value.complete;
    const text=value?(value.complete?'✓ Done. ':'To continue: ')+value.task:'';if(objective.textContent!==text)objective.textContent=text;
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
    compact = false;
    card.classList.remove('is-compact');
    minimize.textContent = '−';
    minimize.setAttribute('aria-label', 'Minimize guided tour');
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
    next.disabled = !!options.objective;
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
    if (!active || layer.contains(destination) || !destination.matches(focusable)) return;
    revealControl=true;
    refresh();
  }

  function viewportChanged():void {revealControl=true;refresh();}

  function keydown(event: KeyboardEvent): void {
    if (active && event.key === 'Escape') { event.preventDefault(); exit(false); }
  }
  function focusChanged(event: FocusEvent): void {
    if (event.target instanceof HTMLElement && !card.contains(event.target)) keepFocusVisible(event.target);
  }
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(refresh);
  observer?.observe(card);
  window.addEventListener('resize', viewportChanged);
  window.addEventListener('scroll', refresh, true);
  document.addEventListener('keydown', keydown);
  document.addEventListener('focusin', focusChanged);
  const viewport = window.visualViewport;
  viewport?.addEventListener('resize', viewportChanged);
  viewport?.addEventListener('scroll', viewportChanged);

  return {
    start: trigger => begin(false, trigger), resume: trigger => begin(true, trigger), goTo, refresh,
    skip: () => exit(false), isActive: () => active, getProgress: () => ({ ...progress }),
    dispose() {
      if (disposed) return;
      if (active) exit(false);
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', viewportChanged);
      window.removeEventListener('scroll', refresh, true);
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('focusin', focusChanged);
      viewport?.removeEventListener('resize', viewportChanged);
      viewport?.removeEventListener('scroll', viewportChanged);
      layer.remove();
    },
  };
}
