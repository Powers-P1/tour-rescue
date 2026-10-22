/** Shared 24px outline icons; decorative, with labels supplied by each control. */
const paths = {
  home: '<path d="m3 10 9-7 9 7v11h-6v-7H9v7H3Z"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  people: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3"/>',
  crew: '<circle cx="12" cy="6" r="3"/><path d="M5 21v-5a7 7 0 0 1 14 0v5ZM9 13v4h6v-4"/>',
  document: '<path d="M5 2h9l5 5v15H5ZM14 2v6h5M9 12h6m-6 4h6"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 10h18m-12 6 2 2 4-4"/>',
  route: '<path d="M5 20V7h14m-5-5 5 5-5 5"/>',
  back: '<path d="m14 5-7 7 7 7"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  wrench: '<path d="M14 4a6 6 0 0 0-6 8L2 18a3 3 0 0 0 4 4l6-6a6 6 0 0 0 8-8l-4 4-4-4 4-4Z"/>',
  share: '<circle cx="18" cy="4" r="3"/><circle cx="5" cy="12" r="3"/><circle cx="18" cy="20" r="3"/><path d="m8 10 7-4M8 14l7 4"/>',
} as const;
export type IconName = keyof typeof paths;
export const icon = (name: IconName): string => '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>';
export const brand = (): string => 'TOUR RESCUE <span class="brand-turn">'+icon('route')+'</span>';
