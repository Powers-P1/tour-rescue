import './styles.css';
import './visuals.css';
import './promoter.css';
import './evidence.css';
import './breakpoint.css';
import './live-dialog.css';
import './ai.css';
import './guided-tour.css';
import { createDemoResult, recomputeResult } from './data.ts';
import type { ApiDecisionResult, DecisionChanges } from './data.ts';
import { cancelledShow, decisionStatus, fitDisplay, formatDate, formatDistance, formatDuration,
  formatMoney, knowledgeText, maxDailyDriving, optionById, optionCity, optionLetter, optionTitle,
  recommendedSummary, sameDecisionPolicy, selectedRecommendation } from './presentation.ts';
import { announce, badge, button, downloadJson, el, icon } from './dom.ts';
import { renderRouteMap, renderFitScatter } from './visuals.ts';
import { renderEvidence, renderAudit } from './evidence.ts';
import { getBreakpointAxis, renderBreakpointView, setBreakpointAxis } from './breakpoint-view.ts';
import { renderPromoterSheet, downloadPromoterPng } from './promoter.ts';
import { openLiveDialog } from './live-dialog.ts';
import { createAiRescueView } from './ai-view.ts';
import { createGuidedTour, TOUR_STEPS } from './guided-tour.ts';
import type { TourStepIndex } from './guided-tour.ts';
import { guidedTourRequest } from './site-routing.ts';
import { acceptAiProposal, createAiAuditEnvelope, safeAiSourceUrl } from '../../src/ai/tools.ts';
import type { AiAcceptance, AiSessionResult, AiValidatedProposal } from '../../src/ai/types.ts';
import type { ConstraintCheck } from '../../src/core/travel-constraints.ts';
import type { EvaluatedRepairOption } from '../../src/core/repair-types.ts';

declare const __WORKER_ORIGIN__: string;

const pages = ['route', 'options', 'breakpoint', 'evidence', 'audit'] as const;
const labels = ['Route', 'Options', 'Breakpoint', 'Evidence', 'Audit'];
type Page = typeof pages[number] | 'promoter' | 'ai';
const app = document.getElementById('app')!;
const promoter = document.getElementById('promoter-view')!;
let baseline: ApiDecisionResult;
let current: ApiDecisionResult;
let selectedId = '';
let busy = false;
let decisionRevision = 0;
let liveBaseRunId: string | undefined;
let aiView: ReturnType<typeof createAiRescueView> | undefined;
let aiSession: AiSessionResult | undefined;
let aiAcceptances: AiAcceptance[] = [];
const acceptedSessions = new Map<string, AiSessionResult>();
let guidedTour: ReturnType<typeof createGuidedTour> | undefined;
let preserveGuideWorkspace = true;
interface GuideWorkspace {
  readonly baseline: ApiDecisionResult;
  readonly current: ApiDecisionResult;
  readonly selectedId: string;
  readonly page: Page;
  readonly breakpointAxis: ReturnType<typeof getBreakpointAxis>;
  readonly liveBaseRunId: string | undefined;
  readonly aiView: ReturnType<typeof createAiRescueView> | undefined;
  readonly aiSession: AiSessionResult | undefined;
  readonly aiAcceptances: AiAcceptance[];
  readonly acceptedSessions: readonly (readonly [string, AiSessionResult])[];
}
let guideWorkspace: GuideWorkspace | undefined;

/** The walkthrough gets a temporary demo; an existing live/AI comparison stays in memory. */
function beginGuidedWorkspace(): void {
  guideWorkspace = preserveGuideWorkspace ? {
    baseline, current, selectedId, page: page(), breakpointAxis: getBreakpointAxis(),
    liveBaseRunId, aiView, aiSession, aiAcceptances, acceptedSessions: [...acceptedSessions],
  } : undefined;
  decisionRevision += 1;
  busy = false;
  app.removeAttribute('aria-busy');
  baseline = createDemoResult();
  current = baseline;
  selectedId = selectedRecommendation(current)?.id ?? current.audit.analysis.repairs.options[0]?.id ?? '';
  liveBaseRunId = undefined;
  aiView = undefined;
  aiSession = undefined;
  aiAcceptances = [];
  acceptedSessions.clear();
  setBreakpointAxis('maxAdditionalDistanceMetres');
}

function finishGuidedWorkspace(completed: boolean): void {
  const previous = guideWorkspace;
  guideWorkspace = undefined;
  preserveGuideWorkspace = true;
  decisionRevision += 1;
  busy = false;
  app.removeAttribute('aria-busy');
  if (previous) {
    aiView?.dispose();
    baseline = previous.baseline;
    current = previous.current;
    selectedId = previous.selectedId;
    liveBaseRunId = previous.liveBaseRunId;
    aiView = previous.aiView;
    aiSession = previous.aiSession;
    aiAcceptances = previous.aiAcceptances;
    acceptedSessions.clear();
    previous.acceptedSessions.forEach(([id, session]) => acceptedSessions.set(id, session));
    setBreakpointAxis(previous.breakpointAxis);
    const url = new URL(location.href);
    url.hash = previous.page;
    history.replaceState(history.state, '', url);
  }
  render(true);
  announce(`${completed ? 'Guided tour completed.' : 'Guided tour paused.'}${previous ? ' Your previous comparison has been restored.' : ''}`);
}

function guideStepForPage(destination: Page): TourStepIndex {
  return destination === 'promoter' ? 4
    : Math.max(0, TOUR_STEPS.findIndex(step => step.page === destination)) as TourStepIndex;
}

function navigateGuide(step: TourStepIndex): void {
  if (step === 2) setBreakpointAxis('maxAdditionalDistanceMetres');
  const url = new URL(location.href);
  // The promoter sheet and the audit share the export step. Do not send a
  // user who explicitly opened the sheet back to the audit during step sync.
  url.hash = step === 4 && page() === 'promoter' ? 'promoter' : TOUR_STEPS[step].page;
  history.replaceState(history.state, '', url);
  render(true);
}

function page(): Page {
  const value = location.hash.slice(1);
  return value === 'promoter' || value === 'ai' || pages.includes(value as typeof pages[number]) ? value as Page : 'route';
}

function navigate(destination: Page): void {
  if (guidedTour?.isActive() && destination !== 'promoter') {
    const step = guideStepForPage(destination);
    if (guidedTour.getProgress().step !== step) { guidedTour.goTo(step); return; }
  }
  if (page() === destination) { render(true); return; }
  location.hash = destination;
}

function cityName(id: string): string {
  return current.audit.replay.scenario.cities.find(city => city.id === id)?.name ?? 'UNKNOWN';
}

function hasUsableFit(): boolean {
  const report = current.audit.analysis.repairs.fitReport;
  return report.status === 'known' && report.value.cities.some(city => city.value.status === 'known');
}

function useResult(result: ApiDecisionResult): void {
  if (guidedTour?.isActive()) guidedTour.skip();
  decisionRevision += 1;
  busy = false;
  app.removeAttribute('aria-busy');
  baseline = result;
  current = result;
  liveBaseRunId = result.mode === 'live' ? result.audit.runId : undefined;
  aiView?.dispose();
  aiView = undefined;
  aiSession = undefined;
  aiAcceptances = [];
  acceptedSessions.clear();
  selectedId = selectedRecommendation(result)?.id ?? result.audit.analysis.repairs.options[0]?.id ?? '';
  navigate('options');
  announce(`${result.mode === 'demo' ? 'Demo' : 'Live Qloo'} decision ready. ${recommendedSummary(result)}.`);
}

function acceptResearch(session: AiSessionResult, proposal: AiValidatedProposal): void {
  const sameArtists = JSON.stringify([current.artists.target.id, ...current.artists.comparisons.map(row => row.id), current.artists.control.id])
    === JSON.stringify([session.baseResult.artists.target.id, ...session.baseResult.artists.comparisons.map(row => row.id), session.baseResult.artists.control.id]);
  const resetContext = current.mode !== session.mode || !sameArtists;
  const source = resetContext ? session.baseResult : current;
  const generatedAt = new Date(Math.max(Date.now(), Date.parse(source.audit.generatedAt), Date.parse(session.completedAt))).toISOString();
  const acceptance = acceptAiProposal(source.audit, session, proposal.draft.id, {
    generatedAt, runId: `browser-ai-${crypto.randomUUID()}`,
  });
  decisionRevision += 1;
  busy = false;
  app.removeAttribute('aria-busy');
  if (resetContext) { aiAcceptances = []; acceptedSessions.clear(); }
  aiSession = session;
  aiAcceptances = [...aiAcceptances.filter(row => row.optionId !== acceptance.optionId), acceptance];
  acceptedSessions.set(session.sessionId, session);
  for (const id of acceptedSessions.keys()) {
    if (!aiAcceptances.some(row => row.sessionId === id)) acceptedSessions.delete(id);
  }
  current = { ...source, audit: acceptance.audit };
  baseline = current;
  selectedId = acceptance.optionId;
  // New research must start from a fresh server context, not quietly discard accepted cards.
  liveBaseRunId = undefined;
  navigate('options');
  announce(`${proposal.draft.venueName} accepted into comparison. All checks and breakpoints were recomputed. No booking was made.`);
}

function aiScreen(): HTMLElement {
  aiView ??= createAiRescueView({
    workerOrigin: __WORKER_ORIGIN__, getCurrentResult: () => current,
    getLiveBaseRunId: () => liveBaseRunId,
    onAccept: acceptResearch,
    onStartLiveSetup: () => {
      if (guidedTour?.isActive()) guidedTour.skip();
      openLiveDialog(__WORKER_ORIGIN__, current, useResult);
    },
  });
  aiView.refresh();
  return aiView.element;
}

function researchEvidence(): HTMLElement | undefined {
  if (!aiSession || aiAcceptances.length === 0) return undefined;
  const panel = el('section', 'panel accepted-research');
  panel.append(el('h2', '', 'Accepted AI research'), el('p', 'muted',
    `${aiSession.mode === 'demo' ? 'Synthetic transcript' : 'Claude Sonnet 5.5 research'} · ${aiAcceptances.length} accepted comparison card${aiAcceptances.length === 1 ? '' : 's'}. Public research does not confirm a booking.`));
  const sources = new Map<string, AiSessionResult['sources'][number]>();
  for (const acceptance of aiAcceptances) {
    for (const source of acceptedSessions.get(acceptance.sessionId)?.sources ?? []) {
      if (acceptance.sourceIds.includes(source.id)) sources.set(`${acceptance.sessionId}:${source.id}`, source);
    }
  }
  const list = el('ul', 'research-source-list');
  for (const source of sources.values()) {
    const item = el('li');
    const url = safeAiSourceUrl(source.url);
    if (url) {
      const link = el('a', '', source.title);
      link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
      item.append(link);
    } else item.append(el('span', '', source.title));
    item.append(el('small', '', `${source.provenance === 'synthetic' ? 'Synthetic evidence' : source.kind} · ${source.retrievedAt}`));
    list.append(item);
  }
  panel.append(list, button('Review research session', () => navigate('ai'), 'text-button'));
  return panel;
}

function header(): HTMLElement {
  const node = el('header', 'app-header');
  const brand = el('div', 'brand-area');
  const logo = button('Tour Rescue', () => navigate('route'), 'brand');
  logo.setAttribute('aria-label', 'Tour Rescue - route');
  const tour = el('div', 'header-tour');
  tour.append(el('strong', '', current.artists.target.name ?? current.artists.target.id), el('span', '', '10-18 November 2026'));
  brand.append(logo, tour);
  const nav = el('nav', 'step-nav');
  nav.setAttribute('aria-label', 'Tour rescue steps');
  pages.forEach((destination, index) => {
    const link = el('a', `step ${page() === destination ? 'is-active' : ''}`);
    link.href = `#${destination}`;
    if (page() === destination) link.setAttribute('aria-current', 'page');
    link.append(el('span', 'step-number', String(index + 1)), el('span', 'step-label', labels[index]));
    nav.append(link);
  });
  const mode = el('div', 'mode-controls');
  const modeLabel = badge(current.mode === 'demo' ? 'unknown' : 'pass', current.mode === 'demo' ? 'DEMO' : 'LIVE QLOO');
  const live = button('Try live', () => openLiveDialog(__WORKER_ORIGIN__, current, useResult), 'live-button');
  live.disabled = guidedTour?.isActive() ?? false;
  live.prepend(el('span', 'live-dot'));
  const ai = button('Rescue with AI (Pro)', () => navigate(page() === 'ai' ? 'options' : 'ai'), 'ai-mode-button');
  ai.setAttribute('aria-pressed', String(page() === 'ai'));
  ai.dataset.tour = 'ai';
  const guide = button('Start the guided tour', () => {
    preserveGuideWorkspace = true;
    const progress = guidedTour?.getProgress();
    if (progress && (progress.status === 'paused' || progress.status === 'in-progress')) guidedTour?.resume(guide);
    else guidedTour?.start(guide);
  }, 'guide-start-button');
  guide.disabled = busy || (guidedTour?.isActive() ?? false);
  guide.title = 'Explore a temporary synthetic demo; your comparison is restored when you leave the tour.';
  mode.append(modeLabel, live, ai, guide, el('span', 'mode-note', 'Daily limits apply'));
  node.append(brand, nav, mode);
  return node;
}

function hero(title: string, subtitle: string): HTMLElement {
  const node = el('section', 'page-hero');
  const eyebrow = el('p', 'eyebrow', 'GERMANY / 5 DATES / 1 CANCELLATION');
  const h1 = el('h1', '', title);
  h1.tabIndex = -1;
  node.append(eyebrow, h1, el('p', 'hero-subtitle', subtitle));
  return node;
}

function provenanceNote(): HTMLElement {
  const note = el('div', 'data-note');
  note.append(el('span', 'data-dot'));
  note.append(el('span', '', current.mode === 'demo'
    ? 'Synthetic taste data and fictional bookings. Recorded OSRM road snapshot. No live requests.'
    : `${hasUsableFit() ? 'Live Qloo fit available.' : 'Live Qloo attempt; cultural-fit evidence UNKNOWN. See the audit.'} ${aiAcceptances.length ? 'Fictional Germany tour. Researched venues remain unconfirmed; inspect the source links and UNKNOWN checks.' : 'The Germany route and venue facts are still fictional; venue availability is not verified.'}`));
  if (guidedTour?.isActive()) note.append(el('span', 'guide-context-note', guideWorkspace
    ? 'Guided demo: your previous comparison returns when you finish or skip.'
    : 'Guided demo: these changes use synthetic taste evidence and no provider calls.'));
  else if (current.mode === 'live') note.append(button('Return to demo', () => useResult(createDemoResult()), 'text-button'));
  return note;
}

function assumptions(compact = false): HTMLElement {
  const constraints = current.audit.replay.scenario.tour.constraints;
  const node = el('div', compact ? 'assumptions compact' : 'assumptions');
  if (!compact) node.append(el('h2', '', 'Fixed tour assumptions'));
  const list = el('div', 'assumption-list');
  for (const [name, text] of [
    ['road', `Up to ${formatDuration(constraints.maxDailyDrivingSeconds)} driving / day`],
    ['clock', 'Depart after the show'],
    ['gap', `At least ${formatDistance(constraints.minimumMarketSpacingMetres)} between markets`],
  ] as const) {
    const item = el('span', 'assumption');
    item.append(icon(name), el('span', '', text));
    list.append(item);
  }
  node.append(list);
  return node;
}

function routeStrip(): HTMLElement {
  const strip = el('ol', 'route-strip');
  strip.setAttribute('aria-label', 'Original tour - four locked dates and one cancellation');
  for (const show of current.audit.replay.scenario.tour.shows) {
    const item = el('li', show.status === 'cancelled' ? 'strip-stop is-cancelled' : 'strip-stop');
    const content = el('div');
    content.append(el('span', 'strip-date', formatDate(show.schedule.startsAt)), el('strong', '', cityName(show.cityId)));
    if (show.status === 'cancelled') content.append(el('small', '', 'Cancelled'));
    const marker = icon(show.status === 'cancelled' ? 'close' : 'lock');
    marker.classList.add('strip-marker');
    item.append(content, marker);
    strip.append(item);
  }
  return strip;
}

function routeScreen(): HTMLElement {
  const screen = el('div');
  screen.append(hero('One date fell through. The rest stays.',
    'Leipzig, 14 November. Four shows are locked. Find the repair that earns its place on the tour.'));
  const grid = el('div', 'route-layout');
  const left = el('section', 'route-left');
  const timeline = el('ol', 'tour-timeline panel');
  for (const show of current.audit.replay.scenario.tour.shows) {
    const cancelled = show.status === 'cancelled';
    const row = el('li', `tour-stop ${cancelled ? 'is-cancelled' : ''}`);
    if (cancelled) row.dataset.tour = 'cancelled-date';
    const date = el('div', 'stop-date');
    date.append(el('strong', '', formatDate(show.schedule.startsAt)), el('span', '',
      new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: show.schedule.startsAt.timeZone }).format(new Date(show.schedule.startsAt.iso))));
    const marker = el('div', 'stop-marker');
    marker.append(icon(cancelled ? 'close' : 'check'));
    const detail = el('div', 'stop-detail');
    detail.append(el('h2', '', cityName(show.cityId)), el('p', '', cancelled ? 'The slot we need to rescue' : 'Fictional venue · fixed commitment'));
    const state = el('div', 'stop-state');
    state.append(badge(cancelled ? 'fail' : 'pass', cancelled ? 'Cancelled' : 'Confirmed'));
    if (cancelled) {
      const rescue = button('Rescue this date', () => navigate('options'), 'button button-primary');
      rescue.append(icon('arrow'));
      state.append(rescue);
    } else {
      const locked = el('span', 'locked-label', 'Date locked');
      locked.prepend(icon('lock'));
      state.append(locked);
    }
    row.append(date, marker, detail, state);
    timeline.append(row);
  }
  left.append(timeline, assumptions());
  grid.append(left, renderRouteMap(current.audit));
  screen.append(grid);
  return screen;
}

function checkRow(check: ConstraintCheck): HTMLElement {
  const row = el('li', 'check-row');
  row.append(badge(check.status), el('span', '', check.message));
  return row;
}

function optionCard(option: EvaluatedRepairOption): HTMLElement {
  const recommendation = current.audit.analysis.decision.recommendation;
  const recommended = recommendation.status === 'recommended' && recommendation.optionId === option.id;
  const status = decisionStatus(current, option.id);
  const card = el('article', `option-card panel ${selectedId === option.id ? 'is-selected' : ''} ${recommended ? 'is-recommended' : ''}`);
  card.setAttribute('aria-label', `${optionTitle(current, option.id)}, decision ${status}${recommended ? ', recommended' : ''}`);
  const heading = el('div', 'option-heading');
  heading.append(el('span', 'option-letter', optionLetter(current, option.id)));
  const name = el('div', 'option-name');
  name.append(el('h2', '', optionCity(current, option.id)), el('p', '', `${formatDate(cancelledShow(current).schedule.startsAt)} · ${option.kind === 'replacement' ? 'Replacement show' : option.kind === 'detour' ? 'Longer detour' : 'No replacement show'}`));
  heading.append(name);
  card.append(heading);
  const outcome = el('div', 'option-outcome');
  outcome.append(badge(recommended ? 'pass' : status === 'FAIL' ? 'fail' : 'unknown',
    recommended ? 'Recommended' : status === 'FAIL' ? 'Excluded by a gate' : status === 'UNKNOWN' ? 'Needs evidence' : 'Eligible alternative'));
  card.append(outcome);
  const fit = el('div', 'option-fit');
  fit.append(el('strong', '', fitDisplay(option)), el('span', '', option.kind === 'day-off' ? 'no audience-fit score' : 'fit index / 100'));
  card.append(fit);
  const travel = el('div', 'option-travel');
  for (const [value, label] of [
    [knowledgeText(option.additionalDistanceMetres, value => formatDistance(value, true)), 'extra distance'],
    [knowledgeText(option.additionalDrivingSeconds, value => formatDuration(value, true)), 'extra driving'],
  ]) {
    const cell = el('div');
    cell.append(el('strong', '', value), el('span', '', label));
    travel.append(cell);
  }
  card.append(travel);
  const venueFee = option.kind === 'day-off' ? 'N/A - no replacement venue' : option.venue.status === 'known'
    ? knowledgeText(option.venue.value.fee, formatMoney) : 'UNKNOWN';
  const researched = aiAcceptances.some(row => row.optionId === option.id);
  card.append(el('p', 'fee-line', `Venue fee: ${venueFee}${option.kind === 'day-off' ? '' : researched ? ' · verify with venue' : ' · fictional'}`));
  if (researched) card.append(el('p', 'ai-card-note', 'Accepted from AI research · checks recomputed'));
  const list = el('ul', 'option-checks');
  const feasibility = el('li', 'check-row');
  feasibility.append(badge(option.status), el('span', '', 'Declared route and venue checks'));
  list.append(feasibility);
  const peak = el('li', 'drive-summary');
  peak.append(icon('road'), el('span', '', `Peak day: ${knowledgeText(maxDailyDriving(option), formatDuration)} / ${formatDuration(current.audit.replay.scenario.tour.constraints.maxDailyDrivingSeconds)}`));
  list.append(peak);
  const decision = current.audit.analysis.decision.options.find(row => row.optionId === option.id);
  for (const check of decision?.checks.filter(check => !option.checks.some(original => original.id === check.id)) ?? []) list.append(checkRow(check));
  card.append(list);
  const details = el('details', 'option-details');
  details.append(el('summary', '', `All ${decision?.checks.length ?? option.checks.length} checks`));
  const full = el('ul', 'all-checks');
  (decision?.checks ?? option.checks).forEach(check => full.append(checkRow(check)));
  details.append(full);
  card.append(details);
  const select = button(selectedId === option.id ? 'Selected for promoter sheet' : `Select option ${optionLetter(current, option.id)}`, () => {
    selectedId = option.id;
    render();
    app.querySelector<HTMLButtonElement>('.option-card button[aria-pressed="true"]')?.focus({ preventScroll: true });
    announce(`${optionTitle(current, option.id)} selected for the promoter sheet.`);
  }, selectedId === option.id ? 'button button-selected' : 'button button-secondary');
  select.setAttribute('aria-pressed', String(selectedId === option.id));
  card.append(select);
  return card;
}

function optionGrid(): HTMLElement {
  const grid = el('div', 'option-grid');
  grid.dataset.tour = 'options';
  for (const option of current.audit.analysis.repairs.options) grid.append(optionCard(option));
  return grid;
}

function decisionBanner(): HTMLElement {
  const recommendation = current.audit.analysis.decision.recommendation;
  const node = el('div', `decision-banner ${recommendation.status === 'recommended' ? 'is-resolved' : ''}`);
  const copy = el('div');
  copy.append(el('strong', '', recommendation.status === 'recommended' ? `${recommendedSummary(current)} is recommended` : recommendedSummary(current)),
    el('p', '', recommendation.reason));
  node.append(icon(recommendation.status === 'recommended' ? 'check' : 'clock'), copy);
  if (!sameDecisionPolicy(current, baseline)) node.append(button('Reset assumptions', resetAssumptions, 'text-button'));
  return node;
}

function optionsScreen(): HTMLElement {
  const node = el('div');
  node.append(hero('Leipzig is cancelled. What saves the date?', 'Three options. Four commitments unchanged. Fit and additional travel stay separate.'), routeStrip(), assumptions(true), decisionBanner(), optionGrid());
  node.append(renderFitScatter(current.audit, selectedId, id => {
    selectedId = id;
    render();
    app.querySelector<SVGElement>('.scatter-point[aria-pressed="true"]')?.focus({ preventScroll: true });
    announce(`${optionTitle(current, id)} selected.`);
  }));
  node.append(el('p', 'fine-print', 'All travel differences are against the day-off route. Fit is a weighted within-query percentile index, not ticket demand or an attendance forecast.'));
  const evidence = researchEvidence();
  if (evidence) node.append(evidence);
  return node;
}

function applyChanges(changes: DecisionChanges): void {
  if (busy) return;
  const activeControl = document.activeElement;
  const focusSelector = ['.bp-exact-input', '.bp-apply', '.bp-witness-button']
    .find(selector => activeControl?.matches(selector));
  busy = true;
  const revision = ++decisionRevision;
  const source = baseline;
  announce('Rechecking the decision using the same recorded evidence.');
  app.setAttribute('aria-busy', 'true');
  window.setTimeout(() => {
    if (revision !== decisionRevision) return;
    try {
      current = recomputeResult(source, changes);
      selectedId = selectedRecommendation(current)?.id ?? selectedId;
      busy = false;
      render();
      if (focusSelector && !activeControl?.isConnected) {
        app.querySelector<HTMLElement>(focusSelector)?.focus({ preventScroll: true });
      }
      announce(`Decision recomputed: ${recommendedSummary(current)}.`);
    } catch (error) { showError(error); }
    finally { busy = false; app.removeAttribute('aria-busy'); }
  }, 20);
}

function resetAssumptions(): void {
  decisionRevision += 1;
  busy = false;
  app.removeAttribute('aria-busy');
  current = baseline;
  selectedId = selectedRecommendation(current)?.id ?? selectedId;
  render();
  announce('Original assumptions restored.');
}

function breakpointScreen(): HTMLElement {
  const node = el('div');
  node.append(hero('What changes this decision?', 'Move one assumption. See the exact point where the recommendation changes.'), routeStrip(), assumptions(true));
  node.append(renderBreakpointView(baseline, current, applyChanges, resetAssumptions));
  node.append(el('h2', 'section-heading', 'Options under the current assumption'), optionGrid());
  return node;
}

function footer(): HTMLElement {
  const node = el('footer', 'app-footer');
  const actions = el('div', 'footer-actions');
  if (page() === 'audit') actions.dataset.tour = 'exports';
  if (page() === 'route') actions.append(button('Compare three options', () => navigate('options'), 'button button-primary'));
  if (page() === 'options') actions.append(button('Explore breakpoint', () => navigate('breakpoint'), 'button button-primary'));
  if (page() === 'breakpoint' || page() === 'evidence') actions.append(button('Back to options', () => navigate('options'), 'button button-secondary'));
  if (page() !== 'route' && page() !== 'audit') actions.append(button(page() === 'evidence' ? 'Open audit' : 'See evidence', () => navigate(page() === 'evidence' ? 'audit' : 'evidence'), 'button button-secondary'));
  if (page() === 'audit') {
    const download = button('Download audit (JSON)', () => {
      const payload = aiSession && aiAcceptances.length ? createAiAuditEnvelope(aiSession, aiAcceptances, current.audit,
        new Date(Math.max(Date.now(), Date.parse(current.audit.generatedAt))).toISOString(),
        [...acceptedSessions.values()].filter(row => row.sessionId !== aiSession!.sessionId)) : current.audit;
      downloadJson(payload, `tour-rescue-${current.mode}-${current.audit.runId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
      announce('Audit JSON download started.');
    }, 'button button-primary');
    download.prepend(icon('download'));
    actions.append(download, button('Copy summary', () => { void copySummary(); }, 'button button-secondary'));
  }
  if (page() !== 'route' && page() !== 'ai') actions.append(button(`Promoter sheet · ${optionLetter(current, selectedId)}`, () => navigate('promoter'), 'button button-secondary'));
  const source = el('p', 'footer-source', `${current.mode === 'demo' ? 'Synthetic taste fixtures' : 'Taste requests: Qloo'} · Roads: OSRM snapshot`);
  source.append(el('span', '', current.mode === 'demo' ? 'Demo taste profiles are synthetic. No booking is made.'
    : `${hasUsableFit() ? 'Live fit available.' : 'Taste evidence UNKNOWN.'} ${aiAcceptances.length ? 'Researched booking facts remain UNKNOWN.' : 'Availability and fees remain fictional.'}`));
  const home = el('a', 'app-home-link', 'About Tour Rescue');
  home.href = '/';
  source.append(home);
  node.append(actions, source);
  return node;
}

async function copySummary(): Promise<void> {
  const text = `${current.artists.target.name ?? current.artists.target.id} | ${recommendedSummary(current)} | ${current.mode.toUpperCase()}\n`
    + `Generated: ${current.audit.generatedAt}\nZero violations gate: ${current.audit.zeroViolationsGate.status} (declared checks only)\n`
    + `Selected for promoter: ${optionTitle(current, selectedId)} | ${decisionStatus(current, selectedId)}\n`
    + `Cultural fit is not attendance. ${aiAcceptances.length ? 'Researched venues are unconfirmed; review UNKNOWN checks and source links.' : 'Venue facts in this scenario are fictional.'}`;
  try { await navigator.clipboard.writeText(text); announce('Decision summary copied.'); showToast('Decision summary copied.'); }
  catch { showToast('Clipboard unavailable. Download the audit JSON for the full decision.'); }
}

function showToast(message: string): void {
  document.querySelector('.toast')?.remove();
  const toast = el('div', 'toast', message);
  toast.setAttribute('role', 'status');
  document.body.append(toast);
  window.setTimeout(() => toast.remove(), 5_000);
}

function showError(error: unknown): void {
  const message = error instanceof Error ? error.message : 'The action could not be completed.';
  showToast(message);
  announce(message);
}

function promoterScreen(): void {
  app.hidden = true;
  promoter.hidden = false;
  const toolbar = el('div', 'promoter-toolbar');
  toolbar.dataset.tour = 'exports';
  toolbar.append(button(guidedTour?.isActive() ? 'Back to audit' : 'Back to options',
    () => navigate(guidedTour?.isActive() ? 'audit' : 'options'), 'button button-secondary'));
  const group = el('div', 'promoter-toolbar-actions');
  const selection = el('select');
  selection.setAttribute('aria-label', 'Promoter sheet option');
  for (const option of current.audit.analysis.repairs.options) {
    const item = el('option', '', optionTitle(current, option.id));
    item.value = option.id;
    item.selected = option.id === selectedId;
    selection.append(item);
  }
  selection.addEventListener('change', () => { selectedId = selection.value; promoterScreen(); guidedTour?.refresh(); });
  const png = button('Download PNG', () => {
    png.disabled = true;
    png.textContent = 'Preparing PNG...';
    void downloadPromoterPng(current, selectedId).then(() => announce('Promoter PNG download started.'), showError)
      .finally(() => { png.disabled = false; png.textContent = 'Download PNG'; });
  }, 'button button-secondary');
  group.append(selection, png, button('Print / Save PDF', () => window.print(), 'button button-primary'));
  toolbar.append(group);
  promoter.replaceChildren(toolbar, renderPromoterSheet(current, selectedId));
  document.title = `${optionTitle(current, selectedId)} - promoter sheet - Tour Rescue`;
}

function render(focusHeading = false): void {
  if (!current) return;
  if (page() === 'promoter') { promoterScreen(); if (focusHeading) window.scrollTo(0, 0); guidedTour?.refresh(); return; }
  app.hidden = false;
  promoter.hidden = true;
  promoter.replaceChildren();
  const main = el('main', 'main-content');
  main.id = 'main-content';
  const active = page();
  const content = active === 'ai' ? aiScreen() : active === 'route' ? routeScreen() : active === 'options' ? optionsScreen() : active === 'breakpoint' ? breakpointScreen()
    : (() => {
      const node = el('div');
      if (active === 'evidence') node.append(hero(`Why ${optionCity(current, selectedId)}?`, 'Trace the fit. Test the artists. Keep uncertainty visible.'), renderEvidence(current, selectedId));
      else node.append(hero('A decision you can check.', 'Every declared constraint, source and changed stop. Download the record and replay it.'), routeStrip(), assumptions(true), renderAudit(current, selectedId));
      const evidence = researchEvidence();
      if (evidence) node.append(evidence);
      return node;
    })();
  main.append(content, provenanceNote(), footer());
  app.replaceChildren(header(), main);
  document.title = `${active === 'ai' ? 'AI Rescue (Pro)' : labels[pages.indexOf(active as typeof pages[number])]} - Tour Rescue`;
  if (focusHeading) { window.scrollTo(0, 0); main.querySelector('h1')?.focus({ preventScroll: true }); }
  guidedTour?.refresh();
}

window.addEventListener('hashchange', () => {
  if (guidedTour?.isActive()) {
    const step = guideStepForPage(page());
    if (guidedTour.getProgress().step !== step) { guidedTour.goTo(step); return; }
  }
  render(true);
});
try {
  baseline = createDemoResult();
  current = baseline;
  selectedId = selectedRecommendation(current)?.id ?? current.audit.analysis.repairs.options[0]?.id ?? '';
  guidedTour = createGuidedTour({
    navigate: navigateGuide,
    getTarget: step => document.querySelector<HTMLElement>(`${page() === 'promoter' ? '#promoter-view' : '#app'} [data-tour="${TOUR_STEPS[step].target}"]`),
    onStart: beginGuidedWorkspace,
    onExit: finishGuidedWorkspace,
    getReturnFocus: () => page() === 'promoter' ? promoter.querySelector<HTMLButtonElement>('button')
      : app.querySelector<HTMLButtonElement>('.guide-start-button'),
  });
  render();
  const entry = new URL(location.href);
  const tourIntent = guidedTourRequest(entry.search);
  if (tourIntent === 'start' || tourIntent === 'resume') {
    entry.searchParams.delete('tour');
    history.replaceState(history.state, '', entry);
    preserveGuideWorkspace = false;
    if (tourIntent === 'resume') guidedTour.resume();
    else guidedTour.start();
  }
} catch (error) {
  const failure = el('main', 'boot-state');
  failure.append(el('h1', '', 'The demo could not be evaluated.'), el('p', '', error instanceof Error ? error.message : 'Unexpected data error.'),
    button('Reload demo', () => location.reload(), 'button button-primary'));
  app.replaceChildren(failure);
}
