/** User and provider strings always enter the UI as text, never as HTML. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(label: string, action: () => void, className = 'button button-secondary'): HTMLButtonElement {
  const node = el('button', className, label);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

export function badge(status: string, label = status): HTMLElement {
  return el('span', `status-badge status-${status.toLowerCase()}`, label);
}

const paths = {
  lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5zM12 14v3',
  arrow: 'M4 12h16M14 6l6 6-6 6',
  check: 'M5 12l4 4L19 6',
  close: 'M6 6l12 12M18 6L6 18',
  road: 'M8 3 5 21M16 3l3 18M12 3v4M12 10v4M12 17v4',
  clock: 'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  gap: 'M2 12h20M6 8l-4 4 4 4M18 8l4 4-4 4',
  download: 'M12 3v12M7 10l5 5 5-5M4 16v5h16v-5',
} as const;

export function icon(name: keyof typeof paths): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', paths[name]);
  svg.append(path);
  return svg;
}

export function downloadJson(value: unknown, name: string): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = el('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function announce(message: string): void {
  const region = document.getElementById('announcer');
  if (region) region.textContent = message;
}
