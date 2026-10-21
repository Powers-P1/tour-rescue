import './styles.css';
import { createDemoResult, createApiClient } from '../../web/src/data.ts';
import type { ApiDecisionResult, ArtistChoice, LiveSelection } from '../../web/src/data.ts';
import { buildPromoterModel } from '../../web/src/promoter-model.ts';
import type { PromoterSheetModel } from '../../web/src/promoter-model.ts';
import { initialIncident, isFocusedRescue, transitionIncident } from './state.ts';
import type { IncidentState } from './state.ts';
import { projectRescue, UNKNOWN } from './model.ts';
import type { RescueOption, RescueProjection } from './model.ts';

declare const __WORKER_ORIGIN__: string;

type Screen = 'today' | 'options' | 'detail' | 'draft' | 'crew' | 'not-built';
type ArtistRole = 'target' | 'comparison' | 'control';
const api = createApiClient(__WORKER_ORIGIN__);
const root = document.getElementById('app');
const printRoot = document.getElementById('print-area');
if (!root || !printRoot) throw new Error('The application root is missing.');

let result: ApiDecisionResult = createDemoResult();
let projection: RescueProjection = projectRescue(result);
let incident: IncidentState = initialIncident();
let screen: Screen = 'today';
let pendingId: string = projection.options.find(option => option.recommended)?.id ?? projection.options[0]?.id ?? '';
let showEvidence = false;
let liveOpen = false;
let liveBusy = false;
let liveRole: ArtistRole = 'target';
let liveChoices: readonly ArtistChoice[] = [];
let liveNotice = '';
let liveTarget: ArtistChoice | null = null;
let liveControl: ArtistChoice | null = null;
let liveComparisons: ArtistChoice[] = [];
let showSOS = false;
let notice = '';
let proposalContact = '';
let proposalMessage = '';
let reviewingMessage = false;
let chosenProposal: PromoterSheetModel | null = null;
let unbuiltName = '';
const HTML = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

function optionById(id: string | null): RescueOption | undefined {
  return projection.options.find(option => option.id === id);
}
function currentOption(): RescueOption | undefined {
  return optionById(incident.chosenOptionId);
}
function badge(text: string, style = 'neutral'): string {
  return '<span class="status status-' + style + '">' + HTML(text) + '</span>';
}
function statusBadge(status: string): string {
  return badge(status === 'PASS' ? '✓ PASS' : status === 'FAIL' ? '× FAIL' : '? UNKNOWN',
    status === 'PASS' ? 'good' : status === 'FAIL' ? 'danger' : 'unknown');
}
function primary(label: string, action: string, disabled = false): string {
  return '<button class="primary-button" type="button" data-action="' + HTML(action) + '"' + (disabled ? ' disabled' : '') + '>' + HTML(label) + '</button>';
}
function softButton(label: string, action: string, extra = ''): string {
  return '<button class="text-button ' + extra + '" type="button" data-action="' + HTML(action) + '">' + HTML(label) + '</button>';
}
function header(focused: boolean, context = ''): string {
  return '<header class="mobile-header">' +
    (focused
      ? '<button type="button" class="back-button" data-action="back" aria-label="Go back">← <span>' + HTML(context || 'Back') + '</span></button>'
      : '<div class="wordmark"><span class="turn-arrow">↱</span> TOUR RESCUE</div>') +
    '<button class="sos-button" type="button" data-action="sos">SOS</button></header>';
}
function mobileTabs(): string {
  const active = screen === 'crew' ? 'Crew' : screen === 'options' ? 'Route' : 'Today';
  return '<nav class="mobile-tabs" aria-label="Main navigation">' +
    (['Today', 'Route', 'Crew'] as const).map(label =>
      '<button type="button" data-action="tab-' + label.toLowerCase() + '" class="' + (label === active ? 'active' : '') + '">' +
      '<span aria-hidden="true">' + (label === 'Today' ? '◫' : label === 'Route' ? '↝' : '☷') + '</span>' + label + '</button>').join('') +
    '</nav>';
}
function sidebar(): string {
  const nav: { label: string; action: string; selected: boolean }[] = [
    { label: 'Overview', action: 'tab-today', selected: screen === 'today' },
    { label: 'Route', action: 'tab-route', selected: ['options', 'detail', 'draft'].includes(screen) },
    { label: 'Audience', action: 'concept-audience', selected: screen === 'not-built' && unbuiltName === 'Audience' },
    { label: 'Crew', action: 'tab-crew', selected: screen === 'crew' },
    { label: 'Documents', action: 'documents', selected: screen === 'draft' },
  ];
  return '<aside class="sidebar" aria-label="Tour workspace">' +
    '<div class="wordmark brand-desktop"><span class="turn-arrow">↱</span> TOUR RESCUE</div>' +
    '<nav class="side-nav" aria-label="Desktop navigation">' +
    nav.map(item => '<button type="button" data-action="' + item.action + '"' + (item.selected ? ' class="active" aria-current="page"' : '') + '>' + HTML(item.label) + '</button>').join('') +
    '</nav><div class="side-spacer"></div>' +
    '<button class="sos-button wide-sos" type="button" data-action="sos">Tour SOS</button>' +
    '<div class="side-bottom"><strong>Northbound</strong><span>Sample workspace</span>' +
    '<button type="button" class="text-button" data-action="concept-agency">Agency view →</button></div></aside>';
}
function originNote(): string {
  return '<p class="source-note"><span class="status-icon">ⓘ</span> ' + HTML(projection.sourceMessage) + '</p>';
}
function homeMobile(): string {
  return '<section class="mobile-view home-view">' + header(false) +
    '<div class="intro"><p class="eyebrow">' + HTML(projection.title) + ' · ' + HTML(projection.fromCity) + '</p>' +
    '<h1>Here’s the plan.</h1></div>' +
    '<div class="incident-panel"><p class="overline danger-text">! NEEDS A DECISION</p>' +
    '<h2>' + HTML(projection.cancelledCity) + ' canceled.</h2>' +
    '<p class="muted">' + HTML(projection.cancelledDate) + ' · next stop ' + HTML(projection.toCity) + '</p>' +
    primary('Rescue this date →', 'rescue') + '</div>' +
    '<div class="next-up"><h2>Next up</h2><div class="next-time">16:00</div>' +
    '<h3>Load-in</h3><p class="muted">Sample crew note · ' + HTML(projection.fromCity) + '</p>' +
    softButton('Open today’s sheet →', 'tab-crew') + '</div>' +
    '<p class="tiny-label">Sample tour · venue and crew details unverified</p>' + mobileTabs() + '</section>';
}
function shortlist(): string {
  return '<section class="mobile-view rescue-view">' + header(true, projection.cancelledDate) +
    '<div class="intro"><h1>Three ways forward.</h1><p class="muted">' + HTML(projection.fromCity) + ' → replacement → ' + HTML(projection.toCity) + '</p></div>' +
    '<fieldset class="options-list"><legend class="sr-only">Choose a rescue option</legend>' +
    projection.options.map(option => {
      const selected = option.id === pendingId;
      return '<button type="button" role="radio" aria-checked="' + String(selected) + '" class="option-row' + (selected ? ' selected' : '') +
        '" data-action="select-option" data-id="' + HTML(option.id) + '">' +
        '<div class="option-heading"><strong>' + HTML(option.cityName) + '</strong>' +
        (option.recommended ? '<span class="suggested">Suggested by checks</span>' : '') +
        '<span class="fake-radio" aria-hidden="true"></span></div>' +
        '<div class="option-reason">' + HTML(option.reason) + '</div>' +
        '<div class="drive-line">' + (option.kind === 'day-off' ? 'No added show · locked dates retained' :
          HTML(option.inbound) + ' in <span class="middle-dot">·</span> ' + HTML(option.outbound) + ' onward') + '</div>' +
        '<div class="option-validation">' + statusBadge(option.decisionCheck) + '</div></button>';
    }).join('') + '</fieldset>' +
    '<div class="focused-bottom">' + primary('Review ' + (optionById(pendingId)?.cityName ?? 'option') + ' →', 'review') +
    '<p class="tiny-label">Source-labelled estimates · venue/date not confirmed</p>' +
    softButton('Run fresh Qloo evidence →', 'open-live', 'muted-button') + '</div></section>';
}
function details(): string {
  const option = currentOption();
  if (!option) return shortlist();
  return '<section class="mobile-view rescue-view">' + header(true, 'Options') +
    '<div class="intro"><h1>' + HTML(option.cityName) + '.</h1><p class="muted">' +
    (option.kind === 'day-off' ? 'Protect the next confirmed show.' : 'A direction to investigate, not a booking.') + '</p></div>' +
    '<div class="details-facts"><div><span>Travel</span><strong>' +
      (option.kind === 'day-off' ? 'No proposed show' : HTML(projection.fromCity + ' ' + option.inbound + ' · ' + projection.toCity + ' ' + option.outbound)) +
    '</strong></div><div><span>Audience fit</span><strong>' + HTML(option.relativeFit) + '</strong></div></div>' +
    '<div class="why-block"><h2>Why this option</h2><p>' + HTML(option.reason) + '</p>' +
    '<p class="soft-status">' + statusBadge(option.routeCheck) + ' Route check · declared daily limit ' + HTML(projection.limit) + '</p>' +
    '<p class="soft-status">' + statusBadge(option.decisionCheck) + ' Decision checks</p>' +
    (option.kind === 'day-off' ? '<p class="pending-venue">ⓘ No promoter or venue needed for a day off.</p>'
      : '<p class="pending-venue">◷ Venue and date still to confirm.</p>') + '</div>' +
    (showEvidence ? evidencePanel(option) : '') +
    '<div class="focused-bottom">' +
    (option.kind === 'day-off' ? primary('Download decision audit →', 'audit')
      : option.routeCheck === 'FAIL' || option.decisionCheck === 'FAIL'
        ? primary('Choose another direction →', 'back')
        : primary('Prepare promoter proposal →', 'prepare')) +
    softButton(showEvidence ? 'Hide evidence & assumptions ↑' : 'See evidence & assumptions →', 'toggle-evidence') +
    '<p class="tiny-label">' + HTML(projection.mode === 'live' ? 'Live Qloo fit · sample booking scenario · not ticket sales' : 'Sample scenario · affinity is not ticket sales') + '</p>' +
    '</div></section>';
}
function evidencePanel(option: RescueOption): string {
  return '<section class="evidence-panel" aria-label="Evidence and assumptions"><h2>Evidence & assumptions</h2>' +
    '<p class="muted">Source data, routing and decision checks stay separate.</p>' +
    '<ul>' + projection.evidence.map(item => '<li>' + HTML(item) + '</li>').join('') + '</ul>' +
    '<h3>Checks for ' + HTML(option.cityName) + '</h3><div class="check-list">' +
    option.checks.map(check => '<div class="check-row">' + statusBadge(check.status) +
      '<div><strong>' + HTML(check.id) + '</strong><p>' + HTML(check.message) + '</p></div></div>').join('') +
    '</div>' + softButton('Download full JSON audit ↓', 'audit') + '</section>';
}
function defaultMessage(sheet: PromoterSheetModel): string {
  return 'Subject: Proposed show - ' + sheet.artist + ' - ' + sheet.city + '\n\n' +
    'Hello,\n\nWe are exploring a replacement date for ' + sheet.artist + ' in ' + sheet.city + ' on ' +
    sheet.date + '. The current tour has a cancelled stop and we are checking suitable local opportunities.\n\n' +
    'Our initial reason to explore this city: cultural affinity and a conditional route review. ' +
    'This is not a confirmed show or a ticket-sales forecast.\n\n' +
    'To confirm: the venue, availability, capacity, fee, date, technical rider and promoter terms.\n\n' +
    'Would you be open to discussing a possible date?\n\nThank you.';
}
function sheetHtml(sheet: PromoterSheetModel): string {
  return '<article class="sheet-paper"><div class="sheet-head"><strong>↱ TOUR RESCUE</strong><span>DRAFT / NOT SENT</span></div>' +
    '<p class="overline">PROMOTER PROPOSAL · ' + HTML(sheet.modeLabel) + '</p>' +
    '<h1>' + HTML(sheet.artist) + ' - ' + HTML(sheet.city) + '</h1>' +
    '<p class="sheet-date">Proposed: ' + HTML(sheet.date) + ' · ' + HTML(sheet.timeZone) + '</p>' +
    '<p>' + HTML(sheet.provenanceNote) + '</p>' +
    '<div class="sheet-grid"><div><small>Route & constraints</small><strong>' + HTML(sheet.extraDriving) + ' added driving</strong><span>Max daily: ' + HTML(sheet.dailyDrivingLimit) + '</span></div>' +
    '<div><small>Qloo cultural affinity</small><strong>' + HTML(sheet.fit) + '</strong><span>' + HTML(sheet.fitNote) + '</span></div>' +
    '<div><small>Decision checks</small><strong>' + HTML(sheet.decisionStatus) + '</strong><span>' + HTML(sheet.recommendation) + '</span></div>' +
    '<div><small>Venue & contact</small><strong>Unknown / To confirm</strong><span>No outreach has been sent</span></div></div>' +
    '<h2>What still needs confirming</h2><ul>' +
    ['Date and venue availability', 'Room capacity and technical rider', 'Fee and promoter terms', 'Contact and acceptance'].map(x => '<li>' + HTML(x) + '</li>').join('') +
    '</ul><h2>Evidence & limitations</h2><p>' + HTML(sheet.sourceLines.join(' ')) + '</p>' +
    '<p>' + HTML(sheet.recommendationNote) + '</p>' +
    '<footer>Audit run: ' + HTML(sheet.runId) + ' · generated ' + HTML(sheet.generatedAt) +
    ' · This proposal is not an agreement, a booking or an email confirmation.</footer></article>';
}
function draft(): string {
  const sheet = chosenProposal;
  if (!sheet) return '<section class="mobile-view rescue-view">' + header(true, 'City') + '<p>Document not available.</p></section>';
  return '<section class="mobile-view rescue-view draft-view">' + header(true, 'Proposal') +
    '<p class="overline accent-text">DRAFT / NOT SENT</p>' +
    '<div class="intro"><h1>Ready to start a conversation.</h1><p class="muted">A one-page proposal is ready for human review.</p></div>' +
    '<div class="proposal-preview">' + sheetHtml(sheet) + '</div>' +
    '<div class="contact-area"><label for="promoter-contact">Promoter contact <span class="muted">(optional draft field)</span></label>' +
    '<input id="promoter-contact" type="email" autocomplete="off" placeholder="Unknown / To confirm" value="' + HTML(proposalContact) + '">' +
    '<p class="tiny-label">Choosing a city has not confirmed a venue or contacted anyone.</p></div>' +
    (reviewingMessage ? '<div class="edit-message"><label for="proposal-message">Editable English email draft</label>' +
      '<textarea id="proposal-message" rows="11">' + HTML(proposalMessage) + '</textarea></div>' : '') +
    '<div class="focused-bottom">' + primary(reviewingMessage ? 'Copy message →' : 'Review message →', reviewingMessage ? 'copy-message' : 'review-message') +
    softButton('Print / save one-page proposal →', 'print-sheet') +
    softButton('Download evidence audit ↓', 'audit') +
    '<p class="tiny-label">No sending integration · status remains Not sent.</p></div></section>';
}
function crew(): string {
  return '<section class="mobile-view home-view">' + header(false) +
    '<div class="intro"><p class="eyebrow">Crew day sheet · sample only</p><h1>Today’s sheet.</h1>' +
    '<p class="muted">Demonstration schedule for ' + HTML(projection.fromCity) + '. Addresses and contacts are not supplied.</p></div>' +
    '<div class="crew-row"><strong>16:00</strong><div><strong>Load-in</strong><p>' + UNKNOWN + ' · local venue</p></div></div>' +
    '<div class="crew-row"><strong>17:30</strong><div><strong>Soundcheck</strong><p>Sample · not confirmed</p></div></div>' +
    '<p class="tiny-label">Last verified synchronization: Unknown / To confirm</p>' +
    mobileTabs() + '</section>';
}
function unbuilt(): string {
  return '<section class="mobile-view home-view">' + header(false) +
    '<div class="intro"><p class="eyebrow">Designed extension · not implemented</p><h1>' + HTML(unbuiltName) + '.</h1>' +
    '<p>Visible in boards 02-03 and 05-09, scheduled for later PRs. There is no hidden live integration behind this entry.</p></div>' +
    softButton('Back to the tour →', 'tab-today') + mobileTabs() + '</section>';
}
function mapSVG(): string {
  const point: Record<string, [number, number]> = {
    Berlin: [405, 88], Leipzig: [360, 153], Munich: [302, 329],
    Erfurt: [278, 184], Dresden: [429, 164], Halle: [326, 132],
    Nuremberg: [300, 270], Frankfurt: [205, 227], Stuttgart: [200, 303],
    Hamburg: [292, 37], Cologne: [155, 205],
  };
  const option = projection.options.find(item => item.recommended && item.cityId) ??
    projection.options.find(item => item.cityId);
  const city = option?.cityName ?? '';
  const from = point[projection.fromCity] ?? point.Berlin!;
  const to = point[projection.toCity] ?? point.Munich!;
  const cancelled = point[projection.cancelledCity] ?? point.Leipzig!;
  const proposed = point[city];
  const pos = ([x, y]: [number, number]): string => x + ',' + y;
  const markers: [string, [number, number], string][] = [
    [projection.fromCity, from, 'confirmed'],
    [projection.cancelledCity, cancelled, 'cancelled'],
    [projection.toCity, to, 'confirmed'],
  ];
  if (proposed) markers.push([city + ' · Proposed', proposed, 'proposed']);
  const current = [from, cancelled, to].map(pos).join(' ');
  const proposedLine = proposed ? [from, proposed, to].map(pos).join(' ') : '';
  return '<div class="route-map" role="img" aria-label="Schematic route, current plan versus proposed diversion">' +
    '<svg viewBox="0 0 540 395" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
    '<path class="map-outline" d="M196 13L319 24L433 75L452 145L424 204L398 231L384 317L327 365L267 354L217 321L193 275L137 248L165 180L144 112Z"/>' +
    '<path class="map-gridline" d="M164 122L428 211 M161 240L431 101 M290 18L292 353"/>' +
    '<polyline class="route-current" points="' + current + '"/>' +
    (proposed ? '<polyline class="route-proposed" points="' + proposedLine + '"/>' : '') +
    markers.map(([text, [x, y], type]) =>
      '<circle class="map-pin ' + type + '" cx="' + x + '" cy="' + y + '" r="6"/>' +
      '<text class="map-label ' + type + '" x="' + (x + 12) + '" y="' + (y - 10) + '">' + HTML(text) + '</text>').join('') +
    '</svg><div class="map-legend"><span><i class="legend-solid"></i> Solid: current plan</span>' +
    '<span><i class="legend-dashed"></i> Dashed: Proposed</span></div>' +
    '<p class="tiny-label">Schematic positions · routing estimates from ' +
    HTML(result.audit.sourceTimestamps.road.method) + ' · not a street map</p></div>';
}
function desktopHome(): string {
  return '<section class="desktop-command">' +
    '<header class="desktop-top"><div><h1>Northbound.</h1><p class="muted">' + HTML(projection.title) + ' · sample 2026</p></div>' +
    '<div class="desktop-actions">' + badge('Sample tour') + softButton('Crew day sheet', 'tab-crew') +
    softButton('Share', 'share') + '</div></header>' +
    '<div class="desktop-incident"><div><span class="overline danger-text">! NEEDS A DECISION</span>' +
    '<strong>' + HTML(projection.cancelledCity) + ' canceled · ' + HTML(projection.cancelledDate) + '</strong></div>' +
    primary('Rescue this date →', 'rescue') + '</div>' +
    '<div class="command-body"><section class="command-map"><h2>The next three stops</h2>' +
    mapSVG() + softButton('Explore audience fit →', 'concept-audience') + '</section>' +
    '<section class="needs-you"><h2>What needs you.</h2>' +
    '<button type="button" data-action="rescue" class="need-row"><span class="need-dot amber"></span><span><strong>Choose a replacement city</strong>' +
    '<small>' + HTML(projection.cancelledDate) + ' · ' + projection.options.length + ' checked directions</small></span><b>→</b></button>' +
    '<button type="button" data-action="tab-crew" class="need-row"><span class="need-dot"></span><span><strong>Today’s load-in</strong>' +
    '<small>' + HTML(projection.fromCity) + ' · 16:00 local · sample</small></span><b>→</b></button>' +
    '<button type="button" data-action="concept-presale" class="need-row"><span class="need-dot"></span><span><strong>Presale needs a push</strong>' +
    '<small>Sample sales · no ticketing integration</small></span><b>→</b></button>' +
    '<div class="next-show"><p>Next confirmed show</p><strong>' + HTML(projection.toCity) + '</strong>' +
    '<p class="muted">Promoter and venue: ' + UNKNOWN + '</p></div></section></div>' +
    '<div class="stops-strip"><div><span>Previous locked stop</span><strong>' + HTML(projection.fromCity) + '</strong>' + badge('✓ Confirmed', 'good') + '</div>' +
    '<div><span>Cancelled stop</span><strong>' + HTML(projection.cancelledCity) + '</strong>' + badge('× Canceled', 'danger') + '</div>' +
    '<div><span>Next locked stop</span><strong>' + HTML(projection.toCity) + '</strong>' + badge('✓ Confirmed', 'good') + '</div></div>' +
    originNote() + '</section>';
}
function desktopInner(): string {
  if (screen === 'today') return desktopHome();
  return '<div class="desktop-centered"><div class="desktop-mini-header"><strong>' + HTML(projection.title) +
    '</strong><span>' + badge(projection.mode === 'demo' ? 'Sample scenario' : 'Live Qloo taste · sample tour') + '</span></div>' +
    (screen === 'options' ? shortlist() : screen === 'detail' ? details() : screen === 'draft' ? draft() :
      screen === 'crew' ? crew() : unbuilt()) + '</div>';
}
function liveDialog(): string {
  if (!liveOpen) return '';
  const formatArtist = (artist: ArtistChoice | null) =>
    artist ? HTML(artist.name ?? artist.id) : '<em>Not selected</em>';
  return '<div class="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="live-title" class="live-dialog">' +
    '<div class="modal-head"><div><p class="overline accent-text">LIVE QLOO · EXPLICIT ACTION</p><h2 id="live-title" tabindex="-1">Fresh cultural-fit evidence</h2></div>' +
    '<button class="close-button" type="button" data-action="close-live" aria-label="Close">×</button></div>' +
    '<p class="muted">Search for real, resolved Qloo artists. Live results replace the demo taste data, not the synthetic tour, venue or OSRM snapshot.</p>' +
    '<p class="tiny-label">Each search and evaluation consumes a rate-limited Worker action. No API key reaches your browser.</p>' +
    '<div class="live-selections"><div><small>Target</small><strong>' + formatArtist(liveTarget) + '</strong></div>' +
    '<div><small>Comparisons (0-3)</small><strong>' + (liveComparisons.length ? liveComparisons.map(x => HTML(x.name ?? x.id)).join(', ') : 'Optional') + '</strong></div>' +
    '<div><small>Control</small><strong>' + formatArtist(liveControl) + '</strong></div></div>' +
    '<label for="live-role">Choose artist role</label><select id="live-role" data-action="live-role" ' + (liveBusy ? 'disabled' : '') + '>' +
    (['target','comparison','control'] as ArtistRole[]).map(role => '<option value="' + role + '"' + (role === liveRole ? ' selected' : '') + '>' +
    (role === 'comparison' ? 'Comparison' : role === 'control' ? 'Control' : 'Target') + '</option>').join('') + '</select>' +
    '<form id="live-search"><label for="live-query">Qloo artist search</label><div class="search-pair">' +
    '<input name="query" id="live-query" required minlength="2" maxlength="120" placeholder="Type an artist name" autocomplete="off" ' +
      (liveBusy ? 'disabled' : '') + '><button type="submit" ' + (liveBusy ? 'disabled' : '') + '>Search</button></div></form>' +
    '<div class="artist-results">' + liveChoices.map((x, index) => '<button type="button" data-action="pick-artist" data-index="' + index + '" ' + (liveBusy ? 'disabled' : '') + '>' +
    HTML(x.name ?? x.id) + '<span>Choose →</span></button>').join('') + '</div>' +
    '<p role="status" class="live-notice">' + HTML(liveNotice || (liveBusy ? 'Waiting for the Worker…' : 'No search results selected yet.')) + '</p>' +
    primary(liveBusy ? 'Checking Qloo…' : 'Run fresh Qloo evaluation →', 'run-live', liveBusy || !liveTarget || !liveControl) +
    '<p class="tiny-label">Nothing here contacts promoters or changes confirmed dates.</p></section></div>';
}
function sosDialog(): string {
  if (!showSOS) return '';
  return '<div class="modal-backdrop"><section class="sos-dialog" role="dialog" aria-modal="true" aria-label="Local SOS">' +
    '<p class="overline accent-text">LOCAL SOS</p><h2 tabindex="-1">Designed for the next increment.</h2>' +
    '<p>The supplier shortlist and spend approval shown in board 02 are sample concepts, not working bookings or dispatch.</p>' +
    primary('Return to the tour', 'close-sos') + '</section></div>';
}
const desktopMedia = window.matchMedia('(min-width: 980px)');
let dialogReturnAction: 'open-live' | 'sos' | null = null;

/** Match previous keyboard target across DOM updates; scoped to the only mounted layout. */
function previousFocus(): { id?: string; action?: string; dataId?: string; dataIndex?: string } | null {
  const active = document.activeElement;
  if (!active || !root!.contains(active)) return null;
  if (!(active instanceof HTMLElement)) return null;
  const action = active.closest<HTMLElement>('[data-action]');
  return {
    ...(active.id ? { id: active.id } : {}),
    ...(action?.dataset.action ? { action: action.dataset.action } : {}),
    ...(action?.dataset.id ? { dataId: action.dataset.id } : {}),
    ...(action?.dataset.index ? { dataIndex: action.dataset.index } : {}),
  };
}
function findPreviousTarget(focus: NonNullable<ReturnType<typeof previousFocus>>, scope: Element): HTMLElement | null {
  if (focus.id) {
    const match = document.getElementById(focus.id);
    if (match instanceof HTMLElement && scope.contains(match)) return match;
  }
  if (!focus.action) return null;
  return [...scope.querySelectorAll<HTMLElement>('[data-action]')].find(node =>
    node.dataset.action === focus.action
    && (focus.dataId === undefined || node.dataset.id === focus.dataId)
    && (focus.dataIndex === undefined || node.dataset.index === focus.dataIndex)) ?? null;
}
function focusFirstHeading(scope: Element): void {
  const heading = scope.querySelector<HTMLElement>('h1, h2, [role="heading"]');
  if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus(); }
  else root!.querySelector<HTMLElement>('#main')?.focus();
}
function focusedDialog(): HTMLElement | null {
  return root!.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
}
function render(): void {
  const focus = previousFocus();
  const priorDialog = focusedDialog();
  const previouslyInDialog = !!(priorDialog && document.activeElement && priorDialog.contains(document.activeElement));
  const previouslyRendered = root!.querySelector('.app-layout') !== null;
  document.body.classList.toggle('focused-rescue', isFocusedRescue(incident.phase) && ['options','detail','draft'].includes(screen));
  const desktop = desktopMedia.matches;
  const mobile = screen === 'today' ? homeMobile() : screen === 'options' ? shortlist() :
    screen === 'detail' ? details() : screen === 'draft' ? draft() : screen === 'crew' ? crew() : unbuilt();
  // Only one responsive tree is mounted. Every id, label and heading is unique.
  root!.innerHTML = '<a href="#main" class="skip-link">Skip to content</a>' +
    '<div class="app-layout">' + (desktop ? sidebar() : '') + '<main id="main" class="main-content" tabindex="-1">' +
    (desktop ? '<div class="desktop-only">' + desktopInner() + '</div>' : '<div class="mobile-only">' + mobile + '</div>') +
    (notice ? '<p role="status" class="toast">' + HTML(notice) + '</p>' : '') +
    '</main></div>' + liveDialog() + sosDialog();
  printRoot!.innerHTML = screen === 'draft' && chosenProposal ? sheetHtml(chosenProposal) : '';
  document.title = 'Tour Rescue · ' + (screen === 'today' ? 'Today' : screen === 'options' ? 'Rescue options' : screen === 'detail' ? 'Review' : screen === 'draft' ? 'Promoter draft' : screen === 'crew' ? 'Crew' : unbuiltName);

  const dialog = focusedDialog();
  const layout = root!.querySelector<HTMLElement>('.app-layout');
  if (layout) layout.inert = dialog !== null; // real background tab suppression
  if (dialog) {
    const restored = previouslyInDialog && focus ? findPreviousTarget(focus, dialog) : null;
    if (restored && !restored.hasAttribute('disabled')) restored.focus();
    else focusFirstHeading(dialog);
  } else if (priorDialog && dialogReturnAction) {
    const opener = root!.querySelector<HTMLElement>('[data-action="' + dialogReturnAction + '"]');
    dialogReturnAction = null;
    if (opener) opener.focus();
    else focusFirstHeading(root!.querySelector('#main') ?? root!);
  } else if (previouslyRendered) {
    const restored = focus ? findPreviousTarget(focus, root!) : null;
    if (restored && !restored.hasAttribute('disabled')) restored.focus();
    else if (focus) focusFirstHeading(root!.querySelector('#main') ?? root!);
  }
}
desktopMedia.addEventListener('change', () => render());
function goHome(): void {
  incident = initialIncident();
  screen = 'today';
  showEvidence = false;
  reviewingMessage = false;
  notice = '';
  render();
}
function startRescue(): void {
  incident = transitionIncident(incident, { type: 'start-search' });
  incident = transitionIncident(incident, {
    type: 'proposals-ready', runId: projection.runId, optionIds: projection.options.map(option => option.id),
  });
  pendingId = projection.options.find(option => option.recommended)?.id ?? projection.options[0]?.id ?? '';
  screen = 'options';
  notice = '';
  render();
}
function review(): void {
  if (!optionById(pendingId)) return;
  incident = transitionIncident(incident, { type: 'choose', optionId: pendingId });
  screen = 'detail';
  showEvidence = false;
  render();
}
function prepare(): void {
  const selected = currentOption();
  if (!selected || selected.kind === 'day-off') return;
  if (selected.routeCheck === 'FAIL' || selected.decisionCheck === 'FAIL') {
    notice = 'This direction fails declared checks. Choose another option before drafting.';
    render(); return;
  }
  incident = transitionIncident(incident, { type: 'prepare-draft' });
  chosenProposal = buildPromoterModel(result, selected.id);
  proposalMessage = defaultMessage(chosenProposal);
  reviewingMessage = false;
  screen = 'draft';
  render();
}
function back(): void {
  if (screen === 'options') { goHome(); return; }
  if (screen === 'detail') {
    incident = transitionIncident(incident, { type: 'back-to-options' });
    screen = 'options';
  } else if (screen === 'draft') {
    incident = transitionIncident(incident, { type: 'back-to-choice' });
    screen = 'detail';
  } else goHome();
  render();
}
function downloadAudit(): void {
  const value = JSON.stringify(result.audit, null, 2);
  const file = new Blob([value], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'tour-rescue-' + result.mode + '-' + projection.runId.replace(/[^a-z0-9-]/gi, '_') + '-audit.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function openConcept(name: string): void {
  unbuiltName = name;
  screen = 'not-built';
  incident = initialIncident();
  render();
}
async function runLive(): Promise<void> {
  if (liveBusy || !liveTarget || !liveControl) return;
  const selection: LiveSelection = { target: liveTarget, control: liveControl, comparisons: liveComparisons };
  const ids = [selection.target.id, ...selection.comparisons.map(x => x.id), selection.control.id];
  if (new Set(ids).size !== ids.length) {
    liveNotice = 'Use distinct resolved Qloo artists for target, comparisons and control.';
    render(); return;
  }
  const priorIncident = incident;
  const priorScreen = screen;
  liveBusy = true;
  liveNotice = 'Running Qloo and recomputing the deterministic audit…';
  render();
  try {
    const fresh = await api.rescue(selection);
    const view = projectRescue(fresh);
    const nextState = transitionIncident(initialIncident(), { type: 'start-search' });
    incident = transitionIncident(nextState, { type: 'proposals-ready', runId: view.runId, optionIds: view.options.map(item => item.id) });
    result = fresh;
    projection = view;
    pendingId = view.options.find(x => x.recommended)?.id ?? view.options[0]?.id ?? '';
    chosenProposal = null;
    liveOpen = false;
    screen = 'options';
    notice = 'Fresh Qloo run complete. Venue and booking facts remain sample data.';
  } catch (err) {
    incident = priorIncident;
    screen = priorScreen;
    liveNotice = err instanceof Error ? err.message : 'Qloo evidence unavailable; existing decision retained.';
  } finally {
    liveBusy = false;
    render();
  }
}
root!.addEventListener('submit', async event => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.id !== 'live-search') return;
  event.preventDefault();
  if (liveBusy) return;
  const query = String(new FormData(form).get('query') ?? '');
  liveBusy = true;
  liveChoices = [];
  liveNotice = 'Searching Qloo for resolved artists…';
  render();
  try {
    liveChoices = await api.search(query);
    liveNotice = liveChoices.length ? 'Choose a resolved result for ' + liveRole + '.' : 'No artist results. Try a different search.';
  } catch (err) {
    liveNotice = err instanceof Error ? err.message : 'Search failed. No artist was selected.';
  } finally { liveBusy = false; render(); }
});
root!.addEventListener('change', event => {
  const node = event.target;
  if (!(node instanceof HTMLElement)) return;
  if (node.id === 'live-role' && node instanceof HTMLSelectElement) {
    liveRole = node.value as ArtistRole; liveChoices = []; render();
  }
  if (node.id === 'promoter-contact' && node instanceof HTMLInputElement) proposalContact = node.value;
});
root!.addEventListener('input', event => {
  const node = event.target;
  if (node instanceof HTMLTextAreaElement && node.id === 'proposal-message') proposalMessage = node.value;
  if (node instanceof HTMLInputElement && node.id === 'promoter-contact') proposalContact = node.value;
});
root!.addEventListener('click', async event => {
  const element = event.target;
  if (!(element instanceof Element)) return;
  const button = element.closest<HTMLElement>('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (liveBusy && action !== 'close-live') return;
  switch (action) {
    case 'rescue': startRescue(); break;
    case 'back': back(); break;
    case 'select-option':
      if (optionById(button.dataset.id ?? '')) pendingId = button.dataset.id!;
      render();
      [...root!.querySelectorAll<HTMLElement>('[data-action="select-option"]')]
        .find(node => node.dataset.id === pendingId)?.focus();
      break;
    case 'review': review(); break;
    case 'prepare': prepare(); break;
    case 'toggle-evidence': showEvidence = !showEvidence; render(); break;
    case 'review-message': reviewingMessage = true; render(); break;
    case 'copy-message':
      try { await navigator.clipboard.writeText(proposalMessage); notice = 'Message copied. Not sent.'; }
      catch { notice = 'Clipboard unavailable; select the draft text to copy manually.'; }
      render(); break;
    case 'print-sheet': window.print(); break;
    case 'audit': downloadAudit(); break;
    case 'tab-today': goHome(); break;
    case 'tab-route': startRescue(); break;
    case 'tab-crew': incident = initialIncident(); screen = 'crew'; render(); break;
    case 'documents':
      if (chosenProposal) { screen = 'draft'; render(); } else openConcept('Documents'); break;
    case 'concept-audience': openConcept('Audience'); break;
    case 'concept-agency': openConcept('Agency operations'); break;
    case 'concept-presale': openConcept('Presale / ticketing'); break;
    case 'share':
      try { await navigator.clipboard.writeText(window.location.href); notice = 'Preview link copied (not a booking).'; }
      catch { notice = 'Copy this page URL to share the preview.'; }
      render(); break;
    case 'sos': dialogReturnAction = 'sos'; showSOS = true; render(); break;
    case 'close-sos': showSOS = false; render(); break;
    case 'open-live': dialogReturnAction = 'open-live'; liveOpen = true; notice = ''; render(); break;
    case 'close-live': liveOpen = false; render(); break;
    case 'pick-artist': {
      const choice = liveChoices[Number(button.dataset.index)];
      if (!choice) break;
      if (liveRole === 'target') liveTarget = choice;
      if (liveRole === 'control') liveControl = choice;
      if (liveRole === 'comparison' && !liveComparisons.some(x => x.id === choice.id) && liveComparisons.length < 3) liveComparisons.push(choice);
      liveChoices = [];
      liveNotice = (choice.name ?? choice.id) + ' selected as ' + liveRole + '.';
      render(); break;
    }
    case 'run-live': await runLive(); break;
  }
});
document.addEventListener('keydown', event => {
  const dialog = focusedDialog();
  if (dialog) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (liveOpen) liveOpen = false;
      else showSOS = false;
      render();
      return;
    }
    if (event.key === 'Tab') {
      const focusable = [...dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )].filter(node => node.getClientRects().length > 0);
      if (!focusable.length) { event.preventDefault(); focusFirstHeading(dialog); return; }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (!active || !dialog.contains(active) || (event.shiftKey && active === first) ||
          (event.shiftKey && !focusable.includes(active as HTMLElement))) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    return;
  }
  if (screen === 'options' && (event.key === 'ArrowDown' || event.key === 'ArrowUp')
      && event.target instanceof Element && event.target.closest('[data-action="select-option"]')) {
    event.preventDefault();
    const index = projection.options.findIndex(option => option.id === pendingId);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const next = projection.options[(index + step + projection.options.length) % projection.options.length];
    if (!next) return;
    pendingId = next.id;
    render();
    [...root!.querySelectorAll<HTMLElement>('[data-action="select-option"]')]
      .find(node => node.dataset.id === pendingId)?.focus();
  }
});
// Programmatic focus (including screen readers) must not escape an open modal.
document.addEventListener('focusin', event => {
  const dialog = focusedDialog();
  if (dialog && event.target instanceof Node && !dialog.contains(event.target)) focusFirstHeading(dialog);
});
// The old web/ shell and deployment remain unchanged until PR-D.
render();
