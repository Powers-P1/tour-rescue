import type { ApiDecisionResult } from '../../worker/src/app.ts';
import { buildPromoterModel } from './promoter-model.ts';
import type { PromoterSheetModel } from './promoter-model.ts';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function section(title: string): HTMLElement {
  const node = element('section', 'promoter-section');
  node.append(element('h3', '', title));
  return node;
}

function metric(title: string, value: string, note: string): HTMLElement {
  const node = element('div', 'promoter-metric');
  node.append(element('p', 'promoter-eyebrow', title), element('strong', '', value), element('p', 'promoter-small', note));
  return node;
}

let printHandlersInstalled = false;
function installPrintSizing(): void {
  if (printHandlersInstalled) return;
  printHandlersInstalled = true;
  window.addEventListener('beforeprint', () => {
    const page = document.querySelector<HTMLElement>('.promoter-sheet');
    if (!page || page.offsetHeight === 0) return;
    page.style.setProperty('--promoter-print-scale', '1');
    // A4 minus the stylesheet's 12 mm margins; leave another 3 mm for rounding.
    // Measure after print styles apply, so unusually long names keep their text
    // without pushing constraints or source records onto a second sheet.
    const availableHeight = 270 * 96 / 25.4;
    const scale = Math.min(1, availableHeight / page.getBoundingClientRect().height);
    page.style.setProperty('--promoter-print-scale', String(scale));
  });
  window.addEventListener('afterprint', () => {
    document.querySelector<HTMLElement>('.promoter-sheet')?.style.removeProperty('--promoter-print-scale');
  });
}

/** Uses textContent throughout: artist names and evidence are data, never markup. */
export function renderPromoterSheet(result: ApiDecisionResult, optionId: string): HTMLElement {
  installPrintSizing();
  const model = buildPromoterModel(result, optionId);
  const page = element('article', 'promoter-sheet');
  if (model.artist.length > 80) page.classList.add('promoter-sheet--long-name');
  if (model.artist.length > 200) page.classList.add('promoter-sheet--very-long-name');
  page.setAttribute('aria-label', `Promoter sheet for ${model.artist}, ${model.city}`);
  const header = element('header', 'promoter-header');
  header.append(element('strong', 'promoter-brand', 'Tour Rescue'), element('span', 'promoter-eyebrow', 'PROMOTER BRIEF / PROPOSED DATE'));
  const intro = element('div', 'promoter-intro');
  intro.append(element('p', 'promoter-mode', model.modeLabel), element('h1', '', model.artist),
    element('h2', '', `${model.city} · ${model.date}`),
    element('p', 'promoter-small', `${model.optionLabel} · ${model.timeZone}`));
  const banner = element('section', `promoter-decision promoter-decision--${model.decisionStatus.toLowerCase()}`);
  banner.append(element('strong', '', `${model.decisionStatus} · ${model.recommendation}`), element('p', '', model.recommendationNote));
  const venue = section('Proposed venue');
  venue.append(element('p', 'promoter-venue', model.venue), element('p', 'promoter-small', model.venueNote),
    element('p', 'promoter-small', model.provenanceNote));
  const metrics = element('div', 'promoter-metrics');
  metrics.append(metric('FIT INDEX / 100', model.fit, model.fitNote),
    metric('EXTRA TRAVEL', model.extraDistance, `${model.extraDriving} driving versus the day-off route. Distance cap: ${model.distanceLimit}.`),
    metric('MAXIMUM DRIVING / DAY', model.maximumDailyDriving, `Daily limit: ${model.dailyDrivingLimit}. Shared calendar-day allocation; ${model.drivingTimeZone}.`));
  const comparisons = section('Comparison artists and sensitivity');
  const comparisonList = element('ol', 'promoter-comparisons');
  if (model.comparisons.some(comparison => comparison.name.length > 80)) comparisonList.classList.add('promoter-comparisons--long');
  for (const comparison of model.comparisons) comparisonList.append(element('li', '', comparison.name));
  comparisons.append(comparisonList, element('p', 'promoter-small', model.sensitivityNote));
  const checks = section('Declared constraints and preferences');
  checks.append(element('p', 'promoter-small', `${model.checkCount} checks: ${model.checkCounts.PASS} PASS / ${model.checkCounts.FAIL} FAIL / ${model.checkCounts.UNKNOWN} UNKNOWN. Grouped below; every check is included.`));
  const checkList = element('ul', 'promoter-checks');
  for (const group of model.checkGroups) {
    const row = element('li', '');
    row.append(element('span', `promoter-status promoter-status--${group.status.toLowerCase()}`, group.status),
      element('span', '', `${group.label} (${group.checkIds.length})`));
    checkList.append(row);
  }
  checks.append(checkList, element('p', 'promoter-small', `Venue fee: ${model.venueFee}. Fee-only ceiling: ${model.venueFeeLimit}; unpriced travel and other costs are excluded.`));
  const risks = section('What still needs attention');
  const risksList = element('ul', 'promoter-risks');
  for (const risk of model.risks) risksList.append(element('li', '', risk));
  risks.append(risksList);
  const source = element('footer', 'promoter-sources');
  source.append(element('strong', '', 'Sources and traceability'));
  for (const line of model.sourceLines) source.append(element('p', '', line));
  source.append(element('p', '', `Generated: ${model.generatedAt} · Run: ${model.runId}`),
    element('p', '', 'Keep the matching JSON audit with this brief for individual checks, query records and counterfactuals.'));
  page.append(header, intro, banner, venue, metrics, comparisons, checks, risks, source);
  return page;
}

type CanvasLine = { text: string; weight: number; size: number; color: string; gap: number; rule?: boolean };
const INK = '#101828';
const MUTED = '#52627a';
const STATUS_COLORS = { PASS: '#087849', FAIL: '#b42318', UNKNOWN: '#46546a' } as const;

function canvasContent(model: PromoterSheetModel): CanvasLine[] {
  const lines: CanvasLine[] = [];
  const add = (text: string, size = 14, weight = 400, color = INK, gap = 5) => lines.push({ text, size, weight, color, gap });
  const heading = (text: string) => lines.push({ text, size: 16, weight: 700, color: INK, gap: 8, rule: true });
  add('Tour Rescue  /  PROMOTER BRIEF', 18, 700, INK, 18);
  add(model.modeLabel, 12, 700, MUTED, 7);
  // Long provider names must not consume the page at headline size, forcing
  // much smaller risk/source text. All characters are still rendered.
  add(model.artist, model.artist.length > 200 ? 14 : model.artist.length > 80 ? 20 : 32, 700, INK, 7);
  add(`${model.city} · ${model.date}`, 21, 700, INK, 5);
  add(`${model.optionLabel} · ${model.timeZone}`, 12, 400, MUTED, 15);
  add(`${model.decisionStatus} · ${model.recommendation}`, 17, 700, STATUS_COLORS[model.decisionStatus], 5);
  add(model.recommendationNote, 12, 400, MUTED, 13);
  heading('Proposed venue');
  add(model.venue, 15, 700);
  add(model.venueNote, 12, 400, MUTED);
  add(model.provenanceNote, 12, 400, MUTED, 12);
  heading('Fit and travel');
  add(`Fit index / 100: ${model.fit}`, 19, 700);
  add(model.fitNote, 12, 400, MUTED, 8);
  add(`Extra distance: ${model.extraDistance} · Extra driving: ${model.extraDriving}`, 16, 700);
  add(`Versus the day-off route. Distance cap: ${model.distanceLimit}.`, 12, 400, MUTED, 8);
  add(`Maximum driving / day: ${model.maximumDailyDriving} · Limit: ${model.dailyDrivingLimit}`, 15, 700);
  add(`Shared calendar-day allocation; ${model.drivingTimeZone}.`, 12, 400, MUTED, 12);
  heading('Comparison artists and sensitivity');
  for (const comparison of model.comparisons) add(`${comparison.slot}. ${comparison.name}`, 13);
  add(model.sensitivityNote, 12, 400, MUTED, 12);
  heading('Declared constraints and preferences');
  add(`${model.checkCount} checks: ${model.checkCounts.PASS} PASS / ${model.checkCounts.FAIL} FAIL / ${model.checkCounts.UNKNOWN} UNKNOWN. Every check is included below.`, 12, 400, MUTED, 8);
  for (const group of model.checkGroups) add(`${group.status}  ${group.label} (${group.checkIds.length})`, 13, 600, STATUS_COLORS[group.status], 3);
  add(`Venue fee: ${model.venueFee}. Fee-only ceiling: ${model.venueFeeLimit}; unpriced travel and other costs are excluded.`, 12, 400, MUTED, 12);
  heading('What still needs attention');
  for (const risk of model.risks) add(`• ${risk}`, 12, 400, MUTED, 4);
  heading('Sources and traceability');
  for (const line of model.sourceLines) add(line, 11, 400, MUTED, 4);
  add(`Generated: ${model.generatedAt}`, 11, 400, MUTED, 4);
  add(`Run: ${model.runId}`, 11, 400, MUTED, 4);
  add('Keep the matching JSON audit for individual checks, query records and counterfactuals.', 11, 400, MUTED, 0);
  return lines;
}

function wrap(context: CanvasRenderingContext2D, text: string, width: number): string[] {
  const rows: string[] = [];
  let row = '';
  for (const word of text.split(/\s+/)) {
    const combined = row ? `${row} ${word}` : word;
    if (context.measureText(combined).width <= width) { row = combined; continue; }
    if (row) rows.push(row);
    row = '';
    // UUIDs and source references can lack spaces. Preserve every character.
    for (const character of word) {
      if (row && context.measureText(row + character).width > width) { rows.push(row); row = ''; }
      row += character;
    }
  }
  if (row) rows.push(row);
  return rows;
}

/** A4 proportions, drawn from the same model as print; no DOM capture, server or LLM. */
export async function createPromoterPng(result: ApiDecisionResult, optionId: string): Promise<Blob> {
  const model = buildPromoterModel(result, optionId);
  const canvas = document.createElement('canvas');
  canvas.width = 1680;
  canvas.height = 2376;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot create a canvas PNG. Use Print A4 instead.');
  const pageWidth = 840;
  const pageHeight = 1188;
  const margin = 48;
  const width = pageWidth - margin * 2;
  const lines = canvasContent(model);
  let scale = 1;
  const font = (line: CanvasLine) => `${line.weight} ${line.size * scale}px Arial, sans-serif`;
  const height = () => lines.reduce((total, line) => {
    context.font = font(line);
    return total + wrap(context, line.text, width).length * line.size * scale * 1.3 + line.gap * scale + (line.rule ? 13 * scale : 0);
  }, 0);
  // Scale the complete text to fit rather than silently cutting off unknowns or sources.
  while (height() > pageHeight - margin * 2 && scale > 0.45) scale -= 0.025;
  if (height() > pageHeight - margin * 2) throw new Error('This evidence is too long for a readable single-page PNG. Download the JSON audit instead.');
  context.scale(2, 2);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, pageWidth, pageHeight);
  context.textBaseline = 'top';
  let y = margin;
  for (const line of lines) {
    if (line.rule) {
      context.strokeStyle = '#dce3ec';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(margin, y + 2);
      context.lineTo(pageWidth - margin, y + 2);
      context.stroke();
      y += 13 * scale;
    }
    context.font = font(line);
    context.fillStyle = line.color;
    for (const row of wrap(context, line.text, width)) {
      context.fillText(row, margin, y);
      y += line.size * scale * 1.3;
    }
    y += line.gap * scale;
  }
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob =>
    blob ? resolve(blob) : reject(new Error('PNG export failed. Use Print A4 instead.')), 'image/png'));
}

export async function downloadPromoterPng(result: ApiDecisionResult, optionId: string): Promise<void> {
  const blob = await createPromoterPng(result, optionId);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `tour-rescue-promoter-${optionId.replace(/[^a-z0-9_-]/gi, '-')}.png`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
