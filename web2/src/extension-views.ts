import { SAMPLE_ECONOMICS, SAMPLE_SUPPLIERS, evaluateEconomics, selectedSupplier } from './extension-state.ts';
import type { SosSampleState, PlanSummary } from './extension-state.ts';
import type { AiSessionResult, AiStep } from '../../src/ai/types.ts';

export type ExtensionScreen =
  | 'route' | 'sos-problem' | 'sos-options' | 'sos-quote' | 'sos-approved'
  | 'plan' | 'plan-preview' | 'economics' | 'economics-terms' | 'fan' | 'ai';

export function isExtensionScreen(screen: string): screen is ExtensionScreen {
  return ['route','sos-problem','sos-options','sos-quote','sos-approved','plan','plan-preview',
    'economics','economics-terms','fan','ai'].includes(screen);
}
export interface ExtensionContext {
  readonly tabs: string;
  readonly sos: SosSampleState;
  readonly planBrief: string;
  readonly planSummary: PlanSummary | null;
  readonly showAssumptions: boolean;
  readonly fanPreviewed: boolean;
  readonly aiBusy: boolean;
  readonly aiNotice: string;
  readonly aiMode: 'demo' | 'live';
  readonly aiSteps: readonly AiStep[];
  readonly aiSession: AiSessionResult | null;
  readonly sourceMode: 'demo' | 'live';
}
const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char] ?? char);
const action = (title: string, key: string, main = false, disabled = false) =>
  '<button type="button" data-action="' + esc(key) + '" class="' + (main ? 'primary-button' : 'text-button') + '"' +
  (disabled ? ' disabled' : '') + '>' + esc(title) + '</button>';
const sample = (text: string) => '<p class="tiny-label extension-sample">ⓘ ' + esc(text) + '</p>';
const frame = (content: string, backText: string, withSos = true) =>
  '<section class="mobile-view rescue-view extension-view"><header class="mobile-header">' +
  '<button type="button" class="back-button" data-action="back" aria-label="Go back">← <span>' + esc(backText) + '</span></button>' +
  (withSos ? '<button type="button" class="sos-button" data-action="sos">SOS</button>' : '') +
  '</header>' + content + '</section>';
const money = (value: number) => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 }).format(value) + ' VND';
const eur = (value: number) => (value < 0 ? '−€' + Math.abs(value) : '+€' + value);

function routeHub(ctx: ExtensionContext): string {
  return '<section class="mobile-view home-view extension-view"><header class="mobile-header">' +
    '<div class="wordmark"><span class="turn-arrow">↱</span> TOUR RESCUE</div>' +
    '<button type="button" class="sos-button" data-action="sos">SOS</button></header>' +
    '<div class="intro"><p class="eyebrow">Northbound · sample workspace</p><h1>Your route.</h1>' +
    '<p class="muted">Rescue this cancellation or explore what comes next.</p></div>' +
    '<div class="extension-lead"><p class="overline danger-text">! NEEDS A DECISION</p>' +
    '<h2>Leipzig canceled.</h2><p>Options are evaluated by the existing Qloo / OSRM core.</p>' +
    action('Rescue this date →','rescue',true) + '</div>' +
    '<div class="extension-links">' +
    '<button data-action="open-sim" type="button">Test a replacement route <span>What-if simulation →</span></button>' +
    '<button data-action="concept-audience" type="button">Find your audience <span>Relative fit / fan requests →</span></button>' +
    '<button data-action="open-plan" type="button">Build a draft route <span>Sample planner →</span></button>' +
    '<button data-action="open-economics" type="button">Can this date pay off? <span>Sample economics →</span></button>' +
    '<button data-action="open-fan" type="button">Invite fan interest <span>Public concept →</span></button>' +
    '<button data-action="open-ai" type="button">Rescue with AI <span>Saved transcript / live research →</span></button>' +
    '</div>' + sample('Planning, economics and fans are sample extensions; bookings and sales are not connected.') +
    ctx.tabs + '</section>';
}
function sosProblem(ctx: ExtensionContext): string {
  return frame('<div class="intro"><p class="eyebrow">LOCAL SOS · SAMPLE INCIDENT</p><h1>What went wrong?</h1></div>' +
    '<label for="sos-problem">What do you need?</label>' +
    '<textarea id="sos-problem" rows="5" maxlength="700">' + esc(ctx.sos.problem) + '</textarea>' +
    '<div class="extension-fieldrow"><label for="sos-location">Where</label>' +
    '<input id="sos-location" maxlength="120" value="' + esc(ctx.sos.location) + '"></div>' +
    '<div class="extension-fieldrow"><label for="sos-deadline">Needed by · venue local time</label>' +
    '<input id="sos-deadline" maxlength="120" value="' + esc(ctx.sos.requiredLocal) + '"></div>' +
    '<div class="extension-fieldrow"><label for="sos-budget">Budget cap · VND</label>' +
    '<input type="number" inputmode="numeric" min="1" max="100000000" step="1" id="sos-budget" value="' + ctx.sos.budgetCapVnd + '"></div>' +
    '<div class="focused-bottom">' +
    action('Find sample local options →','sos-find',true) +
    sample('Illustrative incident. No provider search or contact takes place.') + '</div>', 'Tour SOS');
}
function sosOptions(ctx: ExtensionContext): string {
  return frame('<div class="intro"><p class="eyebrow">' + esc(ctx.sos.location) + ' · SAMPLE</p>' +
    '<h1>Two local options.</h1><p class="muted">A head, fitting and delivery.</p></div>' +
    '<div class="extension-choices" role="radiogroup" aria-label="Illustrative local suppliers">' +
    SAMPLE_SUPPLIERS.map(provider => '<button type="button" role="radio" aria-checked="' +
      (provider.id === ctx.sos.selectedId) + '" data-action="sos-select" data-id="' + provider.id +
      '" tabindex="' + (provider.id === ctx.sos.selectedId ? '0' : '-1') + '" class="option-row' +
      (provider.id === ctx.sos.selectedId ? ' selected' : '') + '">' +
      '<div class="option-heading"><strong>⚒ ' + esc(provider.name) + '</strong><span class="fake-radio"></span></div>' +
      '<div class="option-reason">' + (provider.id === 'minh-backline' ? 'Crew reference · sample only' : 'Sample supplier') + '</div>' +
      '<div class="drive-line">' + esc(money(provider.estimateVnd)) + ' · Travel ~' + provider.travelMinutes + ' min</div>' +
      '<div class="tiny-label">? Stock, fee and arrival unverified</div></button>').join('') + '</div>' +
    '<div class="focused-bottom">' + action('Review sample quote →','sos-quote',true) +
    action('I’ll call myself', 'sos-self-call') +
    sample('Supplier names, prices and travel times are fictional estimates. No quote has been requested.') +
    '</div>', 'SOS');
}
function sosQuote(ctx: ExtensionContext): string {
  const supplier = selectedSupplier(ctx.sos);
  const within = supplier.estimateVnd <= ctx.sos.budgetCapVnd;
  return frame('<div class="intro"><p class="eyebrow">ILLUSTRATIVE QUOTE · NOT RECEIVED</p>' +
    '<h1>Ready to review.</h1><p class="muted">' + esc(supplier.name) + ' · sample, uncontacted supplier</p></div>' +
    '<div class="extension-facts"><div><span>Solution</span><strong>22-inch head + fitting</strong></div>' +
    '<div><span>Estimated arrival</span><strong>Today, 15:40 · ICT</strong>' +
    '<small>Sample only - no arrival confirmed</small></div></div>' +
    '<div class="quote-amount">' + esc(money(supplier.estimateVnd)) + '</div>' +
    '<p class="muted">Illustrative total including delivery; not a real supplier offer.</p>' +
    '<p class="soft-status">' + (within ? '✓ Within' : '× Exceeds') + ' your ' + esc(money(ctx.sos.budgetCapVnd)) + ' budget cap.</p>' +
    '<div class="focused-bottom">' +
    action('Preview sample spend approval →', 'sos-approve', true, !within) +
    sample('Nothing will be booked, paid or sent. This is an offline approval simulation.') +
    '</div>', 'Your solution');
}
function sosApproved(ctx: ExtensionContext): string {
  return frame('<div class="intro"><p class="eyebrow">SAMPLE APPROVAL PREVIEW</p>' +
    '<h1>Approval simulated.</h1><p>' + esc(selectedSupplier(ctx.sos).name) + ' · ' +
    esc(money(selectedSupplier(ctx.sos).estimateVnd)) + '</p></div>' +
    '<div class="extension-callout"><strong>ⓘ Not ordered.</strong>' +
    '<p>No supplier was contacted, no quote was obtained and no money was committed. Live fulfilment is not implemented.</p></div>' +
    '<div class="focused-bottom">' + action('Start another sample incident →','sos-restart',true) + '</div>', 'Sample result');
}
function plan(ctx: ExtensionContext): string {
  return frame('<div class="intro"><p class="eyebrow">NORTHBOUND · SAMPLE PLANNER</p>' +
    '<h1>Let’s build a route.</h1><p class="muted">Describe your next tour in your own words.</p></div>' +
    '<label for="plan-brief">Your tour brief</label><textarea id="plan-brief" rows="7" maxlength="5000">' + esc(ctx.planBrief) + '</textarea>' +
    '<div class="extension-fieldrow"><strong>Your touring rules</strong>' +
    '<p class="muted">No night drives · Club shows</p>' +
    '<button type="button" class="text-button" data-action="concept-profile">Edit band profile →</button></div>' +
    '<div class="focused-bottom">' + action('Build a sample draft route →', 'plan-build',true) +
    sample('Dates, venues, routes and availability will still need confirmation. No existing tour is changed.') +
    '</div>', 'Route planning');
}
function planPreview(ctx: ExtensionContext): string {
  const p = ctx.planSummary;
  if (!p) return plan(ctx);
  return frame('<div class="intro"><p class="eyebrow">DRAFT · NOT ROUTE-VALIDATED</p>' +
    '<h1>A starting point.</h1><p class="muted">The brief has been summarised. City/date selection and road checks have not been run.</p></div>' +
    '<div class="extension-facts"><div><span>Proposed show slots</span><strong>' + (p.showCount ?? 'Unknown / To confirm') + '</strong></div>' +
    '<div><span>Countries</span><strong>' + esc(p.region) + '</strong></div>' +
    '<div><span>Daily driving rule</span><strong>' + (p.drivingHourCap === null ? 'Unknown / To confirm' : p.drivingHourCap + 'h maximum') + '</strong></div>' +
    '<div><span>Club capacity</span><strong>' + esc(p.venuePeople) + '</strong></div></div>' +
    '<p class="muted">No Mondays: ' + (p.avoidMondays ? 'requested' : 'not specified') + ' · All bookings unknown.</p>' +
    '<section class="draft-risks" aria-label="Unverified route and weak links">' +
    '<h2>Draft corridor · not checked</h2><ol class="draft-corridor">' +
    p.itinerary.map(stage => '<li><strong>' + esc(stage) + '</strong><span>? To confirm</span></li>').join('') +
    '</ol><h2>Weak links</h2><ul class="weak-links">' +
    ['? Venues and room availability unknown', '? Dates and schedule windows unconfirmed',
      '? ' + (p.avoidMondays ? 'No-Mondays rule not yet validated' : 'Show-day restrictions not yet confirmed'),
      '? Driving times, border transfer and road feasibility not checked'].map(item =>
        '<li>' + esc(item) + '</li>').join('') + '</ul></section>' +
    '<div class="focused-bottom">' + action('Review sample economics →','open-economics',true) +
    sample('Sample outline only. Not an actual route, AI-generated booking, or OSRM validation.') + '</div>', 'Planning');
}
function economics(ctx: ExtensionContext): string {
  const calc = evaluateEconomics(SAMPLE_ECONOMICS);
  return frame('<div class="intro"><p class="eyebrow">SAMPLE ECONOMICS · USER ASSUMPTIONS</p>' +
    '<h1>' + esc(calc.verdict) + '.</h1><p class="muted">This date needs better terms.</p></div>' +
    '<div class="economics-result"><p class="muted">Estimated show result</p><strong>' +
    esc(eur(calc.lowEur)) + ' to ' + esc(eur(calc.highEur)) + '</strong></div>' +
    '<div class="extension-facts"><div><span>Attendance assumption</span><strong>' +
    SAMPLE_ECONOMICS.minAttendance + '–' + SAMPLE_ECONOMICS.maxAttendance + '</strong></div>' +
    '<div><span>Break-even</span><strong>' + calc.breakEvenTickets + ' tickets</strong></div></div>' +
    '<p class="tiny-label">ⓘ Your assumptions, not a sales forecast. Qloo provides no ticket estimates.</p>' +
    action(ctx.showAssumptions ? 'Hide assumptions & costs ↑' : 'View assumptions & costs →','econ-toggle') +
    (ctx.showAssumptions ? '<div class="extension-facts"><div><span>Ticket price</span><strong>€' +
    SAMPLE_ECONOMICS.ticketPriceEur + '</strong></div><div><span>Artist share</span><strong>' +
    Math.round(SAMPLE_ECONOMICS.artistShare*100) + '%</strong></div><div><span>Fixed costs</span><strong>€' +
    SAMPLE_ECONOMICS.fixedCostsEur.toLocaleString('en-GB') + '</strong></div></div>' : '') +
    '<div class="focused-bottom">' + action('Review the terms →','econ-terms',true) +
    sample('Illustrative figures only · no fees or booking data were retrieved.') + '</div>', 'Route economics');
}
function economicsTerms(): string {
  return frame('<div class="intro"><p class="eyebrow">SAMPLE DEAL REVIEW</p><h1>Ask for better terms.</h1>' +
    '<p class="muted">Before approaching a promoter, confirm the inputs behind your break-even number.</p></div>' +
    '<div class="extension-facts"><div><span>Ticket split</span><strong>70% artist share · sample assumption</strong></div>' +
    '<div><span>Show costs</span><strong>€2,100 · assumption, not an invoice</strong></div>' +
    '<div><span>Next action</span><strong>Request a real fee, capacity and settlement proposal</strong></div></div>' +
    '<div class="focused-bottom">' + action('Copy terms checklist →','econ-copy',true) +
    sample('No promoter was contacted; nothing was negotiated.') + '</div>', 'Economics');
}
function fan(ctx: ExtensionContext): string {
  const artwork = '<svg class="fan-art" viewBox="0 0 520 220" role="img" aria-label="Illustrative stage silhouettes, not a real band photograph">' +
    '<rect width="520" height="220" fill="#1C2831"/>' +
    '<path d="M0 108L105 80L230 99L371 68L520 91V220H0Z" fill="#283841"/>' +
    '<g fill="#121A20"><circle cx="100" cy="105" r="21"/><path d="M70 127h60l17 93H54z"/>' +
    '<circle cx="181" cy="100" r="19"/><path d="M151 119h59l10 101h-80z"/>' +
    '<circle cx="263" cy="93" r="22"/><path d="M227 120h73l15 100H207z"/>' +
    '<circle cx="355" cy="106" r="18"/><path d="M325 124h60l11 96h-84z"/>' +
    '<circle cx="441" cy="102" r="20"/><path d="M406 122h69l15 98h-98z"/></g>' +
    '<path d="M10 200L115 21M510 200L400 21" stroke="#F3B65B" stroke-width="5" opacity=".58"/>' +
    '</svg>';
  return '<section class="mobile-view extension-view fan-page"><header class="mobile-header">' +
    '<div class="wordmark"><span class="turn-arrow">↱</span> TOUR RESCUE</div></header>' +
    '<p class="eyebrow">Sample artist page</p>' + artwork +
    '<div class="intro"><h1>Bring Northbound<br>to Gdańsk.</h1>' +
    '<p class="muted">Tell the band you’d come to a show here.</p></div>' +
    '<label for="fan-email">Email for updates · optional</label>' +
    '<input id="fan-email" type="email" autocomplete="off" placeholder="you@example.com">' +
    '<div class="focused-bottom">' + action('I’d come to this show','fan-preview',true) +
    (ctx.fanPreviewed ? '<p role="status" class="soft-status">ⓘ Demo only - your interest was not recorded and your email was not saved.</p>' : '') +
    '<p class="muted">Interest only. This does not reserve a ticket.</p>' +
    sample('Illustrative band artwork · No mailing list, tracking or ticketing backend.') +
    action('Back to tour preview →','close-fan') + '</div></section>';
}
function ai(ctx: ExtensionContext): string {
  const modeMessage = ctx.aiMode === 'demo'
    ? 'Saved, authored research transcript. No Claude, Qloo or web request is made.'
    : ctx.sourceMode === 'live'
      ? 'Live Qloo evidence will be used with the Worker. No message or booking is sent.'
      : 'ⓘ Unavailable - run fresh Qloo first to enable genuine agent research.';
  return frame('<div class="intro"><p class="eyebrow">AGENT HOOK · RESCUE RESEARCH</p>' +
    '<h1>Research the gap.</h1><p class="muted">' + esc(modeMessage) + '</p></div>' +
    '<div class="extension-facts"><div><span>Research mode</span><strong>' + (ctx.aiMode === 'demo' ? 'Saved synthetic transcript' : 'Live Claude via Worker') + '</strong></div></div>' +
    '<div class="extension-links compact">' +
    '<button type="button" data-action="ai-mode-demo"' + (ctx.aiBusy ? ' disabled' : '') + '>Saved demo <span>' + (ctx.aiMode==='demo'?'Selected':'Use synthetic data →') + '</span></button>' +
    '<button type="button" data-action="ai-mode-live"' + (ctx.aiBusy ? ' disabled' : '') + '>Live research <span>' + (ctx.aiMode==='live'?'Selected':'Requires live Qloo →') + '</span></button></div>' +
    (ctx.aiBusy ? '<p class="muted">Research in progress; checked results will appear when complete.</p>' : '') +
    '<p role="status" class="live-notice">' + esc(ctx.aiNotice) + '</p>' +
    (ctx.aiSession ? '<div class="agent-results"><h2>Checked research leads</h2>' +
      '<p class="tiny-label">' + (ctx.aiSession.mode==='demo'?'Synthetic authored transcript':'Live research') +
      ' · Stop reason: ' + esc(ctx.aiSession.stopReason) + '</p>' +
      ctx.aiSession.proposals.map(proposal => '<div class="agent-proposal"><strong>' +
        esc(proposal.draft.venueName) + '</strong><span class="status status-' + (proposal.status==='FAIL'?'danger':proposal.status==='PASS'?'good':'unknown') +
        '">' + (proposal.status==='FAIL'?'×':proposal.status==='PASS'?'✓':'?') + ' ' + esc(proposal.status) + '</span>' +
        '<p>' + esc(proposal.draft.reason) + '</p><p class="tiny-label">Proposed lead · not an accepted show or booking</p></div>').join('') +
      '<details><summary>Research steps & sources</summary><ul>' +
      ctx.aiSteps.slice(-20).map(step => '<li>' + esc(step.message) + '</li>').join('') + '</ul><ul>' +
      ctx.aiSession.sources.map(source => '<li><a target="_blank" rel="noreferrer noopener" href="' + esc(source.url) +
      '">' + esc(source.title) + '</a> · ' + esc(source.provenance) + '</li>').join('') + '</ul></details>' +
      '</div>' : '') +
    '<div class="focused-bottom">' +
    action(ctx.aiMode==='demo' ? 'Replay saved agent transcript →' : 'Start live AI research →',
      ctx.aiMode==='demo'?'ai-replay':'ai-run-live',true,ctx.aiBusy || (ctx.aiMode==='live' && ctx.sourceMode!=='live')) +
    (ctx.aiBusy ? action('Stop research (session may still count) →','ai-stop') : '') +
    (ctx.aiMode==='live' && ctx.sourceMode!=='live' ? action('Load Qloo artist evidence →','open-live') : '') +
    sample('Agent leads are independently validated. This preview never silently replaces the current comparison, sends mail or books a venue.') +
    '</div>', 'Route');
}
export function renderExtension(screen: ExtensionScreen, ctx: ExtensionContext): string {
  switch(screen) {
    case 'route': return routeHub(ctx);
    case 'sos-problem': return sosProblem(ctx);
    case 'sos-options': return sosOptions(ctx);
    case 'sos-quote': return sosQuote(ctx);
    case 'sos-approved': return sosApproved(ctx);
    case 'plan': return plan(ctx);
    case 'plan-preview': return planPreview(ctx);
    case 'economics': return economics(ctx);
    case 'economics-terms': return economicsTerms();
    case 'fan': return fan(ctx);
    case 'ai': return ai(ctx);
  }
}
