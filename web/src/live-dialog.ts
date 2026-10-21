import { ApiError, createApiClient, validateLiveSelection } from './data.ts';
import type { ApiDecisionResult, ArtistChoice, LiveSelection } from './data.ts';
import { announce, button, el } from './dom.ts';

type ArtistRole = 'target' | 'comparison' | 'control';
type HealthState = 'checking' | 'enabled' | 'disabled' | 'failed';
const name = (artist: ArtistChoice) => artist.name?.trim() || `Name UNKNOWN (${artist.id})`;

/** Each search and rescue is an explicit, bounded user action. Closing aborts in-flight work. */
export function openLiveDialog(
  workerOrigin: string,
  current: ApiDecisionResult,
  onResult: (result: ApiDecisionResult) => void,
): void {
  if (document.querySelector('.live-dialog')) return;
  const dialog = el('dialog', 'live-dialog');
  dialog.setAttribute('aria-labelledby', 'live-dialog-title');
  dialog.setAttribute('aria-describedby', 'live-dialog-description');
  const previousFocus = document.activeElement;
  const controller = new AbortController();
  let closed = false;
  let busy = false;
  let health: HealthState = 'checking';
  let target: ArtistChoice | undefined;
  let control: ArtistChoice | undefined;
  let comparisons: ArtistChoice[] = [];
  let searchResults: readonly ArtistChoice[] = [];
  let searchPerformed = false;
  let selectionRole: ArtistRole = 'target';
  if (current.mode === 'live') {
    try {
      const initial = validateLiveSelection(current.artists);
      target = initial.target;
      control = initial.control;
      comparisons = [...initial.comparisons];
    } catch { /* Unsupported identities are never silently reused as provider IDs. */ }
  }

  const header = el('header', 'live-dialog-header');
  const title = el('h2', '', 'Bring your artist into the model');
  title.id = 'live-dialog-title';
  const dismiss = () => {
    if (closed) return;
    closed = true;
    controller.abort();
    if (dialog.open) dialog.close();
    dialog.remove();
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
  };
  header.append(title, button('Close', dismiss, 'button button-secondary live-close'));
  const description = el('p', 'live-description', 'Use live Qloo taste evidence with the same frozen Germany route and city set. Venue inputs are fictional; this does not verify a booking.');
  description.id = 'live-dialog-description';
  const connection = el('div', 'live-connection');
  connection.setAttribute('role', 'status');
  const connectionText = el('p', '', 'Checking whether live mode is available…');
  const retryHealth = button('Check again', () => { void checkHealth(); }, 'button button-secondary');
  retryHealth.hidden = true;
  connection.append(connectionText, retryHealth);
  const errorBox = el('p', 'live-error');
  errorBox.setAttribute('role', 'alert');
  errorBox.hidden = true;
  const progress = el('p', 'live-progress');
  progress.setAttribute('role', 'status');
  const selected = el('section', 'live-selected');
  selected.setAttribute('aria-label', 'Selected artists');

  const form = el('form', 'live-search-form');
  form.noValidate = true;
  const roleLabel = el('label', 'live-field');
  roleLabel.append(el('span', '', 'Add artist as'));
  const roleSelect = el('select');
  roleSelect.name = 'role';
  for (const [value, text] of [['target', 'Target artist'], ['comparison', 'Comparison artist'], ['control', 'Control artist']] as const) {
    const option = el('option', '', text);
    option.value = value;
    roleSelect.append(option);
  }
  roleLabel.append(roleSelect);
  const queryLabel = el('label', 'live-field live-query-field');
  queryLabel.append(el('span', '', 'Artist name'));
  const query = el('input');
  query.name = 'query';
  query.type = 'search';
  query.maxLength = 120;
  query.minLength = 2;
  query.placeholder = 'Search Qloo artists';
  query.autocomplete = 'off';
  queryLabel.append(query);
  const searchButton = button('Search artists', () => {}, 'button button-primary');
  searchButton.type = 'submit';
  form.append(roleLabel, queryLabel, searchButton);
  const resultList = el('div', 'live-results');
  resultList.setAttribute('aria-label', 'Artist search results');
  const comparisonNote = el('p', 'live-comparison-note');
  const limits = el('p', 'live-limits', 'Default daily allowance: 150 live actions in total and 25 per network address. Each search and rescue uses one action. Checking availability is free.');
  const footer = el('footer', 'live-dialog-footer');
  const runButton = button('Run live rescue', () => { void runRescue(); }, 'button button-primary');
  footer.append(button('Keep current result', dismiss, 'button button-secondary'), runButton);
  dialog.append(header, description, connection, errorBox, selected, form, resultList, comparisonNote, progress, limits, footer);

  function active(): boolean { return !closed && dialog.open && !controller.signal.aborted; }
  function clearError(): void { errorBox.hidden = true; errorBox.textContent = ''; }
  function fail(error: unknown): void {
    if (!active()) return;
    const message = error instanceof ApiError ? error.message : 'The live request could not be completed. Your current result has not changed.';
    const retry = error instanceof ApiError && error.retryAfterSeconds !== undefined
      ? ` Retry after ${error.retryAfterSeconds} seconds.` : '';
    errorBox.textContent = `${message}${retry}`;
    errorBox.hidden = false;
    if (error instanceof ApiError && error.code === 'LIVE_DISABLED') {
      health = 'disabled';
      connectionText.textContent = 'Live mode is currently disabled. Your current result is unchanged.';
      retryHealth.hidden = false;
    }
  }
  function selectedArtists(): readonly ArtistChoice[] {
    return [...(target ? [target] : []), ...comparisons, ...(control ? [control] : [])];
  }
  function updateControls(): void {
    const unavailable = health !== 'enabled' || busy;
    searchButton.disabled = unavailable;
    query.disabled = unavailable;
    roleSelect.disabled = unavailable;
    retryHealth.disabled = busy || health === 'checking';
    runButton.disabled = unavailable || !target || !control;
    for (const remove of selected.querySelectorAll<HTMLButtonElement>('button')) remove.disabled = busy;
    runButton.textContent = busy && progress.textContent?.startsWith('Reading') ? 'Checking options…' : 'Run live rescue';
    comparisonNote.textContent = comparisons.length === 0
      ? 'No comparison artists selected: the target has 100% of the fit weight; leave-one-out is not applicable. A distinct control artist is required.'
      : `${comparisons.length}/3 comparison artists selected. The target has 50% of the fit weight; comparisons share the other 50%. The separate control does not enter the ranking.`;
    renderResults();
  }
  function renderSelected(): void {
    selected.replaceChildren();
    const group = (label: string, artists: readonly ArtistChoice[], remove: (id: string) => void, empty: string) => {
      const block = el('div', 'live-selection-group');
      block.append(el('h3', '', label));
      if (artists.length === 0) block.append(el('p', 'live-empty', empty));
      for (const artist of artists) {
        const chip = el('div', 'live-artist-chip');
        const text = el('span', '', name(artist));
        const removeButton = button('Remove', () => { if (!busy) { remove(artist.id); clearError(); renderSelected(); updateControls(); } }, 'live-remove');
        removeButton.setAttribute('aria-label', `Remove ${name(artist)} from ${label.toLowerCase()}`);
        chip.append(text, removeButton);
        block.append(chip);
      }
      selected.append(block);
    };
    group('Target artist', target ? [target] : [], () => { target = undefined; }, 'Required: the touring artist.');
    group('Comparison artists', comparisons, id => { comparisons = comparisons.filter(artist => artist.id !== id); }, 'Optional: choose up to three.');
    group('Control artist', control ? [control] : [], () => { control = undefined; }, 'Required: a different artist for the control run.');
  }
  function choose(artist: ArtistChoice): void {
    if (!active() || busy || health !== 'enabled' || selectedArtists().some(row => row.id === artist.id)) return;
    if (selectionRole === 'target') target = artist;
    else if (selectionRole === 'control') control = artist;
    else if (comparisons.length < 3) comparisons.push(artist);
    else return;
    clearError();
    renderSelected();
    updateControls();
    progress.textContent = `${name(artist)} selected as ${selectionRole === 'comparison' ? 'a comparison artist' : `${selectionRole} artist`}.`;
  }
  function renderResults(): void {
    resultList.replaceChildren();
    if (!searchPerformed) return;
    if (searchResults.length === 0) {
      resultList.append(el('p', 'live-empty', 'No artists found. Try a more specific name.'));
      return;
    }
    resultList.append(el('p', 'live-results-heading', 'Choose an exact match. Typing a name does not select an artist.'));
    const used = new Set(selectedArtists().map(artist => artist.id));
    for (const artist of searchResults) {
      const row = el('div', 'live-search-result');
      const alreadySelected = used.has(artist.id);
      const limitReached = selectionRole === 'comparison' && comparisons.length >= 3;
      const chooseButton = button(alreadySelected ? 'Selected' : `Use as ${selectionRole}`, () => choose(artist), 'button button-secondary');
      chooseButton.disabled = busy || health !== 'enabled' || alreadySelected || limitReached;
      chooseButton.setAttribute('aria-label', `${alreadySelected ? 'Selected artist' : `Use as ${selectionRole}`}: ${name(artist)}`);
      const identity = el('div', 'live-result-identity');
      identity.append(el('strong', '', name(artist)));
      const details = el('details', 'live-identity-detail');
      details.append(el('summary', '', 'Artist ID'), el('code', '', artist.id));
      identity.append(details);
      row.append(identity, chooseButton);
      resultList.append(row);
    }
    if (selectionRole === 'comparison' && comparisons.length >= 3) resultList.append(el('p', 'live-empty', 'Three comparison slots are filled. Remove one to choose another.'));
  }
  async function checkHealth(): Promise<void> {
    if (!active() || busy) return;
    health = 'checking';
    clearError();
    retryHealth.hidden = true;
    connectionText.textContent = 'Checking whether live mode is available…';
    updateControls();
    try {
      const response = await createApiClient(workerOrigin).health(controller.signal);
      if (!active()) return;
      health = response.liveEnabled ? 'enabled' : 'disabled';
      connectionText.textContent = response.liveEnabled ? 'Live mode is available. Search and select your artists below.'
        : 'Live mode is currently disabled. Close this window to keep your current result.';
      retryHealth.hidden = response.liveEnabled;
    } catch (error) {
      if (!active()) return;
      health = 'failed';
      connectionText.textContent = 'Live availability could not be checked. Your current result is unchanged.';
      retryHealth.hidden = false;
      fail(error);
    } finally { if (active()) updateControls(); }
  }
  async function search(): Promise<void> {
    if (!active() || busy || health !== 'enabled') return;
    busy = true;
    clearError();
    searchResults = [];
    searchPerformed = false;
    progress.textContent = 'Searching Qloo for matching artists…';
    updateControls();
    try {
      const artists = await createApiClient(workerOrigin).search(query.value, controller.signal);
      if (!active()) return;
      searchResults = artists;
      searchPerformed = true;
      progress.textContent = `${artists.length} ${artists.length === 1 ? 'artist' : 'artists'} returned. Choose a result to add it.`;
    } catch (error) { if (active()) { progress.textContent = ''; fail(error); } }
    finally { if (active()) { busy = false; updateControls(); } }
  }
  async function runRescue(): Promise<void> {
    if (!active() || busy || health !== 'enabled' || !target || !control) return;
    const selection: LiveSelection = { target, comparisons: [...comparisons], control };
    const budget = current.audit.replay.scenario.tour.constraints.additionalBudget;
    if (budget.status !== 'known' || budget.value.currency !== 'EUR') {
      fail(new ApiError(400, 'INVALID_BUDGET', 'Live mode needs a known EUR venue-fee ceiling. Keep the current result and review the audit.'));
      return;
    }
    busy = true;
    clearError();
    progress.textContent = 'Reading Qloo profiles, checking the three options and creating their audit…';
    updateControls();
    try {
      const result = await createApiClient(workerOrigin).rescue(selection, current.audit.replay.policy, budget.value.minorUnits, controller.signal);
      if (!active()) return;
      onResult(result);
      dismiss();
      document.querySelector<HTMLElement>('#app h1')?.focus({ preventScroll: true });
      announce(result.audit.analysis.decision.recommendation.status === 'needs-evidence'
        ? 'Live result loaded. More evidence is needed; review UNKNOWN checks.' : 'Live result and audit loaded.');
    } catch (error) { if (active()) { progress.textContent = ''; fail(error); } }
    finally { if (active()) { busy = false; updateControls(); } }
  }
  roleSelect.addEventListener('change', () => {
    selectionRole = roleSelect.value as ArtistRole;
    renderResults();
  });
  form.addEventListener('submit', event => { event.preventDefault(); void search(); });
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
  dialog.addEventListener('close', dismiss);
  renderSelected();
  updateControls();
  document.body.append(dialog);
  dialog.showModal();
  void checkHealth();
}
