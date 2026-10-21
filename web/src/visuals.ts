import type { DecisionAudit } from '../../src/core/audit-types.ts';
import { cityCoordinates, commonSourcedTags, fitMapCities, projectCity, scatterModel } from './visual-model.ts';
import type { TagBridgeInput, TagProvenance } from './visual-model.ts';
export type { TagBridgeInput, SourcedTag, TagProvenance } from './visual-model.ts';

const NS = 'http://www.w3.org/2000/svg';
let visualId = 0;
const number = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

function html<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, text?: string): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

// Natural Earth 1:110m country outline, public domain, downloaded 2026-10-21.
// https://www.naturalearthdata.com/about/terms-of-use/
// https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson
// Coordinates rounded only by the upstream 1:110m dataset. Used for display, never road calculations.
const germanyOutline: readonly (readonly [number, number])[] = [
  [14.119686,53.757029],[14.353315,53.248171],[14.074521,52.981263],[14.4376,52.62485],
  [14.685026,52.089947],[14.607098,51.745188],[15.016996,51.106674],[14.570718,51.002339],
  [14.307013,51.117268],[14.056228,50.926918],[13.338132,50.733234],[12.966837,50.484076],
  [12.240111,50.266338],[12.415191,49.969121],[12.521024,49.547415],[13.031329,49.307068],
  [13.595946,48.877172],[13.243357,48.416115],[12.884103,48.289146],[13.025851,47.637584],
  [12.932627,47.467646],[12.62076,47.672388],[12.141357,47.703083],[11.426414,47.523766],
  [10.544504,47.566399],[10.402084,47.302488],[9.896068,47.580197],[9.594226,47.525058],
  [8.522612,47.830828],[8.317301,47.61358],[7.466759,47.620582],[7.593676,48.333019],
  [8.099279,49.017784],[6.65823,49.201958],[6.18632,49.463803],[6.242751,49.902226],
  [6.043073,50.128052],[6.156658,50.803721],[5.988658,51.851616],[6.589397,51.852029],
  [6.84287,52.22844],[7.092053,53.144043],[6.90514,53.482162],[7.100425,53.693932],
  [7.936239,53.748296],[8.121706,53.527792],[8.800734,54.020786],[8.572118,54.395646],
  [8.526229,54.962744],[9.282049,54.830865],[9.921906,54.983104],[9.93958,54.596642],
  [10.950112,54.363607],[10.939467,54.008693],[11.956252,54.196486],[12.51844,54.470371],
  [13.647467,54.075511],[14.119686,53.757029],
];

function labelledSvg(label: string, description: string, viewBox: string): SVGSVGElement {
  const id = `tr-visual-${++visualId}`;
  const node = svg('svg', { viewBox, role: 'img', 'aria-labelledby': `${id}-title ${id}-desc` });
  node.append(svg('title', { id: `${id}-title` }, label), svg('desc', { id: `${id}-desc` }, description));
  return node;
}

function baseMap(label: string, description: string): SVGSVGElement {
  const map = labelledSvg(label, description, '0 0 600 690');
  const outline = germanyOutline.map(([lon, lat], index) => {
    const { x, y } = projectCity(lon, lat);
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ') + ' Z';
  map.append(svg('path', { d: outline, class: 'map-country' }));
  for (const [name, x, y] of [['DENMARK',260,23],['NETHERLANDS',62,211],['FRANCE',63,560],['POLAND',542,216],['CZECHIA',471,469],['AUSTRIA',438,666]] as const) {
    map.append(svg('text', { x, y, class: 'map-neighbour', 'text-anchor': 'middle' }, name));
  }
  return map;
}

function mapAttribution(): HTMLElement {
  const note = html('p', 'visual-attribution');
  const link = html('a', '', 'Natural Earth');
  link.href = 'https://www.naturalearthdata.com/about/terms-of-use/';
  link.target = '_blank';
  link.rel = 'noreferrer';
  note.append('Map: ', link, ' (public domain). City coordinates: frozen catalogue.');
  return note;
}

export function renderRouteMap(audit: DecisionAudit): HTMLElement {
  const figure = html('figure', 'route-map visual-panel');
  const map = baseMap('The five-date Germany tour', 'City-centre markers with schematic connections in show order. These lines are not road paths. The cancelled show is marked with a cross.');
  const scenario = audit.replay.scenario;
  const points = scenario.tour.shows.flatMap(show => {
    const coordinates = cityCoordinates(show.cityId);
    return coordinates === undefined ? [] : [{ show, ...projectCity(coordinates.lon, coordinates.lat) }];
  });
  const arrowId = `tr-map-arrow-${++visualId}`;
  const defs = svg('defs');
  const marker = svg('marker', { id: arrowId, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' });
  marker.append(svg('path', { d: 'M 0 0 L 10 5 L 0 10 Z', fill: '#8d9cb2' }));
  defs.append(marker);
  map.append(defs);
  points.forEach((point, index) => {
    const next = points[index + 1];
    if (next === undefined) return;
    const dx = next.x - point.x;
    const dy = next.y - point.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return;
    const endX = next.x - dx / length * 19;
    const endY = next.y - dy / length * 19;
    map.append(svg('path', { d: `M ${point.x},${point.y} L ${endX},${endY}`, class: 'map-route-line',
      'stroke-dasharray': point.show.status === 'cancelled' || next.show.status === 'cancelled' ? '7 6' : 'none',
      'marker-end': `url(#${arrowId})` }));
  });
  map.append(svg('text', { x: 268, y: 390, class: 'map-country-name', 'text-anchor': 'middle' }, 'GERMANY'));
  for (const point of points) {
    const cancelled = point.show.status === 'cancelled';
    const name = scenario.cities.find(city => city.id === point.show.cityId)?.name ?? point.show.cityId;
    const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: point.show.schedule.startsAt.timeZone })
      .format(new Date(point.show.schedule.startsAt.iso));
    const group = svg('g', { class: cancelled ? 'map-stop is-cancelled' : 'map-stop' });
    group.append(svg('title', {}, `${name}, ${date}: ${cancelled ? 'cancelled' : 'locked commitment'}`),
      svg('circle', { cx: point.x, cy: point.y, r: cancelled ? 12 : 9, class: 'map-stop-dot' }));
    if (cancelled) group.append(svg('path', { d: `M${point.x - 4},${point.y - 4}L${point.x + 4},${point.y + 4}M${point.x + 4},${point.y - 4}L${point.x - 4},${point.y + 4}`, stroke: 'white', 'stroke-width': 2.2 }));
    group.append(svg('text', { x: point.x + 18, y: point.y - 4, class: 'map-stop-label' }, name),
      svg('text', { x: point.x + 18, y: point.y + 16, class: 'map-stop-date' }, date));
    map.append(group);
  }
  figure.append(map, html('figcaption', 'visual-caption', 'Four locked commitments. One cancelled date. Connections are schematic; distances come from OSRM.'), mapAttribution());
  return figure;
}

function fitColour(fit: number): string {
  const low = [216, 246, 232];
  const high = [0, 112, 70];
  return `rgb(${low.map((value, index) => Math.round(value + (high[index]! - value) * fit / 100)).join(',')})`;
}

export function renderFitMap(audit: DecisionAudit): HTMLElement {
  const figure = html('figure', 'fit-map visual-panel');
  const cities = fitMapCities(audit);
  const title = html('h3', 'visual-title', `${cities.length} cities · frozen candidate set`);
  const subtitle = html('p', 'visual-subtitle', 'Colour shows cultural fit, not feasibility or ticket demand.');
  const legend = html('div', 'fit-legend');
  legend.setAttribute('aria-label', 'Fit index scale from zero to one hundred');
  legend.append(html('span', '', '0'), html('span', 'fit-legend-ramp'), html('span', '', '100'));
  const map = baseMap('Cultural fit across the frozen city set', 'Colours use the actual percentile-based fit index. Hollow points mean unknown. Exact values for every city are available in the table below.');
  const labelled = new Set(['de-hamburg','de-berlin','de-leipzig','de-munich','de-cologne','de-frankfurt','de-nuremberg','de-stuttgart','de-bremen','de-hanover','de-dresden']);
  const candidates = new Set(audit.replay.scenario.repairCandidates.flatMap(candidate => candidate.kind === 'day-off' ? [] : [candidate.cityId]));
  for (const city of cities) {
    const { x, y } = projectCity(city.lon, city.lat);
    const value = city.fit.status === 'known' ? number.format(city.fit.value) : 'UNKNOWN';
    const group = svg('g', { class: 'map-city', tabindex: 0, role: 'img', 'aria-label': `${city.name}: ${value}` });
    group.append(svg('title', {}, `${city.name}: ${value}${city.fit.status === 'unknown' ? `. ${city.fit.reason}` : ' fit index'}`));
    if (candidates.has(city.id)) group.append(svg('circle', { cx: x, cy: y, r: 14, class: 'map-candidate-ring' }));
    group.append(svg('circle', { cx: x, cy: y, r: labelled.has(city.id) ? 9 : 6,
      fill: city.fit.status === 'known' ? fitColour(city.fit.value) : '#fff',
      stroke: city.fit.status === 'known' ? '#fff' : '#7a8799', 'stroke-width': 2 }));
    if (labelled.has(city.id)) {
      const labelX = x + 15;
      const labelY = city.id === 'de-cologne' ? y + 3 : y - 3;
      const name = city.name === 'Frankfurt am Main' ? 'Frankfurt' : city.name;
      group.append(svg('text', { x: labelX, y: labelY, class: candidates.has(city.id) ? 'map-fit-label is-candidate' : 'map-fit-label' }, name),
        svg('text', { x: labelX, y: labelY + 17, class: 'map-fit-value' }, value));
    }
    map.append(group);
  }
  const details = html('details', 'visual-values');
  details.append(html('summary', '', 'Exact fit values for all cities'));
  const table = html('table');
  const head = html('thead');
  const tr = html('tr');
  tr.append(html('th', '', 'City'), html('th', '', 'Fit index'));
  head.append(tr);
  const body = html('tbody');
  for (const city of cities) {
    const row = html('tr');
    row.append(html('td', '', city.name), html('td', '', city.fit.status === 'known' ? number.format(city.fit.value) : `UNKNOWN — ${city.fit.reason}`));
    body.append(row);
  }
  table.append(head, body);
  details.append(table);
  const sourceLabel = audit.mode === 'demo' ? 'Synthetic taste fixture' :
    cities.some(city => city.fit.status === 'known') ? 'Qloo-derived percentiles' : 'Qloo fit UNKNOWN';
  figure.append(title, subtitle, legend, map,
    html('figcaption', 'visual-caption', `${sourceLabel} · markers with rings are the two show options. Missing values are never replaced with zero.`), details, mapAttribution());
  if (cities.length === 0) figure.append(html('p', 'visual-caption', 'UNKNOWN: the frozen city set is unavailable.'));
  return figure;
}

export function renderFitScatter(audit: DecisionAudit, selectedOptionId: string, onSelect?: (optionId: string) => void): HTMLElement {
  const model = scatterModel(audit);
  const figure = html('figure', 'fit-scatter visual-panel');
  const heading = html('div', 'scatter-heading');
  heading.append(html('h3', 'visual-title', 'Better fit. How much extra driving?'), html('p', 'visual-subtitle', 'Two independent axes. No blended score.'));
  const plot = labelledSvg('Fit index versus additional kilometres', 'Fit ranges from zero to one hundred on the vertical axis. Extra kilometres are measured above the day-off route. Day off has no fit and is not plotted.', '0 0 1300 264');
  // An image role can flatten interactive descendants in an accessibility tree.
  if (onSelect !== undefined) plot.setAttribute('role', 'group');
  let drawing: SVGGElement | undefined;
  let dimensions = '';
  function draw(width: number, height: number): void {
    const size = `${width}:${height}`;
    if (size === dimensions || width <= 0 || height <= 0) return;
    dimensions = size;
    const activeId = plot.contains(document.activeElement) ? document.activeElement?.getAttribute('data-option-id') : null;
    const content = svg('g');
    const compact = width < 600;
    const left = compact ? 45 : 58, right = width - (compact ? 18 : 24), top = 25, bottom = height - 50;
    const x = (km: number) => left + (km - model.minKm) / (model.maxKm - model.minKm) * (right - left);
    const y = (fit: number) => bottom - fit / 100 * (bottom - top);
    // One viewBox unit per CSS pixel: full-width axes without stretching type or markers.
    plot.setAttribute('viewBox', `0 0 ${width} ${height}`);
    for (const fit of [0,25,50,75,100]) {
      content.append(svg('line', { x1: left, y1: y(fit), x2: right, y2: y(fit), class: 'scatter-grid' }),
        svg('text', { x: left - 9, y: y(fit) + 4, 'text-anchor': 'end', class: 'scatter-tick' }, String(fit)));
    }
    for (let i = 0; i <= 4; i++) {
      const km = model.minKm + (model.maxKm - model.minKm) * i / 4;
      content.append(svg('line', { x1: x(km), y1: top, x2: x(km), y2: bottom, class: 'scatter-grid' }),
        svg('text', { x: x(km), y: bottom + 21, 'text-anchor': 'middle', class: 'scatter-tick' }, number.format(km)));
    }
    const middleY = (top + bottom) / 2;
    content.append(svg('path', { d: `M${left},${top}V${bottom}H${right}`, class: 'scatter-axis' }),
      svg('text', { x: compact ? 11 : 15, y: middleY, transform: `rotate(-90 ${compact ? 11 : 15} ${middleY})`, 'text-anchor': 'middle', class: 'scatter-axis-label' }, 'Fit index'),
      svg('text', { x: (left + right) / 2, y: height - 6, 'text-anchor': 'middle', class: 'scatter-axis-label' }, compact ? 'Extra kilometres vs day off' : 'Additional kilometres vs day off'));
    for (const point of model.points) {
      const px = x(point.extraMetres / 1000), py = y(point.fit);
      const label = `${point.letter} · ${point.name}: ${number.format(point.fit)} fit, ${number.format(point.extraMetres / 1000)} extra km. Decision checks ${point.decisionStatus}${point.recommended ? '. Recommended' : ''}.`;
      const group = svg('g', { class: 'scatter-point', 'data-option-id': point.optionId, tabindex: onSelect === undefined ? -1 : 0,
        role: onSelect === undefined ? 'img' : 'button', 'aria-label': label,
        ...(onSelect === undefined ? {} : { 'aria-pressed': String(point.optionId === selectedOptionId) }) });
      group.append(svg('title', {}, `${label} Exact additional distance: ${point.extraMetres} metres.`));
      if (point.optionId === selectedOptionId) group.append(svg('circle', { cx: px, cy: py, r: 12, class: 'scatter-selected-ring' }));
      group.append(svg('circle', { cx: px, cy: py, r: 6, class: point.recommended ? 'scatter-dot is-recommended' :
        point.decisionStatus === 'FAIL' ? 'scatter-dot is-excluded' : 'scatter-dot' }));
      const leftLabel = px > left + (right - left) * .6;
      group.append(svg('text', { x: px + (leftLabel ? -16 : 16), y: py - 14, 'text-anchor': leftLabel ? 'end' : 'start', class: 'scatter-point-label' },
        `${point.letter} (${number.format(point.extraMetres / 1000)} km, ${number.format(point.fit)})`));
      if (onSelect !== undefined) {
        group.addEventListener('click', () => onSelect(point.optionId));
        group.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(point.optionId); }
        });
      }
      content.append(group);
    }
    if (drawing === undefined) plot.append(content);
    else drawing.replaceWith(content);
    drawing = content;
    if (activeId) [...content.querySelectorAll<SVGGElement>('[data-option-id]')]
      .find(point => point.getAttribute('data-option-id') === activeId)?.focus({ preventScroll: true });
  }
  draw(1300, 264);
  let mounted = false;
  const observer = new ResizeObserver(entries => {
    if (!figure.isConnected) { if (mounted) observer.disconnect(); return; }
    mounted = true;
    const bounds = entries[0]?.contentRect;
    if (bounds !== undefined) draw(Math.round(bounds.width), Math.round(bounds.height));
  });
  observer.observe(plot);
  const outside = html('div', 'scatter-unplotted');
  for (const item of model.unplotted) {
    const row = html('div', 'scatter-unplotted-row');
    const name = onSelect === undefined ? html('strong', '', `${item.letter} · ${item.name}`) : html('button', 'visual-text-button', `${item.letter} · ${item.name}`);
    if (name instanceof HTMLButtonElement) { name.type = 'button'; name.addEventListener('click', () => onSelect?.(item.optionId)); }
    row.append(name, html('span', '', `${item.extraMetres.status === 'known' ? `${number.format(item.extraMetres.value / 1000)} extra km. ` : ''}${item.reason}`));
    outside.append(row);
  }
  figure.append(heading, plot, outside, html('figcaption', 'visual-caption', 'Filled green = recommended. Red outline = excluded by a declared check. A black ring marks your selected option.'));
  return figure;
}

function tagSource(label: string, source: TagProvenance): HTMLElement {
  const paragraph = html('p', 'tag-provenance');
  paragraph.append(`${label}: ${source.source} · query ${source.queryId} · `);
  let url: URL | undefined;
  try { const parsed = new URL(source.reference); if (['https:', 'http:'].includes(parsed.protocol)) url = parsed; } catch { /* A recording ID need not be a URL. */ }
  if (url === undefined) paragraph.append(source.reference);
  else {
    const link = html('a', '', 'Source');
    link.href = url.href; link.target = '_blank'; link.rel = 'noreferrer'; paragraph.append(link);
  }
  paragraph.append(` · ${source.recordedAt.status === 'known' ? source.recordedAt.value : `time UNKNOWN (${source.recordedAt.reason})`}`);
  return paragraph;
}

export function renderTagBridge(evidence?: TagBridgeInput): HTMLElement {
  const card = html('section', 'tag-bridge visual-panel');
  const result = commonSourcedTags(evidence);
  const header = html('div', 'tag-bridge-heading');
  header.append(html('h3', 'visual-title', 'Tag Bridge'), html('span', result.status === 'unknown' ? 'tag-state is-unknown' : 'tag-state', result.status === 'unknown' ? 'UNKNOWN' : 'SOURCED'));
  card.append(header);
  if (result.status === 'unknown') {
    card.append(html('p', 'tag-bridge-reason', result.reason), html('p', 'visual-subtitle', 'Shared cultural tags will appear only when both sides have traceable evidence. No tags were inferred from names or fit scores.'));
  } else {
    const list = html('ul', 'tag-evidence-list');
    for (const tag of result.value) {
      const item = html('li');
      item.append(html('strong', 'tag-label', tag.label), tagSource(evidence!.left.label, tag.left), tagSource(evidence!.right.label, tag.right));
      list.append(item);
    }
    card.append(list);
  }
  card.append(html('p', 'visual-caption', 'Evidence only. Tag Bridge never changes the ranking or implies attendance.'));
  return card;
}
