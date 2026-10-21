import './landing.css';
import { el, icon } from './dom.ts';
import type { LandingModel, LandingShow } from './landing-model.ts';
import type { CheckStatus } from '../../src/core/travel-constraints.ts';

const DEMO_URL = '/app';
const GUIDE_URL = '/app?tour=start';

function link(label: string, href: string, className = ''): HTMLAnchorElement {
  const node = el('a', className, label);
  node.href = href;
  return node;
}

function demoLink(compact = false): HTMLAnchorElement {
  const node = link('Try the rescue demo', DEMO_URL, `landing-button${compact ? ' landing-button-compact' : ''}`);
  node.append(icon('arrow'));
  return node;
}

function guideLink(): HTMLAnchorElement {
  return link('Start the guided tour', GUIDE_URL, 'landing-guide-link');
}

function label(text: string): HTMLElement {
  return el('p', 'landing-eyebrow', text);
}

function statusBadge(status: CheckStatus): HTMLElement {
  return el('span', `landing-status landing-status-${status.toLowerCase()}`, status);
}

function sectionHead(eyebrow: string, title: string, description?: string): HTMLElement {
  const head = el('div', 'landing-section-head');
  const heading = el('div');
  heading.append(label(eyebrow), el('h2', '', title));
  head.append(heading);
  if (description) head.append(el('p', 'landing-section-description', description));
  return head;
}

function navLinks(): HTMLElement {
  const nav = el('nav', 'landing-nav');
  nav.setAttribute('aria-label', 'About Tour Rescue');
  nav.append(link('How it works', '#how-it-works'), link('What it shows', '#the-decision'), link('FAQ', '#faq'));
  return nav;
}

function routeRow(show: LandingShow, index: number): HTMLLIElement {
  const cancelled = show.status === 'cancelled';
  const row = el('li', `landing-route-stop${cancelled ? ' landing-route-cancelled' : ''}`);
  const marker = el('span', 'landing-route-marker');
  marker.setAttribute('aria-hidden', 'true');
  if (cancelled) marker.append(icon('close'));
  else marker.textContent = String(index + 1);
  const date = el('time', '', show.dateLabel);
  date.dateTime = show.startsAt.iso;
  const state = el('span', 'landing-route-state');
  if (show.locked) state.append(icon('lock'));
  state.append(el('span', '', cancelled ? 'Cancelled' : show.locked ? 'Locked' : 'Unconfirmed'));
  row.append(marker, date, el('strong', '', show.cityName), state);
  return row;
}

function routePreview(model: LandingModel): HTMLElement {
  const figure = el('figure', 'landing-route-preview');
  const caption = el('figcaption', 'landing-route-caption');
  caption.append(el('strong', '', `Demo: ${model.artistName}, ${model.region}`),
    el('span', '', `${model.shows.length} dates · ${model.cancelledShowCount} rescue`));
  figure.append(caption);
  const timeline = el('ol', 'landing-route-timeline');
  timeline.setAttribute('aria-label', 'The example tour and its proposed replacement');
  model.shows.forEach((show, index) => {
    timeline.append(routeRow(show, index));
    if (show.status === 'cancelled' && model.proposedStop.status === 'known') {
      const proposed = model.proposedStop.value;
      const row = el('li', 'landing-route-stop landing-route-proposed');
      const marker = el('span', 'landing-route-marker');
      marker.setAttribute('aria-hidden', 'true');
      const date = el('time', '', proposed.dateLabel);
      date.dateTime = proposed.startsAt.iso;
      row.append(marker, date, el('strong', '', proposed.cityName), el('span', 'landing-route-state', 'New option'));
      timeline.append(row);
    }
  });
  figure.append(timeline, el('p', 'landing-route-disclosure', 'Illustrative tour. All booking facts are fictional.'));
  return figure;
}

function decisionTable(model: LandingModel): HTMLElement {
  const wrapper = el('div', 'landing-table-scroll');
  wrapper.tabIndex = 0;
  wrapper.setAttribute('role', 'region');
  wrapper.setAttribute('aria-label', 'Demo decision comparison; scroll horizontally on small screens');
  wrapper.setAttribute('aria-describedby', 'landing-table-hint');
  const table = el('table', 'landing-decision-table');
  const caption = el('caption', 'landing-sr-only', 'Three options calculated from the same frozen demo as the application.');
  table.append(caption);
  const head = el('thead');
  const headings = el('tr');
  for (const title of ['Option', 'Fit (relative index)', 'Additional travel', 'Decision checks', 'Notes']) {
    const cell = el('th', '', title);
    cell.scope = 'col';
    headings.append(cell);
  }
  head.append(headings);
  const body = el('tbody');
  for (const option of model.options) {
    const row = el('tr', option.recommended ? 'landing-row-recommended' : '');
    row.dataset.optionId = option.id;
    const name = el('th');
    name.scope = 'row';
    const nameContent = el('span', 'landing-option-name');
    const marker = el('span', 'landing-option-marker');
    marker.setAttribute('aria-hidden', 'true');
    nameContent.append(marker, el('span', '', option.cityName));
    name.append(nameContent);
    const checks = el('td');
    checks.append(statusBadge(option.decisionStatus));
    checks.title = `Routing feasibility: ${option.feasibilityStatus}. Decision checks also include fit and extra-distance preferences.`;
    row.append(name, el('td', 'landing-numeric', option.fitText), el('td', 'landing-numeric', option.additionalDistanceText),
      checks, el('td', 'landing-table-note', option.note));
    body.append(row);
  }
  table.append(head, body);
  wrapper.append(table);
  return wrapper;
}

function breakpoint(model: LandingModel): HTMLElement {
  const band = el('section', 'landing-breakpoint');
  band.id = 'what-if';
  const inner = el('div', 'landing-container');
  const point = model.breakpoint;
  const found = point.status === 'found' && point.afterMetres.status === 'known';
  const description = found
    ? `Small changes to your constraints can lead to different recommendations. In this demo, increasing the extra-distance cap by ${point.deltaText} changes the recommendation to ${point.afterCity}.`
    : `The result stays honest when no change is found: ${point.reason} Checked range: ${point.rangeText}.`;
  inner.append(sectionHead('What if?', 'Know exactly what would change your mind.', description));
  if (found) {
    const comparison = el('div', 'landing-breakpoint-comparison');
    const result = (distance: string, city: string, after: boolean): HTMLElement => {
      const node = el('div', `landing-breakpoint-result${after ? ' landing-breakpoint-after' : ''}`);
      node.append(el('strong', 'landing-breakpoint-value', distance),
        el('span', 'landing-breakpoint-unit', 'Extra-distance cap'),
        el('span', 'landing-recommended-label', 'Recommended option'),
        el('strong', 'landing-breakpoint-city', city));
      return node;
    };
    const arrow = el('div', 'landing-breakpoint-arrow');
    arrow.setAttribute('aria-hidden', 'true');
    arrow.append(icon('arrow'));
    comparison.append(result(point.beforeText, point.beforeCity, false), arrow, result(point.afterText, point.afterCity, true));
    inner.append(comparison, el('p', 'landing-breakpoint-note', point.minimumProven
      ? 'One changed assumption. Exact threshold checked at 1-metre resolution; all other inputs stay fixed.'
      : `One changed assumption. Checked range: ${point.rangeText}; minimum threshold is not proven.`));
  } else inner.append(el('p', 'landing-breakpoint-unavailable', point.status === 'unknown' ? 'Breakpoint UNKNOWN' : 'No reversal found in the checked range'));
  band.append(inner);
  return band;
}

const evidencePaths = {
  audience: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20v-2a7 7 0 0 1 14 0v2M17 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 4 4v2',
  route: 'M6 13s4-4 4-7a4 4 0 0 0-8 0c0 3 4 7 4 7ZM6 6h.01M18 18s4-4 4-7a4 4 0 0 0-8 0c0 3 4 7 4 7ZM18 11h.01M6 16v3a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3',
  sensitivity: 'M3 6h8M15 6h6M3 12h3M10 12h11M3 18h12M19 18h2M11 3h4v6h-4zM6 9h4v6H6zM15 15h4v6h-4z',
  tag: 'M3 3h8l10 10-8 8L3 11V3ZM7 7h.01M10 7l8 8',
  audit: 'M6 2h8l4 4v16H6V2ZM14 2v5h4M9 11h6M9 15h6M9 19h4',
} as const;

function evidenceIcon(name: keyof typeof evidencePaths): SVGSVGElement {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('fill', 'none');
  node.setAttribute('stroke', 'currentColor');
  node.setAttribute('stroke-width', '1.6');
  node.setAttribute('stroke-linecap', 'round');
  node.setAttribute('stroke-linejoin', 'round');
  node.setAttribute('aria-hidden', 'true');
  node.classList.add('landing-evidence-icon');
  const path = document.createElementNS(node.namespaceURI, 'path');
  path.setAttribute('d', evidencePaths[name]);
  node.append(path);
  return node;
}

function evidence(): HTMLElement {
  const section = el('section', 'landing-section landing-evidence');
  section.id = 'the-evidence';
  section.append(sectionHead('The evidence', 'A recommendation with its working attached.',
    'Every suggestion comes with reviewable context, so you can inspect the trade-offs and make your own call.'));
  const rows: readonly [keyof typeof evidencePaths, string, string][] = [
    ['audience', 'Audience provenance', 'A fit map and traceable source records. Synthetic taste profiles in the demo.'],
    ['route', 'Constraint checks', 'Recorded road distances, locked dates and declared limits; missing evidence stays UNKNOWN.'],
    ['sensitivity', 'Artist-omission sensitivity', 'Remove one comparison artist and check whether the recommendation survives.'],
    ['tag', 'Tag Bridge', 'Up to three shared tags with their sources; UNKNOWN when that evidence is absent.'],
    ['audit', 'Exportable audit', 'Inputs, sources, changed stops and checks in JSON, plus an A4 promoter sheet.'],
  ];
  const list = el('ul', 'landing-evidence-list');
  for (const [name, title, description] of rows) {
    const row = el('li', 'landing-evidence-row');
    row.append(evidenceIcon(name), el('strong', '', title), el('p', '', description));
    if (name === 'route') {
      const statuses = el('div', 'landing-evidence-statuses');
      statuses.append(statusBadge('PASS'), statusBadge('FAIL'), statusBadge('UNKNOWN'));
      row.append(statuses);
    }
    list.append(row);
  }
  section.append(list);
  return section;
}

function faq(): HTMLElement {
  const section = el('section', 'landing-section landing-faq');
  section.id = 'faq';
  const heading = el('div');
  heading.append(label('FAQ'), el('h2', '', 'Quick answers.'));
  const list = el('div', 'landing-faq-list');
  const questions = [
    ['Is this using real artist or booking data?', 'The demo uses synthetic taste profiles and fictional artists, venues and booking facts. Its travel measurements come from a recorded OSRM road matrix. It is a reproducible example, not a confirmed tour or a live availability feed.'],
    ['What changes in live mode?', 'You select real artist identities, and the Worker requests Qloo evidence and converts it into relative fit percentiles. The API key stays on the Worker. The frozen Germany route and recorded OSRM matrix remain the same; live taste evidence does not confirm a venue booking.'],
    ['Does a higher fit mean more ticket sales?', 'No. Fit is a relative taste index within the fixed set of candidate cities, calculated from the target and comparison artists. It is not an audience count, a probability of success or a ticket-sales forecast.'],
    ['Can I change the constraints in the demo?', 'Yes. Change the extra-distance cap, minimum fit or venue-fee ceiling and inspect the result. Breakpoints test one assumption at a time. The four locked shows stay fixed.'],
    ['Does it only suggest nearby cities?', 'The demo compares a replacement city, a longer detour and a day off in a fixed Germany scenario. A higher-fit detour can win when it meets your declared constraints; extra distance and cultural fit remain separate measures.'],
    ['Can I export the results?', 'Download the JSON audit and a one-page promoter sheet for the selected option. The sheet prints to A4 and exports as a PNG in your browser, with the relevant checks and unknowns included.'],
  ] as const;
  for (const [question, answer] of questions) {
    const details = el('details', 'landing-faq-item');
    const summary = el('summary');
    const plus = el('span', 'landing-faq-plus');
    plus.setAttribute('aria-hidden', 'true');
    summary.append(el('span', '', question), plus);
    details.append(summary, el('p', '', answer));
    list.append(details);
  }
  section.append(heading, list);
  return section;
}

/** Read-only overview of the evaluated demo; every CTA enters the real application. */
export function createLanding(model: LandingModel): HTMLElement {
  const page = el('div', 'landing-site');
  const header = el('header', 'landing-header landing-container');
  header.append(link('Tour Rescue', '/', 'landing-brand'), navLinks(), demoLink(true));
  const main = el('main', 'landing-main');
  main.id = 'main-content';
  main.tabIndex = -1;
  const top = el('div', 'landing-container');
  const hero = el('section', 'landing-hero');
  const intro = el('div', 'landing-hero-copy');
  const title = el('h1');
  for (const line of ['A show falls ', 'through. Your tour ', "doesn't have to."]) title.append(el('span', 'landing-title-line', line));
  intro.append(label('For bookers and tour managers'), title,
    el('p', 'landing-intro', 'Tour Rescue helps you find and compare realistic options when a show cancels - keeping your commitments, constraints and the bigger picture in view.'));
  const heroActions = el('div', 'landing-hero-actions');
  heroActions.append(demoLink(), guideLink());
  intro.append(heroActions, el('p', 'landing-tagline', 'Same tour. Smarter options.'));
  hero.append(intro, routePreview(model));
  const problem = el('section', 'landing-section landing-problem');
  problem.append(sectionHead('The problem', 'The empty date is only half the problem.',
    "A cancelled show affects routing, travel, costs, crew and momentum. Finding a replacement isn't just about one date - it's about what still works for the whole tour."));
  const how = el('section', 'landing-section landing-how');
  how.id = 'how-it-works';
  how.append(label('How Tour Rescue works'));
  const steps = el('ol', 'landing-how-steps');
  const workflow = [
    ['Keep the commitments', 'Lock in your confirmed shows and constraints, so the search works around what cannot change.'],
    ['Compare three ways forward', 'Compare a replacement, a detour and a day off, with clear checks and trade-offs.'],
    ['Test it. Share the reasoning.', 'Adjust a limit, see how the recommendation changes, and export the logic behind it.'],
  ];
  for (const [index, [heading, description]] of workflow.entries()) {
    const row = el('li');
    const content = el('div');
    content.append(el('h3', '', heading), el('p', '', description));
    row.append(el('span', 'landing-how-number', String(index + 1)), content);
    if (index < workflow.length - 1) row.append(icon('arrow'));
    steps.append(row);
  }
  how.append(steps);
  const decision = el('section', 'landing-section landing-decision');
  decision.id = 'the-decision';
  const tableHint = el('p', 'landing-table-hint');
  tableHint.id = 'landing-table-hint';
  tableHint.append(el('span', '', 'Swipe or scroll to see travel, checks and notes.'), icon('arrow'));
  decision.append(sectionHead('The decision', "The highest fit isn't always the right move.",
    'Check routing and declared limits first, then compare cultural fit. A recommendation has to work for the whole tour.'),
    decisionTable(model), tableHint, el('p', 'landing-table-explanation', 'Decision checks include feasibility and your fit and extra-distance preferences; a failed preference does not mean the road route is impossible.'),
    el('p', 'landing-data-disclosure', model.disclosure));
  top.append(hero, problem, how, decision);
  const bottom = el('div', 'landing-container');
  const judges = el('section', 'landing-judges');
  judges.id = 'judges';
  const judgeHeading = el('div', 'landing-judge-heading');
  const judgeTitle = el('h2');
  judgeTitle.append(el('span', '', 'Open the demo.'), el('span', '', 'Try to overturn it.'));
  judgeHeading.append(label('For hackathon judges'), judgeTitle, guideLink());
  const judgeSteps = el('ol', 'landing-judge-steps');
  for (const [index, text] of ['Run the demo with the example tour.',
    `Adjust one constraint, such as the ${model.additionalDistanceCapText} extra-distance cap.`,
    'See the recommendation change, inspect the evidence and download the audit.'].entries()) {
    const row = el('li');
    row.append(el('span', '', String(index + 1)), el('p', '', text));
    judgeSteps.append(row);
  }
  judges.append(judgeHeading, judgeSteps);
  const final = el('section', 'landing-final-cta');
  const finalHeading = el('div');
  const finalTitle = el('h2');
  finalTitle.append(el('span', '', 'Keep the tour.'), el('span', '', 'Find the next move.'));
  finalHeading.append(label('Same tour. Smarter options.'), finalTitle);
  const finalActions = el('div');
  finalActions.append(demoLink(), el('p', 'landing-tagline', 'Real constraints. Clearer choices.'));
  final.append(finalHeading, finalActions);
  bottom.append(evidence(), judges, faq(), final);
  main.append(top, breakpoint(model), bottom);
  const footer = el('footer', 'landing-footer landing-container');
  footer.append(link('Tour Rescue', '/', 'landing-brand'), navLinks(),
    el('p', '', 'A hackathon prototype. Synthetic tastes and bookings. Recorded OSRM snapshot.'));
  page.append(header, main, footer);
  return page;
}
