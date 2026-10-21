import './styles.css';
import './visuals.css';
import './promoter.css';
import './evidence.css';
import './breakpoint.css';
import './live-dialog.css';
import { createDemoResult, recomputeResult } from './data.ts';
import type { ApiDecisionResult, DecisionChanges } from './data.ts';
import { cancelledShow, decisionStatus, fitDisplay, formatDate, formatDistance, formatDuration,
  formatMoney, knowledgeText, maxDailyDriving, optionById, optionCity, optionLetter, optionTitle,
  recommendedSummary, sameDecisionPolicy, selectedRecommendation } from './presentation.ts';
import { announce, badge, button, downloadJson, el, icon } from './dom.ts';
import { renderRouteMap, renderFitScatter } from './visuals.ts';
import { renderEvidence, renderAudit } from './evidence.ts';
import { renderBreakpointView } from './breakpoint-view.ts';
import { renderPromoterSheet, downloadPromoterPng } from './promoter.ts';
import { openLiveDialog } from './live-dialog.ts';
import type { ConstraintCheck } from '../../src/core/travel-constraints.ts';
import type { EvaluatedRepairOption } from '../../src/core/repair-types.ts';

declare const __WORKER_ORIGIN__: string;

const pages = ['route', 'options', 'breakpoint', 'evidence', 'audit'] as const;
const labels = ['Route', 'Options', 'Breakpoint', 'Evidence', 'Audit'];
type Page = typeof pages[number] | 'promoter';
const app = document.getElementById('app')!;
const promoter = document.getElementById('promoter-view')!;
let baseline: ApiDecisionResult;
let current: ApiDecisionResult;
let selectedId = '';
let busy = false;
let decisionRevision = 0;

function page(): Page {
  const value = location.hash.slice(1);
  return value === 'promoter' || pages.includes(value as typeof pages[number]) ? value as Page : 'route';
}

function navigate(destination: Page): void {
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
  decisionRevision += 1;
  busy = false;
  app.removeAttribute('aria-busy');
  baseline = result;
  current = result;
  selectedId = selectedRecommendation(result)?.id ?? result.audit.analysis.repairs.options[0]?.id ?? '';
  navigate('options');
  announce(`${result.mode === 'demo' ? 'Demo' : 'Live Qloo'} decision ready. ${recommendedSummary(result)}.`);
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
  live.prepend(el('span', 'live-dot'));
  mode.append(modeLabel, live, el('span', 'mode-note', 'Daily limits apply'));
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
    : `${hasUsableFit() ? 'Live Qloo fit available.' : 'Live Qloo attempt; cultural-fit evidence UNKNOWN. See the audit.'} The Germany route and venue facts are still fictional; venue availability is not verified.`));
  if (current.mode === 'live') note.append(button('Return to demo', () => useResult(createDemoResult()), 'text-button'));
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
  card.append(el('p', 'fee-line', `Venue fee: ${venueFee}${option.kind === 'day-off' ? '' : ' · fictional'}`));
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
  return node;
}

function applyChanges(changes: DecisionChanges): void {
  if (busy) return;
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
      render();
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
  if (page() === 'route') actions.append(button('Compare three options', () => navigate('options'), 'button button-primary'));
  if (page() === 'options') actions.append(button('Explore breakpoint', () => navigate('breakpoint'), 'button button-primary'));
  if (page() === 'breakpoint' || page() === 'evidence') actions.append(button('Back to options', () => navigate('options'), 'button button-secondary'));
  if (page() !== 'route' && page() !== 'audit') actions.append(button(page() === 'evidence' ? 'Open audit' : 'See evidence', () => navigate(page() === 'evidence' ? 'audit' : 'evidence'), 'button button-secondary'));
  if (page() === 'audit') {
    const download = button('Download audit (JSON)', () => {
      downloadJson(current.audit, `tour-rescue-${current.mode}-${current.audit.runId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
      announce('Audit JSON download started.');
    }, 'button button-primary');
    download.prepend(icon('download'));
    actions.append(download, button('Copy summary', () => { void copySummary(); }, 'button button-secondary'));
  }
  if (page() !== 'route') actions.append(button(`Promoter sheet · ${optionLetter(current, selectedId)}`, () => navigate('promoter'), 'button button-secondary'));
  const source = el('p', 'footer-source', `${current.mode === 'demo' ? 'Synthetic taste fixtures' : 'Taste requests: Qloo'} · Roads: OSRM snapshot`);
  source.append(el('span', '', current.mode === 'demo' ? 'Demo taste profiles are synthetic. No booking is made.'
    : `${hasUsableFit() ? 'Live fit available.' : 'Taste evidence UNKNOWN.'} Availability and fees remain fictional.`));
  node.append(actions, source);
  return node;
}

async function copySummary(): Promise<void> {
  const text = `${current.artists.target.name ?? current.artists.target.id} | ${recommendedSummary(current)} | ${current.mode.toUpperCase()}\n`
    + `Generated: ${current.audit.generatedAt}\nZero violations gate: ${current.audit.zeroViolationsGate.status} (declared checks only)\n`
    + `Selected for promoter: ${optionTitle(current, selectedId)} | ${decisionStatus(current, selectedId)}\n`
    + 'Cultural fit is not attendance. Venue facts in this scenario are fictional.';
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
  toolbar.append(button('Back to options', () => navigate('options'), 'button button-secondary'));
  const group = el('div', 'promoter-toolbar-actions');
  const selection = el('select');
  selection.setAttribute('aria-label', 'Promoter sheet option');
  for (const option of current.audit.analysis.repairs.options) {
    const item = el('option', '', optionTitle(current, option.id));
    item.value = option.id;
    item.selected = option.id === selectedId;
    selection.append(item);
  }
  selection.addEventListener('change', () => { selectedId = selection.value; promoterScreen(); });
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
  if (page() === 'promoter') { promoterScreen(); if (focusHeading) window.scrollTo(0, 0); return; }
  app.hidden = false;
  promoter.hidden = true;
  promoter.replaceChildren();
  const main = el('main', 'main-content');
  main.id = 'main-content';
  const active = page();
  const content = active === 'route' ? routeScreen() : active === 'options' ? optionsScreen() : active === 'breakpoint' ? breakpointScreen()
    : (() => {
      const node = el('div');
      if (active === 'evidence') node.append(hero(`Why ${optionCity(current, selectedId)}?`, 'Trace the fit. Test the artists. Keep uncertainty visible.'), renderEvidence(current, selectedId));
      else node.append(hero('A decision you can check.', 'Every declared constraint, source and changed stop. Download the record and replay it.'), routeStrip(), assumptions(true), renderAudit(current, selectedId));
      return node;
    })();
  main.append(content, provenanceNote(), footer());
  app.replaceChildren(header(), main);
  document.title = `${labels[pages.indexOf(active as typeof pages[number])]} - Tour Rescue`;
  if (focusHeading) { window.scrollTo(0, 0); main.querySelector('h1')?.focus({ preventScroll: true }); }
}

window.addEventListener('hashchange', () => render(true));
try {
  baseline = createDemoResult();
  current = baseline;
  selectedId = selectedRecommendation(current)?.id ?? current.audit.analysis.repairs.options[0]?.id ?? '';
  render();
} catch (error) {
  const failure = el('main', 'boot-state');
  failure.append(el('h1', '', 'The demo could not be evaluated.'), el('p', '', error instanceof Error ? error.message : 'Unexpected data error.'),
    button('Reload demo', () => location.reload(), 'button button-primary'));
  app.replaceChildren(failure);
}
