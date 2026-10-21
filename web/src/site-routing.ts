const appPages = new Set(['route', 'options', 'breakpoint', 'evidence', 'audit', 'promoter', 'ai']);

/** The only cross-page state retained from a legacy landing URL. */
export type GuidedTourRequest = 'start' | 'resume';

export function guidedTourRequest(search: string): GuidedTourRequest | undefined {
  const values = new URLSearchParams(search).getAll('tour');
  return values.length === 1 && (values[0] === 'start' || values[0] === 'resume') ? values[0] : undefined;
}

/**
 * Compatibility for pre-landing bookmarks. Known app hashes move to the fixed
 * same-origin app path; marketing anchors and arbitrary URLs never redirect.
 */
export function legacyAppRedirect(location: { readonly pathname: string; readonly search: string; readonly hash: string }): string | undefined {
  if (location.pathname !== '/' && location.pathname !== '/index.html') return undefined;
  const hash = location.hash.startsWith('#') ? location.hash.slice(1) : '';
  const tour = guidedTourRequest(location.search);
  const page = appPages.has(hash) ? hash : tour === undefined ? undefined : 'route';
  if (page === undefined) return undefined;
  return `/app${tour === undefined ? '' : `?tour=${tour}`}#${page}`;
}
