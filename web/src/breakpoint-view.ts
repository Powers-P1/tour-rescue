import type { ApiDecisionResult, DecisionChanges } from './data.ts';
import type { NumericBreakpointAxis, NumericBreakpointParameter } from '../../src/core/breakpoint.ts';
import type { Knowledge } from '../../src/core/domain.ts';
import type { Recommendation } from '../../src/core/decision-types.ts';
import { formatDistance, formatFit, formatMoney, optionTitle, recommendedSummary } from './presentation.ts';

// UI selection survives a new immutable result render; it never enters the score or audit.
let selectedAxis: NumericBreakpointParameter = 'maxAdditionalDistanceMetres';

const labels: Record<NumericBreakpointParameter, { title: string; unit: string; description: string }> = {
  maxAdditionalDistanceMetres: {
    title: 'Extra distance cap', unit: 'metres',
    description: 'Maximum additional road distance compared with taking the cancelled date off.',
  },
  minimumFitIndex: {
    title: 'Minimum fit', unit: 'fit-index points',
    description: 'The minimum cultural fit a proposed show must meet. A day off has no fit index.',
  },
  additionalBudgetMinorUnits: {
    title: 'Venue-fee ceiling', unit: 'minor currency units',
    description: 'Venue fee only. Travel, accommodation and other unpriced costs are outside this ceiling.',
  },
};

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text: string, className: string, action: () => void): HTMLButtonElement {
  const node = element('button', className, text);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

function recommendationText(result: ApiDecisionResult, recommendation: Recommendation): string {
  return recommendation.status === 'recommended' ? optionTitle(result, recommendation.optionId)
    : recommendation.status === 'needs-evidence' ? 'More evidence needed' : 'No feasible option';
}

function currentValue(result: ApiDecisionResult, parameter: NumericBreakpointParameter): Knowledge<number> {
  if (parameter !== 'additionalBudgetMinorUnits') return { status: 'known', value: result.audit.replay.policy[parameter] };
  const budget = result.audit.replay.scenario.tour.constraints.additionalBudget;
  return budget.status === 'known' ? { status: 'known', value: budget.value.minorUnits } : budget;
}

function valueText(axis: NumericBreakpointAxis, value: number): string {
  if (axis.parameter === 'maxAdditionalDistanceMetres') return formatDistance(value, false, 3);
  if (axis.parameter === 'minimumFitIndex') return `${formatFit(value)} points`;
  return axis.currency.status === 'known' ? formatMoney({ currency: axis.currency.value, minorUnits: value })
    : `${value.toLocaleString('en-GB')} minor units (currency UNKNOWN)`;
}

function deltaText(axis: NumericBreakpointAxis, value: number): string {
  return `${value < 0 ? '−' : '+'}${valueText(axis, Math.abs(value))}`;
}

function changeSummary(baseline: ApiDecisionResult, current: ApiDecisionResult): string {
  const changes = baseline.audit.analysis.breakpoints.axes.flatMap(axis => {
    const a = currentValue(baseline, axis.parameter);
    const b = currentValue(current, axis.parameter);
    return a.status === 'known' && b.status === 'known' && a.value !== b.value
      ? [`${labels[axis.parameter].title}: ${valueText(axis, b.value)}`] : [];
  });
  return changes.length === 0 ? 'Original assumptions.' : changes.join(' · ');
}

/** Renders only the breakpoint controls and evidence; the app owns navigation and result cards. */
export function renderBreakpointView(
  baseline: ApiDecisionResult,
  current: ApiDecisionResult,
  onApply: (changes: DecisionChanges) => void,
  onReset: () => void,
): HTMLElement {
  const root = element('section', 'bp-view');
  root.setAttribute('aria-label', 'Decision breakpoint');
  const axes = baseline.audit.analysis.breakpoints.axes;
  if (!axes.some(axis => axis.parameter === selectedAxis)) selectedAxis = axes[0]?.parameter ?? 'maxAdditionalDistanceMetres';

  function render(): void {
    root.replaceChildren();
    const tabs = element('div', 'bp-tabs');
    tabs.setAttribute('role', 'group');
    tabs.setAttribute('aria-label', 'Assumption to test');
    for (const axis of axes) {
      const tab = button(labels[axis.parameter].title, 'bp-tab', () => {
        selectedAxis = axis.parameter;
        render();
        root.querySelector<HTMLButtonElement>('.bp-tab[aria-pressed="true"]')?.focus();
      });
      tab.setAttribute('aria-pressed', String(selectedAxis === axis.parameter));
      tabs.append(tab);
    }
    root.append(tabs);
    const axis = axes.find(row => row.parameter === selectedAxis);
    if (axis === undefined) {
      root.append(element('p', 'bp-note', 'UNKNOWN: no supported breakpoint axes were returned.'));
      return;
    }
    const spec = labels[axis.parameter];
    const currentScalar = currentValue(current, axis.parameter);
    const panel = element('section', 'panel bp-panel');
    const intro = element('div', 'bp-intro');
    intro.append(element('h2', 'bp-heading', spec.title), element('p', 'bp-description', spec.description));
    intro.append(element('p', 'bp-range', `Checked range: ${valueText(axis, axis.range.minimum)} to ${valueText(axis, axis.range.maximum)}.`));
    intro.append(element('p', 'bp-resolution', `Resolution: 1 ${axis.unit === 'metres' ? 'metre' : axis.unit === 'fit-index-points' ? 'fit-index point' : 'minor currency unit'}.`));
    panel.append(intro);

    const controls = element('div', 'bp-controls');
    const currentKnown = currentScalar.status === 'known';
    let draft = currentKnown ? currentScalar.value : axis.range.minimum;
    const draftHeading = element('div', 'bp-draft-heading');
    draftHeading.append(element('span', 'bp-overline', 'Test one assumption'));
    const output = element('output', 'bp-draft-value', currentKnown ? valueText(axis, draft) : 'UNKNOWN');
    output.setAttribute('aria-live', 'polite');
    draftHeading.append(output);
    controls.append(draftHeading);

    const range = element('input', 'bp-slider');
    range.type = 'range';
    range.id = `bp-slider-${axis.parameter}`;
    range.min = String(axis.range.minimum);
    range.max = String(axis.range.maximum);
    range.step = '1';
    range.value = String(draft);
    range.disabled = !currentKnown;
    range.setAttribute('aria-label', `${spec.title}, ${spec.unit}`);
    controls.append(range);
    const limits = element('div', 'bp-slider-limits');
    limits.append(element('span', '', valueText(axis, axis.range.minimum)), element('span', '', valueText(axis, axis.range.maximum)));
    controls.append(limits);
    const markers = element('p', 'bp-markers');
    markers.append(element('span', 'bp-baseline-marker', `Baseline: ${axis.baselineValue.status === 'known' ? valueText(axis, axis.baselineValue.value) : 'UNKNOWN'}`));
    if (axis.witness.status === 'known') markers.append(element('span', 'bp-witness-marker', `Witnessed change: ${valueText(axis, axis.witness.value.after)}`));
    controls.append(markers);

    const exactRow = element('div', 'bp-exact-row');
    const exactLabel = element('label', 'bp-exact-label', `Exact value (${axis.parameter === 'additionalBudgetMinorUnits' && axis.currency.status === 'known' ? `${axis.currency.value} minor units` : spec.unit})`);
    exactLabel.htmlFor = `bp-exact-${axis.parameter}`;
    const exact = element('input', 'bp-exact-input');
    exact.type = 'number';
    exact.inputMode = 'numeric';
    exact.id = exactLabel.htmlFor;
    exact.min = range.min;
    exact.max = range.max;
    exact.step = '1';
    exact.value = currentKnown ? String(draft) : '';
    exact.placeholder = currentKnown ? '' : 'UNKNOWN';
    exact.disabled = !currentKnown;
    const validation = element('p', 'bp-validation');
    validation.id = `bp-validation-${axis.parameter}`;
    validation.setAttribute('role', 'status');
    exact.setAttribute('aria-describedby', validation.id);
    exactLabel.append(exact);
    exactRow.append(exactLabel);
    const apply = button('Apply this value', 'button button-primary bp-apply', () => {
      if (!validateDraft()) return;
      onApply({ [axis.parameter]: draft });
    });
    apply.disabled = !currentKnown;
    exactRow.append(apply);
    controls.append(exactRow, validation);

    function updateRangePaint(): void {
      const span = axis!.range.maximum - axis!.range.minimum;
      const percentage = span === 0 ? 0 : ((draft - axis!.range.minimum) / span) * 100;
      range.style.setProperty('--bp-progress', `${Math.max(0, Math.min(100, percentage))}%`);
      range.setAttribute('aria-valuetext', currentKnown ? valueText(axis!, draft) : 'UNKNOWN');
    }
    function validateDraft(): boolean {
      const value = Number(exact.value);
      const valid = exact.value.trim() !== '' && Number.isSafeInteger(value) && value >= axis!.range.minimum && value <= axis!.range.maximum;
      validation.textContent = valid ? '' : `Enter a whole number from ${axis!.range.minimum.toLocaleString('en-GB')} to ${axis!.range.maximum.toLocaleString('en-GB')}.`;
      exact.setAttribute('aria-invalid', String(!valid));
      apply.disabled = !valid || !currentKnown;
      if (valid) {
        draft = value;
        range.value = String(value);
        output.textContent = valueText(axis!, draft);
        updateRangePaint();
      }
      return valid;
    }
    range.addEventListener('input', () => {
      draft = Number(range.value);
      exact.value = String(draft);
      output.textContent = valueText(axis, draft);
      validation.textContent = '';
      exact.setAttribute('aria-invalid', 'false');
      apply.disabled = !currentKnown;
      updateRangePaint();
    });
    exact.addEventListener('input', validateDraft);
    exact.addEventListener('keydown', event => {
      if (event.key === 'Enter' && validateDraft()) { event.preventDefault(); onApply({ [axis.parameter]: draft }); }
    });
    updateRangePaint();
    if (!currentKnown) controls.append(element('p', 'bp-note', currentScalar.reason));
    controls.append(element('p', 'bp-note', 'Apply changes this assumption only. The other two assumptions return to baseline. No new provider request is made.'));
    panel.append(controls);
    root.append(panel);

    const outcome = element('section', `bp-outcome bp-${axis.status}`);
    outcome.setAttribute('aria-label', 'Baseline breakpoint result');
    const outcomeText = element('div');
    const title = axis.status === 'found' ? 'Breakpoint found' : axis.status === 'not-found'
      ? 'No decision change found in the checked range' : axis.status === 'unknown' ? 'UNKNOWN: the breakpoint is unresolved'
        : 'No baseline recommendation to reverse';
    outcomeText.append(element('h3', '', title));
    if (axis.witness.status === 'known') {
      const witness = axis.witness.value;
      outcomeText.append(element('p', 'bp-witness-sentence', `${valueText(axis, witness.before)} → ${valueText(axis, witness.after)} (${deltaText(axis, witness.delta)}): ${recommendationText(baseline, baseline.audit.analysis.breakpoints.baseline.recommendation)} → ${recommendationText(baseline, witness.decision.recommendation)}.`));
    }
    outcomeText.append(element('p', 'bp-outcome-reason', axis.reason));
    outcomeText.append(element('p', 'bp-range-detail', `Scope: ${valueText(axis, axis.range.minimum)} to ${valueText(axis, axis.range.maximum)}; ${axis.checkedValues.length} critical values checked.`));
    outcome.append(outcomeText);
    if (axis.witness.status === 'known') {
      const after = axis.witness.value.after;
      outcome.append(button('Apply breakpoint', 'button button-secondary bp-witness-button', () => onApply({ [axis.parameter]: after })));
    }
    root.append(outcome);

    const comparison = element('div', 'bp-comparison');
    const before = element('div', 'bp-recommendation');
    before.append(element('span', 'bp-overline', 'Baseline recommendation'), element('strong', '', recommendedSummary(baseline)), element('p', '', 'Original assumptions.'));
    const after = element('div', 'bp-recommendation bp-current');
    after.append(element('span', 'bp-overline', 'Current recommendation'), element('strong', '', recommendedSummary(current)), element('p', '', changeSummary(baseline, current)));
    comparison.append(before, after, button('Reset to baseline', 'button button-secondary bp-reset', onReset));
    root.append(comparison);

    const details = element('details', 'bp-samples');
    details.append(element('summary', '', 'Inspect the checked values'));
    const table = element('table', 'bp-table');
    const caption = element('caption', '', 'Decision boundaries and range endpoints, not a sampled certainty estimate.');
    const head = element('thead');
    const headRow = element('tr');
    for (const label of [spec.title, 'Recommendation', 'Interpretation']) {
      const th = element('th', '', label); th.scope = 'col'; headRow.append(th);
    }
    head.append(headRow);
    const body = element('tbody');
    for (const sample of axis.checkedValues) {
      const row = element('tr');
      const isBaseline = axis.baselineValue.status === 'known' && sample.value === axis.baselineValue.value;
      const isWitness = axis.witness.status === 'known' && sample.value === axis.witness.value.after;
      row.append(element('td', '', valueText(axis, sample.value)), element('td', '', recommendationText(baseline, sample.recommendation)),
        element('td', '', isBaseline ? 'Baseline' : isWitness ? 'Witnessed decision change' : sample.recommendation.status === 'needs-evidence' ? 'UNKNOWN' : 'Checked critical value'));
      body.append(row);
    }
    if (axis.checkedValues.length === 0) {
      const row = element('tr'); const cell = element('td', '', 'No comparable values could be checked.'); cell.colSpan = 3; row.append(cell); body.append(row);
    }
    table.append(caption, head, body);
    const tableWrap = element('div', 'bp-table-wrap'); tableWrap.append(table); details.append(tableWrap);
    root.append(details);

    const sensitivity = baseline.audit.analysis.artistSensitivity;
    const sensitivityNote = element('p', 'bp-sensitivity-note');
    const retention = sensitivity.summary.retainedRecommendationFraction;
    sensitivityNote.append(document.createTextNode(retention.status === 'known'
      ? `Comparison-artist sensitivity: ${sensitivity.summary.retainedRuns} of ${sensitivity.summary.totalRuns} omission tests retain the baseline recommendation. `
      : `Comparison-artist sensitivity: ${sensitivity.status === 'not-applicable' ? 'not applicable' : 'UNKNOWN'}. ${sensitivity.reason} `));
    const evidence = element('a', '', 'View evidence and leave-one-out results'); evidence.href = '#evidence'; sensitivityNote.append(evidence);
    root.append(sensitivityNote);
  }
  render();
  return root;
}
