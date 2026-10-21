import { AI_DEMO_SCENARIOS, createAiDemoSession } from '../../src/ai/demo.ts';
import type { AiDemoScenarioId } from '../../src/ai/demo.ts';
import { safeAiSourceUrl } from '../../src/ai/tools.ts';
import type { AiSessionResult, AiSource, AiStep, AiValidatedProposal } from '../../src/ai/types.ts';
import { ApiError } from './data.ts';
import type { ApiDecisionResult } from './data.ts';
import { createAiClient } from './ai-client.ts';
import { announce, badge, button, downloadJson, el } from './dom.ts';
import { cancelledShow, formatDate, formatDistance, formatDuration, formatFit, knowledgeText } from './presentation.ts';

export interface AiRescueViewOptions {
  readonly workerOrigin: string;
  readonly getCurrentResult: () => ApiDecisionResult;
  /** The original Worker run ID, not a browser what-if or an accepted proposal's ID. */
  readonly getLiveBaseRunId?: () => string | undefined;
  readonly onAccept: (session: AiSessionResult, proposal: AiValidatedProposal) => void | Promise<void>;
  readonly onStartLiveSetup?: () => void;
}

export interface AiRescueView {
  readonly element: HTMLElement;
  readonly refresh: () => void;
  readonly dispose: () => void;
}

const stopLabels: Record<AiSessionResult['stopReason'], string> = {
  completed: 'Research complete', 'step-limit': 'Model-turn limit reached', 'token-limit': 'Token allowance reached',
  'tool-limit': 'Research-call limit reached', cancelled: 'Research stopped', 'provider-error': 'Provider unavailable', incomplete: 'Research incomplete',
};

/** The controller owns one persistent view; reattaching it never starts another paid session. */
export function createAiRescueView(options: AiRescueViewOptions): AiRescueView {
  const api = createAiClient(options.workerOrigin);
  const element = el('section', 'ai-rescue');
  let disposed = false;
  let mode: 'demo' | 'live' = 'demo';
  let running = false;
  let health: 'unknown' | 'checking' | 'enabled' | 'disabled' | 'failed' = 'unknown';
  let runController: AbortController | undefined;
  let healthController: AbortController | undefined;
  let generation = 0;
  let session: AiSessionResult | undefined;
  let selectedDemo: AiDemoScenarioId = AI_DEMO_SCENARIOS[0]!.id;
  const accepted = new Map<AiValidatedProposal['draft']['kind'], string>();

  const hero = el('header', 'page-hero ai-hero');
  const eyebrow = el('div', 'ai-eyebrow');
  eyebrow.append(el('p', 'eyebrow', 'RESEARCH THE GAP'), el('span', 'ai-pro-label', 'PRO'));
  const title = el('h1', '', 'Rescue with AI');
  title.tabIndex = -1;
  hero.append(eyebrow, title, el('p', 'hero-subtitle', 'Investigate the region, inspect the evidence, then choose what to compare. Every proposal goes through the same deterministic checks.'));
  const layout = el('div', 'ai-layout');
  const controls = el('aside', 'panel ai-controls');
  controls.setAttribute('aria-label', 'AI research settings');
  const scope = el('div', 'ai-scope');
  const scopeName = el('strong');
  const scopeDate = el('p');
  scope.append(el('p', 'eyebrow', 'ONE GAP. FOUR LOCKED SHOWS.'), scopeName, scopeDate);
  const switcher = el('div', 'ai-mode-switch');
  switcher.setAttribute('role', 'group');
  switcher.setAttribute('aria-label', 'AI evidence mode');
  const demoButton = button('Saved demo', () => setMode('demo'), 'ai-evidence-mode');
  const liveButton = button('Live research', () => setMode('live'), 'ai-evidence-mode');
  switcher.append(demoButton, liveButton);
  const demoFields = el('div', 'ai-demo-fields');
  const demoLabel = el('label', 'ai-field');
  demoLabel.append(el('span', '', 'Saved scenario'));
  const demoSelect = el('select');
  demoSelect.name = 'ai-scenario';
  for (const item of AI_DEMO_SCENARIOS) {
    const choice = el('option', '', item.title);
    choice.value = item.id;
    demoSelect.append(choice);
  }
  demoLabel.append(demoSelect);
  const demoDescription = el('p', 'ai-setting-note');
  demoFields.append(demoLabel, demoDescription, el('p', 'ai-mode-disclosure', 'Synthetic saved transcript. No Claude or web request is made. Affinities and booking facts are fictional.'));
  const liveFields = el('div', 'ai-live-fields');
  const connectionText = el('p', 'ai-setting-note');
  connectionText.setAttribute('role', 'status');
  const liveContext = el('p', 'ai-mode-disclosure');
  const setup = button('Load live Qloo evidence', () => options.onStartLiveSetup?.(), 'button button-secondary');
  const retry = button('Check AI availability', () => { void checkHealth(); }, 'text-button');
  liveFields.append(connectionText, liveContext, setup, retry);
  const actions = el('div', 'ai-run-actions');
  const start = button('Replay saved demo', () => { void run(); }, 'button button-primary');
  const stop = button('Stop', cancelRun, 'button button-secondary');
  stop.hidden = true;
  actions.append(start, stop);
  const limits = el('details', 'ai-limits');
  limits.append(el('summary', '', 'Session limits'));
  const limitList = el('ul');
  for (const item of ['The daily allowance is set by the service: by default, 10 sessions in total and 3 per network address.', 'Up to 6 model turns, 8,000 output tokens and 90 seconds per session.', 'At most 6 web searches and 6 page reads per session.', 'Stopped or failed live sessions still use one daily session. Saved demos use none.']) limitList.append(el('li', '', item));
  limits.append(limitList);
  controls.append(scope, switcher, demoFields, liveFields, actions, limits);
  const workspace = el('div', 'ai-workspace');
  const activity = el('section', 'panel ai-activity');
  activity.setAttribute('aria-labelledby', 'ai-activity-title');
  const activityHead = el('header', 'ai-panel-header');
  const activityTitle = el('h2', '', 'Research activity');
  activityTitle.id = 'ai-activity-title';
  const stateLabel = el('span', 'ai-state', 'Ready to replay');
  activityHead.append(activityTitle, stateLabel);
  const log = el('ol', 'ai-step-log');
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');
  log.setAttribute('aria-relevant', 'additions');
  log.setAttribute('aria-label', 'Public tool activity');
  const logPlaceholder = el('div', 'ai-empty-log');
  logPlaceholder.append(el('p', '', 'A source-led shortlist, one visible step at a time.'), el('p', 'muted', 'The agent reads evidence. The checker calculates feasibility. You decide which proposals enter the comparison.'));
  const error = el('p', 'ai-error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  activity.append(activityHead, logPlaceholder, log, error);
  const findings = el('section', 'ai-findings');
  findings.setAttribute('aria-label', 'Research proposals');
  const resultArea = el('div', 'ai-result-area');
  workspace.append(activity, findings, resultArea);
  layout.append(controls, workspace);
  element.append(hero, layout);

  function showError(value: unknown): void {
    if (disposed) return;
    error.textContent = value instanceof ApiError
      ? `${value.message}${value.retryAfterSeconds === undefined ? '' : ` Retry after ${value.retryAfterSeconds} seconds.`}`
      : value instanceof Error && value.name !== 'AbortError'
        ? 'This proposal could not be accepted. The comparison is unchanged; review the current route and try again.'
        : 'Research stopped. No new proposal was added to comparison.';
    error.hidden = false;
  }
  function clearError(): void { error.hidden = true; error.textContent = ''; }
  function refresh(): void {
    if (disposed) return;
    const current = options.getCurrentResult();
    const lost = cancelledShow(current);
    scopeName.textContent = mode === 'demo' && current.mode !== 'demo'
      ? 'Saved synthetic Germany tour' : current.artists.target.name ?? 'Artist name UNKNOWN';
    scopeDate.textContent = `${current.audit.replay.scenario.tour.region} · ${formatDate(lost.schedule.startsAt, true)} · ${lost.schedule.startsAt.timeZone}`;
    const fixture = AI_DEMO_SCENARIOS.find(row => row.id === selectedDemo)!;
    demoDescription.textContent = fixture.description;
    demoFields.hidden = mode !== 'demo';
    liveFields.hidden = mode !== 'live';
    demoButton.setAttribute('aria-pressed', String(mode === 'demo'));
    liveButton.setAttribute('aria-pressed', String(mode === 'live'));
    demoButton.disabled = running;
    liveButton.disabled = running;
    demoSelect.disabled = running;
    const hasLiveBase = current.mode === 'live' && options.getLiveBaseRunId?.() !== undefined;
    connectionText.textContent = health === 'enabled' ? 'Claude Sonnet 5.5 research is available.'
      : health === 'checking' ? 'Checking AI availability…'
      : health === 'disabled' ? 'Live AI research is currently disabled. The saved demo remains available.'
      : health === 'failed' ? 'AI availability could not be checked.' : 'Check whether AI research is enabled.';
    liveContext.textContent = hasLiveBase
      ? 'Uses your live Qloo percentiles, the frozen road matrix and your current thresholds. Public web pages provide research leads; venue availability and fees remain UNKNOWN.'
      : current.mode === 'live' ? 'Refresh live Qloo evidence before starting another research session. Previously accepted cards remain in your comparison.'
        : 'Load a live Qloo result first. The agent must use your resolved artist evidence rather than the synthetic demo.';
    setup.hidden = hasLiveBase || options.onStartLiveSetup === undefined;
    setup.disabled = running;
    retry.hidden = health === 'enabled';
    retry.disabled = running || health === 'checking';
    start.textContent = running ? mode === 'demo' ? 'Replaying saved steps…' : 'Researching the region…'
      : mode === 'demo' ? 'Replay saved demo' : 'Start AI research';
    start.disabled = running || (mode === 'live' && (!hasLiveBase || health !== 'enabled'));
    stop.hidden = !running;
    if (session === undefined && !running) stateLabel.textContent = mode === 'demo' ? 'Ready to replay' : 'Ready for live research';
  }
  function setMode(next: 'demo' | 'live'): void {
    if (running || disposed) return;
    mode = next;
    clearError();
    refresh();
    if (mode === 'live' && health === 'unknown') void checkHealth();
  }
  async function checkHealth(): Promise<void> {
    if (disposed || running || health === 'checking') return;
    healthController?.abort();
    const controller = new AbortController();
    healthController = controller;
    health = 'checking';
    clearError();
    refresh();
    try {
      const result = await api.health(controller.signal);
      if (disposed || controller.signal.aborted) return;
      health = result.enabled ? 'enabled' : 'disabled';
    } catch (failure) {
      if (disposed || controller.signal.aborted) return;
      health = 'failed';
      showError(failure);
    } finally { refresh(); }
  }
  function addStep(step: AiStep): void {
    logPlaceholder.hidden = true;
    const row = el('li', `ai-step ai-step-${step.type}`);
    const marker = el('span', 'ai-step-number', String(step.sequence).padStart(2, '0'));
    const body = el('div', 'ai-step-body');
    const label = step.type === 'tool' ? 'TOOL' : step.type.toUpperCase();
    body.append(el('span', 'ai-step-label', step.toolName ? `${label} · ${step.toolName.replaceAll('_', ' ')}` : label), el('p', '', step.message));
    const time = el('time', 'ai-step-time');
    time.dateTime = step.at;
    time.textContent = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'UTC' }).format(new Date(step.at));
    time.title = `${step.at} (UTC${mode === 'demo' ? ', saved transcript' : ''})`;
    row.append(marker, body, time);
    log.append(row);
  }
  function sourceLink(source: AiSource): HTMLElement {
    const row = el('div', 'ai-source');
    const url = safeAiSourceUrl(source.url);
    if (url) {
      const link = el('a', '', source.title);
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      row.append(link);
    } else row.append(el('strong', '', source.title));
    const meta = el('small', '', `${source.kind === 'synthetic' ? 'Synthetic reference' : new URL(source.url).hostname} · ${source.kind === 'web-fetch' ? 'Page read' : source.kind === 'web-search' ? 'Search result' : 'Saved fixture'}`);
    meta.title = `${source.kind === 'synthetic' ? 'Fixture evaluated' : 'Retrieved'}: ${source.retrievedAt}`;
    row.append(meta);
    return row;
  }
  function renderSession(result: AiSessionResult): void {
    findings.replaceChildren();
    resultArea.replaceChildren();
    const head = el('header', 'ai-findings-heading');
    head.append(el('h2', '', `${result.proposals.length} checked ${result.proposals.length === 1 ? 'proposal' : 'proposals'}`), el('span', 'ai-count-label', 'ACCEPTANCE REQUIRED'));
    findings.append(head, el('p', 'ai-findings-note', 'Accepting a proposal replaces its A or B card and recalculates the comparison and breakpoints. Four locked shows and the day-off option stay fixed.'));
    if (result.mode === 'demo' && options.getCurrentResult().mode === 'live') findings.append(el('p', 'ai-mode-disclosure', 'Accepting this saved demo switches the comparison to its labelled synthetic scenario.'));
    if (result.proposals.length < 2 || result.stopReason !== 'completed') findings.append(el('p', 'ai-mode-disclosure', 'The session did not complete a two-to-four-proposal shortlist. Review the activity and try again; no partial shortlist can be accepted.'));
    const grid = el('div', 'ai-proposal-grid');
    for (const proposal of result.proposals) {
      const card = el('article', 'panel ai-proposal-card');
      card.dataset.proposalId = proposal.draft.id;
      const city = result.baseResult.audit.replay.scenario.cities.find(row => row.id === proposal.draft.cityId)?.name ?? 'UNKNOWN';
      const heading = el('div', 'ai-proposal-heading');
      const identity = el('div');
      identity.append(el('p', 'eyebrow', proposal.draft.kind === 'replacement' ? 'OPTION A · REPLACEMENT' : 'OPTION B · DETOUR'), el('h3', '', city), el('p', 'ai-venue', proposal.draft.venueName));
      heading.append(identity, badge(proposal.status));
      const metrics = el('dl', 'ai-proposal-metrics');
      for (const [label, value] of [
        ['Fit index', knowledgeText(proposal.option.fit, formatFit)],
        ['Extra distance', knowledgeText(proposal.option.additionalDistanceMetres, amount => formatDistance(amount, true))],
        ['Extra driving', knowledgeText(proposal.option.additionalDrivingSeconds, amount => formatDuration(amount, true))],
      ]) {
        const metric = el('div');
        metric.append(el('dt', '', label), el('dd', '', value));
        metrics.append(metric);
      }
      card.append(heading, el('p', 'ai-proposal-reason', proposal.draft.reason), metrics);
      const checks = el('div', 'ai-proposal-check-summary');
      const venue = el('span');
      venue.append(el('span', '', 'Venue evidence '), badge(proposal.option.venueStatus));
      const road = el('span');
      road.append(el('span', '', 'Route checks '), badge(proposal.option.routingStatus));
      checks.append(road, venue);
      card.append(checks);
      const checkDetails = el('details', 'ai-check-details');
      checkDetails.append(el('summary', '', 'Inspect deterministic checks'));
      const checkList = el('ul');
      const preferences = proposal.audit.analysis.decision.options.find(row => row.optionId === proposal.option.id)?.checks ?? [];
      const unique = new Map([...proposal.option.checks, ...preferences].map(check => [check.id, check]));
      for (const check of unique.values()) {
        const row = el('li');
        row.append(badge(check.status), el('span', '', check.message));
        checkList.append(row);
      }
      checkDetails.append(checkList);
      card.append(checkDetails);
      const evidence = el('div', 'ai-proposal-evidence');
      evidence.append(el('h4', '', 'Evidence to inspect'));
      for (const sourceId of proposal.draft.sourceIds) {
        const source = result.sources.find(row => row.id === sourceId);
        if (source) evidence.append(sourceLink(source));
      }
      if (proposal.draft.sourceIds.length === 0) evidence.append(el('p', 'muted', 'UNKNOWN - no source was returned.'));
      card.append(evidence);
      if (proposal.draft.risks.length > 0) {
        const risks = el('details', 'ai-risk-details');
        risks.append(el('summary', '', `${proposal.draft.risks.length} ${proposal.draft.risks.length === 1 ? 'risk' : 'risks'} to resolve`));
        const list = el('ul');
        for (const risk of proposal.draft.risks) list.append(el('li', '', risk));
        risks.append(list);
        card.append(risks);
      }
      const accept = button('Accept into comparison', () => { void acceptProposal(result, proposal, accept); }, 'button button-primary');
      const already = accepted.get(proposal.draft.kind) === proposal.draft.id;
      accept.disabled = result.proposals.length < 2 || result.stopReason !== 'completed' || already;
      if (already) accept.textContent = 'Added to comparison';
      accept.setAttribute('aria-label', `${already ? 'Added to' : 'Accept into'} comparison: ${city}, ${proposal.draft.venueName}`);
      card.append(el('p', 'ai-accept-note', `${proposal.status} describes the declared checks. Acceptance adds an investigation candidate; it does not book a show.`), accept);
      grid.append(card);
    }
    findings.append(grid);
    const summary = el('section', 'panel ai-session-summary');
    const identity = el('div');
    identity.append(el('h2', '', 'Research record'), el('p', 'muted', result.mode === 'demo'
      ? 'Saved synthetic transcript. No model, search or page-read usage.' : `${result.model} · ${result.usage.modelCalls}/6 model turns · ${result.usage.outputTokens.toLocaleString('en-GB')}/8,000 output tokens`));
    if (result.mode === 'live') identity.append(el('p', 'muted', `${result.usage.inputTokens.toLocaleString('en-GB')} observed input tokens · ${result.usage.webSearchCalls}/6 searches · ${result.usage.webFetchCalls}/6 page reads`));
    summary.append(identity, button('Download research JSON', () => downloadJson(result, `tour-rescue-ai-${result.sessionId.replace(/[^a-z0-9_-]/gi, '-')}.json`), 'button button-secondary'));
    resultArea.append(summary);
    if (result.warnings.length) {
      const warningList = el('ul', 'ai-warnings');
      for (const warning of result.warnings) warningList.append(el('li', '', warning));
      resultArea.append(warningList);
    }
    stateLabel.textContent = stopLabels[result.stopReason];
  }
  async function acceptProposal(result: AiSessionResult, proposal: AiValidatedProposal, control: HTMLButtonElement): Promise<void> {
    if (disposed || running || result.proposals.length < 2 || result.stopReason !== 'completed') return;
    clearError();
    control.disabled = true;
    try {
      await options.onAccept(result, proposal);
      if (disposed) return;
      accepted.set(proposal.draft.kind, proposal.draft.id);
      renderSession(result);
      refresh();
      announce('Proposal added to comparison. All deterministic checks and breakpoints have been recalculated.');
    } catch (failure) { showError(failure); control.disabled = false; }
  }
  function cancelRun(): void {
    if (!running) return;
    generation += 1;
    runController?.abort();
    running = false;
    stateLabel.textContent = 'Research stopped';
    showError(new DOMException('Stopped', 'AbortError'));
    refresh();
    stateLabel.textContent = 'Research stopped';
  }
  async function waitForReplay(signal: AbortSignal): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const abort = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 140);
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    });
  }
  async function run(): Promise<void> {
    if (disposed || running) return;
    const current = options.getCurrentResult();
    const baseRunId = options.getLiveBaseRunId?.();
    if (mode === 'live' && (current.mode !== 'live' || baseRunId === undefined || health !== 'enabled')) return;
    const controller = new AbortController();
    runController = controller;
    const runGeneration = ++generation;
    const active = () => !disposed && generation === runGeneration && !controller.signal.aborted;
    running = true;
    session = undefined;
    accepted.clear();
    log.replaceChildren();
    logPlaceholder.hidden = false;
    findings.replaceChildren();
    resultArea.replaceChildren();
    clearError();
    stateLabel.textContent = mode === 'demo' ? 'Replaying saved transcript' : 'Investigating';
    refresh();
    try {
      let result: AiSessionResult;
      if (mode === 'demo') {
        result = createAiDemoSession(selectedDemo);
        for (const step of result.steps) {
          await waitForReplay(controller.signal);
          if (!active()) return;
          addStep(step);
        }
      } else {
        const budget = current.audit.replay.scenario.tour.constraints.additionalBudget;
        result = await api.rescue({ baseRunId: baseRunId!, policy: current.audit.replay.policy,
          ...(budget.status === 'known' ? { additionalBudgetMinorUnits: budget.value.minorUnits } : {}) }, current, event => {
          if (active() && event.type === 'step') addStep(event.step);
        }, controller.signal);
      }
      if (!active()) return;
      session = result;
      renderSession(result);
      announce(`${stopLabels[result.stopReason]}. ${result.proposals.length} proposals checked. Choose a proposal to add it to comparison.`);
    } catch (failure) {
      if (!active()) return;
      showError(failure);
      stateLabel.textContent = 'Research unavailable';
    } finally {
      if (active()) { running = false; refresh(); if (session === undefined) stateLabel.textContent = 'Research unavailable'; }
    }
  }
  demoSelect.addEventListener('change', () => {
    const next = AI_DEMO_SCENARIOS.find(row => row.id === demoSelect.value);
    if (next && !running) { selectedDemo = next.id; refresh(); }
  });
  refresh();
  return { element, refresh, dispose: () => {
    if (disposed) return;
    disposed = true;
    generation += 1;
    runController?.abort();
    healthController?.abort();
  } };
}
