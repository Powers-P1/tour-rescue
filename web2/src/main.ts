import './styles.css';
import './desktop.css';
import './germany-map.css';
import './completion.css';
import './judge-workflow.css';
import '../../web/src/guided-tour.css';
import { icon, brand } from './icons.ts';
import { isWorkspaceScreen, workspaceView } from './workspace-views.ts';
import type { WorkspaceScreen } from './workspace-views.ts';
import { renderGermanyGeographicMap } from './germany-map.ts';
import { setMapKeyDefaults } from './map-disclosure.ts';
import { createDemoResult, createApiClient } from '../../web/src/data.ts';
import type { ApiDecisionResult, ArtistChoice, LiveSelection } from '../../web/src/data.ts';
import { buildPromoterModel } from '../../web/src/promoter-model.ts';
import type { PromoterSheetModel } from '../../web/src/promoter-model.ts';
import { initialIncident, isFocusedRescue, transitionIncident } from './state.ts';
import type { IncidentState } from './state.ts';
import { projectRescue, UNKNOWN } from './model.ts';
import type { RescueOption, RescueProjection } from './model.ts';
import { SAMPLE_ECONOMICS, evaluateEconomics, SAMPLE_PLAN_BRIEF, initialSosSample, restoreSosHistory, selectedSupplier, summarizePlanBrief, transitionSosSample } from './extension-state.ts';
import type { EconomicsAssumptions, PlanSummary, SosSampleState, SosStage, SosSupplierId } from './extension-state.ts';
import { isExtensionScreen, renderExtension } from './extension-views.ts';
import type { ExtensionContext, ExtensionScreen } from './extension-views.ts';
import { AI_DEMO_SCENARIOS, createAiDemoSession } from '../../src/ai/demo.ts';
import type { AiDemoScenarioId } from '../../src/ai/demo.ts';
import { acceptResearchIntoComparison, emptyResearch } from './research-comparison.ts';
import { safeAiSourceUrl } from '../../src/ai/tools.ts';
import { createGuidedTour } from '../../web/src/guided-tour.ts';
import type { GuidedTourController } from '../../web/src/guided-tour.ts';
import { downloadPromoterPng, installPromoterPrintSizing } from '../../web/src/promoter.ts';
import { mountEvidence, recommendationName } from './evidence-view.ts';
import { initPwa } from './pwa.ts';
import {loadKnowledge,saveKnowledge,putDocument,withBandProfile} from './knowledge-store.ts';
import type {TourSkill} from '../../src/ai/knowledge.ts';
import { LIVE_PRESETS } from './live-presets.ts';
import { renderLiveStudyReport, renderRecordedQlooStudy } from './live-study-view.ts';
import {guideObjective} from './guide-objectives.ts';
import { createAiClient } from '../../web/src/ai-client.ts';
import { hadMountedScreen, selectFocusTarget } from './focus-policy.ts';
import { projectAudience, projectSimulation, loadSimulation, saveSimulation, simulationDraftScope } from './desktop-model.ts';
import { createWorkspaceHistory, isWorkspaceHistoryKey, canonicalWorkspaceHash, workspaceScreenHash } from './workspace-history.ts';
import { auditExport } from './audit-download.ts';
import { parseExtraDistanceKm } from './simulation-input.ts';
import { nextRovingIndex } from './keyboard-navigation.ts';
import type { AudienceSource, AudienceModel, SimulationModel, AgencyOwner } from './desktop-model.ts';
import { renderDesktopFeature, isDesktopScreen } from './desktop-views.ts';
import type { DesktopViewContext, DesktopScreen } from './desktop-views.ts';
import type { AiSessionResult, AiStep } from '../../src/ai/types.ts';

declare const __WORKER_ORIGIN__: string;

type Screen = 'today' | 'options' | 'detail' | 'draft' | 'crew' | 'evidence' | 'live-preset' | ExtensionScreen | DesktopScreen | WorkspaceScreen;
type ArtistRole = 'target' | 'comparison' | 'control';
const api = createApiClient(__WORKER_ORIGIN__);
const aiApi = createAiClient(__WORKER_ORIGIN__);
const root = document.getElementById('app');
const printRoot = document.getElementById('print-area');
if (!root || !printRoot) throw new Error('The application root is missing.');
installPromoterPrintSizing('#print-area .sheet-paper');

let result: ApiDecisionResult = createDemoResult();
let projection: RescueProjection = projectRescue(result);
let incident: IncidentState = initialIncident();
let screen: Screen = window.location.hash === '#fan' ? 'fan' : 'today';
let sos: SosSampleState = initialSosSample();
let sosReturnScreen: Screen = 'today';
let planBrief = SAMPLE_PLAN_BRIEF;
let planSummary: PlanSummary | null = null;
let economicsExpanded = false;
let economics: EconomicsAssumptions = {...SAMPLE_ECONOMICS};
let economicsError = "";
let economicsDraft: Record<string,string> = {};
let bandProfile = (() => { try { return localStorage.getItem('tour-rescue.band-profile.v1') ?? 'Five-piece indie band. Club shows. We prefer university cities and avoid night drives.'; } catch { return 'Five-piece indie band. Club shows. We prefer university cities and avoid night drives.'; } })();
let workspaceReturn: Screen = 'route';
let tourKnowledge=loadKnowledge();
let noteId='',noteTitle='',noteText='';
let aiSkill:TourSkill='corridor-repair';
let workspaceAgency = false;
let lastRenderedScreen: Screen | null = null;
let followingLocation = false;
let fanPreviewed = false;
let aiMode: 'demo' | 'live' = 'demo';
let aiBusy = false;
let aiNotice = '';
let aiSession: AiSessionResult | null = null;
let aiDemoScenario: AiDemoScenarioId = 'corridor-repair';
let researchHistory = emptyResearch();
let aiSteps: AiStep[] = [];
let aiAbort: AbortController | null = null;
let aiGeneration = 0;
let liveResearchBaseRunId:string|null=null;
let audienceModel: AudienceModel = projectAudience(result);
let audienceSource: AudienceSource = 'qloo';
let selectedAudienceCityId = audienceModel.places[0]?.cityId ?? '';
let audienceEvidenceOpen = false;
let audienceZoom = 1;
let simulationModel: SimulationModel | null = null;
let simulationTab: 'route' | 'budget' = 'route';
let simSaved = false;
let simCapDraft:string|null=null;
let simCapError='';
let simChooseCity = false;
let proposalFromSimulation = false;
let proposalReturn: Screen | null = null;
let proposalSource: ApiDecisionResult | null = null;
let agencyFilter: 'attention' | 'all' = 'attention';
const agencyOwners: Partial<Record<'drum'|'leipzig'|'presale',AgencyOwner>> = {};
let agencyAssignOpen: 'drum'|'leipzig'|'presale'|null = null;
let agencyProposedOwner: AgencyOwner = 'Alex';
let agencyNotice = '';
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
let notice = '';
let proposalContact = '';
let proposalMessage = '';
let reviewingMessage = false;
let chosenProposal: PromoterSheetModel | null = null;
let evidenceSource:ApiDecisionResult|null=null;
let evidenceOptionId='';
let guide:GuidedTourController|undefined;
let guideEvidenceReads=0,guideExports=0;
let livePresetId=LIVE_PRESETS[0]!.id;
let liveWorkerVersion='UNKNOWN';
function captureGuideWorkspace() {
 return {result,projection,incident,screen,pendingId,researchHistory,aiSession,aiSteps,aiMode,aiDemoScenario,aiNotice,liveResearchBaseRunId,
   simulationModel,simulationTab,simSaved,simCapDraft,simCapError,simChooseCity,evidenceSource,evidenceOptionId,
   chosenProposal,proposalSource,proposalReturn,proposalFromSimulation,proposalMessage,proposalContact,reviewingMessage,
   audienceModel,selectedAudienceCityId,showEvidence,notice};
}
let guideWorkspace:ReturnType<typeof captureGuideWorkspace>|null=null;
const historyWorkspaces=createWorkspaceHistory<ReturnType<typeof captureGuideWorkspace>>();
function restoreWorkspace(workspace:ReturnType<typeof captureGuideWorkspace>):void{
 ({result,projection,incident,screen,pendingId,researchHistory,aiSession,aiSteps,aiMode,aiDemoScenario,aiNotice,liveResearchBaseRunId,
   simulationModel,simulationTab,simSaved,simCapDraft,simCapError,simChooseCity,evidenceSource,evidenceOptionId,
   chosenProposal,proposalSource,proposalReturn,proposalFromSimulation,proposalMessage,proposalContact,reviewingMessage,
   audienceModel,selectedAudienceCityId,showEvidence,notice}=workspace);
}
function rememberWorkspaceHistory():void{
 if(guideWorkspace||screen.startsWith('sos-'))return;
 const id=historyWorkspaces.remember(history.state?.tourRescueWorkspace,captureGuideWorkspace());
 history.replaceState({...history.state,screen,tourRescueWorkspace:id},'');
}
function beginGuide():void {
 guideEvidenceReads=0;guideExports=0;
 guideWorkspace=captureGuideWorkspace();
 result=createDemoResult();projection=projectRescue(result);incident=initialIncident();
 pendingId=projection.options.find(row=>row.recommended)?.id??projection.options[0]!.id;
 researchHistory=emptyResearch();aiSession=null;aiSteps=[];aiMode='demo';aiDemoScenario='corridor-repair';aiNotice='';liveResearchBaseRunId=null;
 simulationModel=null;simSaved=false;simCapDraft=null;simCapError='';evidenceSource=null;chosenProposal=null;
 audienceModel=projectAudience(result);selectedAudienceCityId=audienceModel.places[0]?.cityId??'';notice='';
}
function finishGuide():void {
 if(guideWorkspace)restoreWorkspace(guideWorkspace);
 guideWorkspace=null;render();
}
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
      ? '<button type="button" class="back-button" data-action="back" aria-label="Go back">' + icon('back') + '<span>' + HTML(context || 'Back') + '</span></button>'
      : '<div class="wordmark">' + brand() + '</div>') +
    '<button class="sos-button" type="button" data-action="sos">SOS</button></header>';
}
function mobileTabs(): string {
  const active = screen === 'crew' ? 'Crew' : isExtensionScreen(screen) && screen !== 'fan' ? 'Route' :
    (isDesktopScreen(screen) || ['options', 'detail', 'draft'].includes(screen)) ? 'Route' : 'Today';
  return '<nav class="mobile-tabs" aria-label="Main navigation">' +
    (['Today', 'Route', 'Crew'] as const).map(label =>
      '<button type="button" data-action="tab-' + label.toLowerCase() + '" class="' + (label === active ? 'active' : '') + '">' +
      icon(label === 'Today' ? 'calendar' : label === 'Route' ? 'pin' : 'people') + label + '</button>').join('') +
    '</nav>';
}
function sidebar(): string {
  if (screen === 'agency' || (isWorkspaceScreen(screen) && workspaceAgency)) {
    const nav = [
      { label:'Overview', action:'agency-overview' }, { label:'Tours', action:'agency-all' },
      { label:'Team', action:'agency-team' }, { label:'Documents', action:'agency-documents' },
    ];
    return '<aside class="sidebar" aria-label="Agency workspace">' +
      '<div class="wordmark brand-desktop">' + brand() + '</div>' +
      '<p class="eyebrow">AGENCY · SAMPLE</p><nav class="side-nav" aria-label="Agency navigation">' +
      nav.map(item => '<button type="button" data-action="'+item.action+'"'+
        ((item.label==='Overview'&&screen==='agency'&&agencyFilter==='attention')||(item.label==='Tours'&&screen==='agency'&&agencyFilter==='all')||(item.label==='Team'&&screen==='team')||(item.label==='Documents'&&screen==='documents')?' class="active" aria-current="page"':'')+'>'+icon(item.label==='Overview'?'home':item.label==='Tours'?'calendar':item.label==='Team'?'people':'document')+item.label+'</button>').join('')+
      '</nav><div class="side-spacer"></div>' +
      '<button class="sos-button wide-sos" type="button" data-action="sos">Tour SOS</button>' +
      '<div class="side-bottom"><strong>Roadline Agency</strong><span>Fictional roster</span>' +
      '<button class="text-button" type="button" data-action="agency-artist">Artist view →</button></div></aside>';
  }
  const nav: { label: string; action: string; selected: boolean }[] = [
    { label: 'Overview', action: 'tab-today', selected: screen === 'today' },
    { label: 'Route', action: 'tab-route', selected: ['options', 'detail', 'route', 'plan', 'plan-preview',
      'economics', 'economics-terms', 'ai', 'simulation'].includes(screen) },
    { label: 'Audience', action: 'concept-audience', selected: screen === 'audience' },
    { label: 'Crew', action: 'tab-crew', selected: screen === 'crew' },
    { label: 'Documents', action: 'documents', selected: screen === 'documents' || screen === 'draft' },
  ];
  return '<aside class="sidebar" aria-label="Tour workspace">' +
    '<div class="wordmark brand-desktop">' + brand() + '</div>' +
    '<nav class="side-nav" aria-label="Desktop navigation">' +
    nav.map(item => '<button type="button" data-action="' + item.action + '"' + (item.selected ? ' class="active" aria-current="page"' : '') + '>' + icon(item.label==='Overview'?'home':item.label==='Route'?'pin':item.label==='Audience'?'people':item.label==='Crew'?'crew':'document') + HTML(item.label) + '</button>').join('') +
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
    '<h3>' + icon('crew') + 'Load-in</h3><p class="muted">Sample crew note · ' + HTML(projection.fromCity) + '</p>' +
    softButton('Open today’s sheet →', 'tab-crew') + '</div>' +
    '<p class="tiny-label">Sample tour · venue and crew details unverified</p>' + mobileTabs() + '</section>';
}
function shortlist(): string {
  return '<section class="mobile-view rescue-view shortlist-view">' + header(true, projection.cancelledDate) +
    '<div class="intro"><h1>Three ways forward.</h1><p class="muted">' + HTML(projection.fromCity) + ' → replacement → ' + HTML(projection.toCity) + '</p></div>' +
    '<fieldset class="options-list" role="radiogroup" aria-labelledby="rescue-options-legend"><legend class="sr-only" id="rescue-options-legend">Choose a rescue option</legend>' +
    projection.options.map(option => {
      const selected = option.id === pendingId;
      return '<button type="button" role="radio" aria-checked="' + String(selected) + '" class="option-row' + (selected ? ' selected' : '') +
        '" data-action="select-option" data-id="' + HTML(option.id) + '" aria-controls="rescue-choice-summary" tabindex="' + (selected ? '0' : '-1') + '">' +
        '<div class="option-heading"><strong>' + HTML(option.cityName) + '</strong>' +
        (option.recommended ? '<span class="suggested">Suggested</span>' : '') +
        '<span class="fake-radio" aria-hidden="true"></span></div>' +
        '<div class="option-reason">' + HTML(option.reason) + '</div>' +
        '<div class="drive-line">' + (option.kind === 'day-off' ? 'No added show · locked dates retained' :
          HTML(option.inbound) + ' in <span class="middle-dot">·</span> ' + HTML(option.outbound) + ' onward') + '</div>' +
        '<div class="option-validation">' + (option.decisionCheck === 'FAIL' ? '<span class="danger-text">× Fails declared limits</span>' : option.decisionCheck === 'UNKNOWN' ? '<span>? More evidence needed</span>' : '<span class="success-text">✓ Passes declared checks</span>') + '</div></button>';
    }).join('') + '</fieldset>' +
    '<div id="rescue-choice-summary" class="focused-bottom">' + primary(optionById(pendingId)?.kind === 'day-off' ?
      'Keep the day off →' : 'Review ' + (optionById(pendingId)?.cityName ?? 'option') + ' →', 'review') +
    '<p class="tiny-label">Source-labelled estimates · venue/date not confirmed</p>' +
    softButton('Run fresh Qloo evidence →', 'open-live', 'muted-button') + '</div>'+reviewTools()+'</section>';
}
function reviewTools():string {
 return '<nav class="review-tools" aria-label="Decision tools">'+softButton('Change one assumption','open-sim')+
   softButton('Evidence','open-evidence')+softButton('AI research','open-ai')+
   softButton('Six-step guided demo','start-guide')+softButton('Real Qloo presets','open-live-presets')+'<button type="button" class="text-button" data-install-app>Install app</button></nav>';
}
function livePresetView():string {
 const preset=LIVE_PRESETS.find(row=>row.id===livePresetId)!;
 return '<section class="feature-page live-preset-view">'+header(true,'Decision')+
  '<div class="intro"><p class="eyebrow">LIVE QLOO · EXPLICIT REQUEST</p><h1>Try a real artist.</h1><p>Same frozen German cities and route constraints. Fresh artist evidence can be complete, unchanged or UNKNOWN.</p></div>'+
  '<fieldset class="ai-scenarios"><legend>Representative artist preset</legend>'+LIVE_PRESETS.map(row=>'<button type="button" data-action="choose-live-preset" data-id="'+row.id+'" aria-pressed="'+(row.id===livePresetId)+'"'+(liveBusy?' disabled':'')+'>'+HTML(row.selection.target.name)+'</button>').join('')+'</fieldset>'+
  '<p>Comparisons: '+preset.selection.comparisons.map(row=>HTML(row.name)).join(', ')+'. Control: '+HTML(preset.selection.control.name)+'.</p>'+
  '<p class="muted">No request runs on opening or selecting a preset. This action uses the existing Qloo quota. No AI session, booking or outreach starts automatically.</p>'+
  '<p class="live-notice" role="status">'+HTML(navigator.onLine===false?'Offline. Fresh Qloo needs a connection; the saved comparison is unchanged.':liveNotice)+'</p>'+primary(liveBusy?'Checking fresh evidence…':'Run live Qloo comparison →','run-live-preset',liveBusy||navigator.onLine===false)+
  (result.mode==='live'?softButton('Inspect the current live report →','open-evidence'):'')+'</section>';
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
    (option.decisionCheck !== option.routeCheck ? '<p class="soft-status">' + statusBadge(option.decisionCheck) + ' Decision checks</p>' : '') +
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
    '</div>' + acceptedResearchSources() + softButton('Inspect sensitivity & control →','open-evidence') + softButton('Download full JSON audit ↓', 'audit') + '</section>';
}
function evidenceView():string {
 const source=evidenceSource??result;
 const rec=source.audit.analysis.decision.recommendation;
 const selectedId=evidenceOptionId||pendingId;
 const decision=source.audit.analysis.decision.options.find(row=>row.optionId===selectedId);
 const control=source.audit.controlRun;
 const controlName=control.status==='known'?recommendationName({...source,audit:{...source.audit,analysis:{...source.audit.analysis,decision:control.value.decision}}}):'UNKNOWN';
 const controlExplanation=control.status==='known'?control.value.decision.recommendation.reason:control.reason;
 return '<section class="feature-page decision-evidence">'+header(true,'Decision')+
   '<div class="intro"><p class="eyebrow">EVIDENCE · '+HTML(source.mode==='live'?'LIVE QLOO / SAMPLE TOUR':'SYNTHETIC TASTE / FROZEN OSRM')+'</p><h1>Why this direction?</h1>'+
   '<p>Current recommendation: <strong>'+HTML(recommendationName(source))+'</strong>. '+HTML(rec.reason)+'</p></div>'+
   '<p class="source-note">Additional-distance cap '+source.audit.replay.policy.maxAdditionalDistanceMetres/1000+' km. Daily driving is a separate constraint. Four confirmed shows remain locked.</p>'+
   '<div data-tour="evidence" data-evidence-scatter></div>'+
   '<section class="control-evidence"><h2>Control artist</h2><p data-control-result><strong>'+HTML(controlName)+'</strong></p><p>'+HTML(controlExplanation)+'</p><p class="muted">'+
   (control.status==='known'&&control.value.recommendedOptionChanged.status==='known'?
     (control.value.recommendedOptionChanged.value?'Changing the artist changes the recommendation.':'Changing the artist does not change the recommendation.'):
     'UNKNOWN whether the control changes the recommendation. No successful change is inferred.')+'</p></section>'+
   '<details class="evidence-disclosure" open><summary>Leave one comparison artist out</summary><div data-evidence-sensitivity></div></details>'+
   '<details class="evidence-disclosure"><summary>Tag Bridge · sourced tags only</summary><div data-evidence-tags></div></details>'+
   acceptedResearchSources()+'<details class="evidence-disclosure"><summary>Sources & limitations</summary><ul>'+projectRescue(source).evidence.map(item=>'<li>'+HTML(item)+'</li>').join('')+'</ul></details>'+
   (source.mode==='live'?renderLiveStudyReport(source,liveWorkerVersion):'')+renderRecordedQlooStudy()+
   '<div class="focused-bottom" data-tour="exports">'+primary('Download current audit ↓','audit')+
   (decision?.kind!=='day-off'&&decision?.status!=='FAIL'?softButton('Prepare promoter proposal →','evidence-proposal'):softButton('Review the three options →','rescue'))+
   softButton('Return to comparison','rescue')+'</div></section>';
}
function openEvidence(source:ApiDecisionResult=result,optionId=pendingId):void {
 evidenceSource=source;evidenceOptionId=optionId;screen='evidence';notice='';render();
}
function acceptedResearchSources(): string {
  if(!researchHistory.accepted.length)return '';
  return '<section class="research-sources"><h3>Accepted AI research</h3><p>Explicitly accepted comparison leads; independently rechecked. No booking or outreach.</p><ul>'+
    researchHistory.accepted.map(acceptance=>{
      const session=researchHistory.sessions.find(row=>row.sessionId===acceptance.sessionId);
      const proposal=session?.proposals.find(row=>row.draft.id===acceptance.proposalId);
      return '<li><strong>'+HTML(proposal?.draft.venueName)+'</strong> · '+HTML(session?.mode==='demo'?'Synthetic transcript':'Live research')+' · accepted '+HTML(acceptance.acceptedAt)+'<ul>'+
        (session?.sources.filter(source=>acceptance.sourceIds.includes(source.id))??[]).map(source=>{
          const url=safeAiSourceUrl(source.url);
          return '<li>'+(url?'<a href="'+HTML(url)+'" target="_blank" rel="noopener noreferrer">'+HTML(source.title)+'</a>':HTML(source.title))+' · '+HTML(source.provenance)+' · '+HTML(source.retrievedAt)+'</li>';
        }).join('')+'</ul></li>';
    }).join('')+'</ul></section>';
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
    '<p class="overline">'+(sheet.kind==='day-off'?'DAY-OFF BRIEF':'PROMOTER PROPOSAL')+' · ' + HTML(sheet.modeLabel) + '</p>' +
    '<h1>' + HTML(sheet.artist) + ' - ' + HTML(sheet.city) + '</h1>' +
    '<p class="sheet-date">'+(sheet.kind==='day-off'?'Day off: ':'Proposed: ') + HTML(sheet.date) + ' · ' + HTML(sheet.timeZone) + '</p>' +
    '<p>' + HTML(sheet.provenanceNote) + '</p>' +
    '<div class="sheet-grid"><div><small>Route & constraints</small><strong>' + HTML(sheet.extraDistance) + ' additional distance</strong><span>'+HTML(sheet.extraDriving)+' added driving · distance cap '+HTML(sheet.distanceLimit)+'</span><span>Daily driving limit: ' + HTML(sheet.dailyDrivingLimit) + '</span></div>' +
    '<div><small>Qloo cultural affinity</small><strong>' + HTML(sheet.fit) + '</strong><span>' + HTML(sheet.fitNote) + '</span></div>' +
    '<div><small>Decision checks</small><strong>' + HTML(sheet.decisionStatus) + '</strong><span>' + HTML(sheet.recommendation) + '</span></div>' +
    '<div><small>'+(sheet.kind==='day-off'?'Day-off plan':'Venue & contact')+'</small><strong>'+HTML(sheet.confirmationNote)+'</strong><span>'+HTML(sheet.venueNote)+'</span><span>Nothing booked or sent</span></div></div>' +
    '<h2>Comparison artists & sensitivity</h2><p>'+sheet.comparisons.map(row=>HTML(row.slot+'. '+row.name)).join(' · ')+'</p><p>'+HTML(sheet.sensitivityNote)+'</p>'+
    '<h2>'+(sheet.kind==='day-off'?'Next crew confirmation':'Next promoter conversation')+'</h2><ol class="sheet-next-steps">' +
    sheet.nextSteps.map(x => '<li>' + HTML(x) + '</li>').join('') +
    '</ol><h2>Evidence & limitations</h2><p>' + HTML(sheet.sourceLines.join(' ')) + '</p>' +
    '<p>' + HTML(sheet.recommendationNote) + '</p><p>'+HTML(sheet.risks.join(' '))+'</p>' +
    '<footer>Audit run: ' + HTML(sheet.runId) + ' · generated ' + HTML(sheet.generatedAt) +
    ' · This proposal is not an agreement, a booking or an email confirmation.</footer></article>';
}
function draft(): string {
  const sheet = chosenProposal;
  if (!sheet) return '<section class="mobile-view rescue-view">' + header(true, 'City') + '<p>Document not available.</p></section>';
  return '<section class="mobile-view rescue-view draft-view">' + header(true, 'Proposal') +
    '<p class="overline accent-text">DRAFT / NOT SENT</p>' +
    '<div class="intro"><h1>Ready for the next call.</h1><p class="muted">Review the evidence, then ask the promoter to confirm the open questions. Nothing booked or sent.</p></div>' +
    '<div class="proposal-preview">' + sheetHtml(sheet) + '</div>' +
    '<div class="contact-area"><label for="promoter-contact">Promoter contact <span class="muted">(optional draft field)</span></label>' +
    '<input id="promoter-contact" type="email" autocomplete="off" placeholder="Unknown / To confirm" value="' + HTML(proposalContact) + '">' +
    '<p class="tiny-label">Choosing a city has not confirmed a venue or contacted anyone.</p></div>' +
    (reviewingMessage ? '<div class="edit-message"><label for="proposal-message">Editable English email draft</label>' +
      '<textarea id="proposal-message" rows="11">' + HTML(proposalMessage) + '</textarea></div>' : '') +
    '<div class="focused-bottom">' + primary(reviewingMessage ? 'Copy message →' : 'Review message →', reviewingMessage ? 'copy-message' : 'review-message') +
    softButton('Print / save one-page proposal →', 'print-sheet') +
    softButton('Download promoter PNG ↓','download-sheet-png')+
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
function mapSVG():string {
 const proposalOptions=projection.options.filter(option=>option.kind!=='day-off'&&option.cityId);
 const recommended=proposalOptions.find(option=>option.recommended)??proposalOptions[0];
 const proposalIds=proposalOptions.map(option=>option.cityId!);
 return '<div class="route-map" aria-label="Germany geography and tour map">'+
   renderGermanyGeographicMap({
     scope:'command',from:projection.fromCity,cancelled:projection.cancelledCity,
     to:projection.toCity,proposalIds,preferredProposalId:recommended?.cityId,
   })+'</div>';
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
    mapSVG() + '</section>' +
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
function extensionContext(): ExtensionContext {
  return { tabs: mobileTabs(), sos,sosGuide:new URLSearchParams(location.search).get('learn')==='sos', planBrief, planSummary, bandProfile, showAssumptions: economicsExpanded,
    economics, economicsError, economicsDraft, fanPreviewed, aiBusy, aiNotice, aiMode, aiSteps, aiSession,
    aiDemoScenario, aiSkill,aiAccepted: researchHistory.accepted, aiLiveReady:!!liveResearchBaseRunId, sourceMode: projection.mode };
}
function desktopContext(): DesktopViewContext {
  return {
    projection, audience:audienceModel, audienceSource, selectedAudienceCityId,
    audienceEvidenceOpen, mapZoom:audienceZoom, simulation:simulationModel,
    simulationTab,simulationCapDraft:simCapDraft,simulationCapError:simCapError,
    savedDraft:simSaved, changeCityOpen:simChooseCity,
    agencyFilter, agencyOwners, assigningTask:agencyAssignOpen,
    proposedOwner:agencyProposedOwner, agencyNotice, actionNotice:notice,
  };
}
function renderWorkspace(): string { return workspaceView(screen as WorkspaceScreen, {profile:bandProfile,knowledge:tourKnowledge,noteId,noteTitle,noteText,hasProposal:!!chosenProposal,agency:workspaceAgency,presaleOwner:agencyOwners.presale??'Unassigned'}); }
function openWorkspace(next: WorkspaceScreen, agency=false):void { workspaceReturn=screen; workspaceAgency=agency; screen=next;notice='';render(); }
function desktopInner(): string {
  if(screen==='live-preset')return livePresetView();
  if(screen==='evidence')return evidenceView();
  if (isWorkspaceScreen(screen)) return '<div class="desktop-centered">'+renderWorkspace()+'</div>';
  if (isDesktopScreen(screen)) return renderDesktopFeature(screen, desktopContext());
  if (screen === 'today') return desktopHome();
  return '<div class="desktop-centered"><div class="desktop-mini-header"><strong>' + HTML(projection.title) +
    '</strong><span>' + badge(projection.mode === 'demo' ? 'Sample scenario' : 'Live Qloo taste · sample tour') + '</span></div>' +
    (isExtensionScreen(screen) ? renderExtension(screen, extensionContext())
      : screen === 'options' ? shortlist() :
        screen === 'detail' ? '<button type="button" class="text-button desktop-review-back" data-action="back">← Back to rescue directions</button>'+details() :
        screen === 'draft' ? '<button type="button" class="text-button desktop-proposal-back" data-action="back">← Back to checked route</button>'+draft() :
      crew()) + '</div>';
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
    ((!liveTarget || !liveControl) ? '<p class="tiny-label">To enable: choose a resolved Target artist and Control artist.</p>' : '') +
    '<p class="tiny-label">Nothing here contacts promoters or changes confirmed dates.</p></section></div>';
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
  const nodes = [...scope.querySelectorAll<HTMLElement>('[data-action], [id]')];
  return selectFocusTarget(focus, nodes, node => ({
    id: node.id || undefined, action: node.dataset.action,
    dataId: node.dataset.id, dataIndex: node.dataset.index,
  })) ?? null;
}
function focusFirstHeading(scope: Element): void {
  const heading = scope.querySelector<HTMLElement>('h1, h2, [role="heading"]');
  if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus(); }
  else root!.querySelector<HTMLElement>('#main')?.focus();
}
function focusedDialog(): HTMLElement | null {
  return root!.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
}
/** A hidden responsive copy can match data-action but cannot actually receive focus. */
function tryRestoreFocus(node: HTMLElement | null): boolean {
  if (!node || node.hasAttribute('disabled') || node.getClientRects().length === 0) return false;
  node.focus();
  return document.activeElement === node;
}
function render(): void {
  const screenChanged = lastRenderedScreen !== screen;
  const focus = screenChanged ? null : previousFocus();
  const detailsKey = (node: HTMLDetailsElement) => node.id || node.className + ':' + node.querySelector('summary')?.textContent;
  const openDetails = screenChanged ? new Set<string>() : new Set([...root!.querySelectorAll<HTMLDetailsElement>('details[open]')].map(detailsKey));
  const priorDialog = focusedDialog();
  const previouslyInDialog = !!(priorDialog && document.activeElement && priorDialog.contains(document.activeElement));
  // A public fan screen also mounts #main but deliberately has no private .app-layout.
  const previouslyRendered = hadMountedScreen(root!);
  document.body.classList.toggle('focused-rescue', isFocusedRescue(incident.phase) && ['options','detail','draft'].includes(screen));
  const desktop = desktopMedia.matches;
  const mobile = isWorkspaceScreen(screen) ? renderWorkspace() : isDesktopScreen(screen)
    ? '<div class="feature-mobile-top"><button type="button" class="back-button" data-action="feature-back">← Back to tour</button>' +
      (screen === 'agency' ? '' : '<button type="button" class="sos-button" data-action="sos">SOS</button>') +
      '</div>' + renderDesktopFeature(screen, desktopContext())
    : isExtensionScreen(screen) ? renderExtension(screen, extensionContext()) :
    screen === 'live-preset'?livePresetView():screen === 'evidence'?evidenceView():screen === 'today' ? homeMobile() : screen === 'options' ? shortlist() :
    screen === 'detail' ? details() : screen === 'draft' ? draft() : crew();
  // One DOM layout. The public fan page never receives private tour navigation or SOS controls.
  root!.innerHTML = '<a href="#main" class="skip-link">Skip to content</a>' +
    (screen === 'fan'
      ? '<main id="main" class="fan-public" tabindex="-1">' + mobile + '</main>'
      : '<div class="app-layout">' + (desktop ? sidebar() : '') + '<main id="main" class="main-content" tabindex="-1">' +
        (desktop ? '<div class="desktop-only">' + desktopInner() + '</div>' : '<div class="mobile-only">' + mobile + '</div>') +
        '</main></div>' +
        liveDialog());
  if(notice && !isDesktopScreen(screen)) {
    const anchor=root!.querySelector('#main .intro, #main .desktop-top');
    anchor?.insertAdjacentHTML('afterend','<p role="status" class="screen-notice">'+HTML(notice)+'</p>');
  }
  for(const node of root!.querySelectorAll<HTMLDetailsElement>('details')) if(openDetails.has(detailsKey(node))) node.open=true;
  printRoot!.innerHTML = screen === 'draft' && chosenProposal ? sheetHtml(chosenProposal) : '';
  document.title = 'Tour Rescue · ' + (screen === 'today' ? 'Today' : screen === 'options' ? 'Rescue options' :
    screen === 'detail' ? 'Review' : screen === 'draft' ? 'Promoter draft' : screen === 'crew' ? 'Crew' :
    screen.replace(/-/g, ' '));

  const dialog = focusedDialog();
  const layout = root!.querySelector<HTMLElement>('.app-layout');
  if (layout) layout.inert = dialog !== null; // real background tab suppression
  if (dialog) {
    const restored = previouslyInDialog && focus ? findPreviousTarget(focus, dialog) : null;
    if (!tryRestoreFocus(restored)) focusFirstHeading(dialog);
  } else if (priorDialog && dialogReturnAction) {
    const opener = root!.querySelector<HTMLElement>('[data-action="' + dialogReturnAction + '"]');
    dialogReturnAction = null;
    if (!tryRestoreFocus(opener)) focusFirstHeading(root!.querySelector('#main') ?? root!);
  } else if (screenChanged && previouslyRendered) {
    focusFirstHeading(root!.querySelector('#main') ?? root!);
  } else if (previouslyRendered && focus) {
    const restored = findPreviousTarget(focus, root!);
    if (!tryRestoreFocus(restored)) focusFirstHeading(root!.querySelector('#main') ?? root!);
  }
  if (screenChanged) {
    window.scrollTo({top:0,behavior:'instant'});
    const screenHash = workspaceScreenHash(screen);
    const hash = screenHash ? '#' + screenHash : '';
    if (!followingLocation && location.hash !== hash) history.pushState({screen,chosenOptionId:incident.chosenOptionId}, '', location.pathname+location.search+hash);
  }
  rememberSosHistory();
  rememberWorkspaceHistory();
  setMapKeyDefaults(root!);
  if(screen==='evidence')mountEvidence(root!,evidenceSource??result,evidenceOptionId||pendingId);
  root!.querySelector('[data-action=rescue]')?.setAttribute('data-tour','cancelled-date');
  root!.querySelector('.options-list')?.setAttribute('data-tour','options');
  root!.querySelector('.sim-edit')?.setAttribute('data-tour','breakpoint-limit');
  root!.querySelector('.agent-results,.extension-view:has([data-action=ai-replay])')?.setAttribute('data-tour','ai');
  guide?.refresh();
  window.dispatchEvent(new Event('tour-rescue:screen-rendered'));
  lastRenderedScreen = screen;
}
window.matchMedia('(max-width: 1099px)').addEventListener('change',()=>setMapKeyDefaults(root!));
function rememberSosHistory(): void {
  if (screen.startsWith('sos-')) history.replaceState({...history.state,screen,sos:{...sos}},'');
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
function startRescue(message = ''): void {
  incident = transitionIncident(incident, { type: 'start-search' });
  incident = transitionIncident(incident, {
    type: 'proposals-ready', runId: projection.runId, optionIds: projection.options.map(option => option.id),
  });
  pendingId = projection.options.find(option => option.recommended)?.id ?? projection.options[0]?.id ?? '';
  screen = 'options';
  notice = message;
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
  proposalReturn = null;
  const selected = currentOption();
  if (!selected || selected.kind === 'day-off') return;
  if (selected.routeCheck === 'FAIL' || selected.decisionCheck === 'FAIL') {
    notice = 'This direction fails declared checks. Choose another option before drafting.';
    render(); return;
  }
  incident = transitionIncident(incident, { type: 'prepare-draft' });
  proposalFromSimulation = false;
  proposalSource = result;
  chosenProposal = buildPromoterModel(result, selected.id);
  proposalMessage = defaultMessage(chosenProposal);
  reviewingMessage = false;
  screen = 'draft';
  render();
}
function back(): void {
  notice = '';
  if (isWorkspaceScreen(screen)) { screen=workspaceReturn;notice='';render();return; }
  if (isDesktopScreen(screen)) { screen === 'agency' ? goHome() : routeHub(); return; }
  if (screen.startsWith('sos-')) {
    const earlier = sos.stage;
    sos = transitionSosSample(sos, { type: 'back' });
    if (sos.stage === earlier) screen = sosReturnScreen;
    else screen = sosScreen(sos.stage);
    render(); return;
  }
  if (screen === 'fan') { closeFan(); return; }
  if (screen === 'evidence'||screen==='live-preset') { screen='options';render();return; }
  if (screen === 'plan-preview') { screen = 'plan'; render(); return; }
  if (screen === 'economics-terms') { screen = 'economics'; render(); return; }
  if (['plan', 'economics', 'ai'].includes(screen)) {
    if (screen === 'ai' && aiBusy) stopAgentResearch();
    screen = 'route'; render(); return;
  }
  if (screen === 'route') { goHome(); return; }
  if (screen === 'options') { goHome(); return; }
  if (screen === 'detail') {
    incident = transitionIncident(incident, { type: 'back-to-options' });
    screen = 'options';
  } else if (screen === 'draft') {
    if(proposalReturn) { screen=proposalReturn;proposalReturn=null;render();return; }
    if (proposalFromSimulation) {
      incident = initialIncident(); screen = 'simulation'; proposalFromSimulation = false; proposalSource = null;
    } else {
      incident = transitionIncident(incident, { type: 'back-to-choice' });
      screen = 'detail';
    }
  } else goHome();
  render();
}
function downloadAudit(source?:ApiDecisionResult,kind:'baseline'|'what-if'='baseline'):void {
  const audited=source??(screen==='draft'?proposalSource??result:screen==='evidence'?evidenceSource??result:result);
  const exported=auditExport(audited,kind,researchHistory);
  const file=new Blob([exported.content],{type:'application/json'});
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = exported.filename;
  document.body.append(link);
  link.click();
  if(guide?.isActive()){guideExports++;guide.refresh();}
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function sosScreen(stage: SosStage): Screen {
  return stage === 'problem' ? 'sos-problem' : stage === 'options' ? 'sos-options' :
    stage === 'quote' ? 'sos-quote' : 'sos-approved';
}
function openSos(): void {
  notice = '';
  if (!screen.startsWith('sos-')) sosReturnScreen = screen;
  screen = sosScreen(sos.stage);
  render();
}
function routeHub(): void {
  incident = initialIncident();
  screen = 'route';
  notice = '';
  render();
}
function openAudience(): void {
  audienceModel = projectAudience(result);
  selectedAudienceCityId = audienceModel.places[0]?.cityId ?? '';
  audienceSource = 'qloo'; audienceEvidenceOpen = false;
  screen = 'audience'; notice = '';
  render();
}
function simulationScope(): string {
  return simulationDraftScope(result, researchHistory.accepted.length > 0);
}
function openSimulation(optionId?: string): void {
  const available = projection.options;
  const previous = (() => {try{return loadSimulation(window.localStorage, simulationScope());}catch{return null;}})();
  const requested = optionId ?? previous?.optionId ?? available.find(option => option.recommended)?.id ?? available[0]?.id;
  const chosen = available.some(option => option.id === requested) ? requested : available[0]?.id;
  if (!chosen) { notice = '× No nominated route is available.'; render(); return; }
  const cap = previous?.optionId === chosen ? previous.extraKm : result.audit.replay.policy.maxAdditionalDistanceMetres/1000;
  try {
    simulationModel = projectSimulation(result, chosen, cap);
    simSaved = Boolean(previous && previous.optionId === chosen && previous.extraKm === cap);
    simChooseCity = false; simCapDraft=null; simCapError=''; simulationTab = 'route';
    screen = 'simulation'; notice = '';
  } catch(err) { notice='× Simulation unavailable: '+(err instanceof Error?err.message:'invalid audit'); }
  render();
}
function saveCurrentSimulation(): void {
  if (!simulationModel) return;
  try {
    saveSimulation(window.localStorage, {
      schemaVersion:'tour-rescue.web2-sim-draft.v1', baseRunId:simulationScope(),
      optionId:simulationModel.optionId, extraKm:simulationModel.maxAdditionalDistanceKm,
    });
    simSaved = true; notice = '✓ Draft saved on this device only; the existing tour is unchanged.';
  } catch(err) { notice='× Could not save local draft: '+(err instanceof Error?err.message:'storage disabled'); }
  render();
}
function previewSimulationProposal(): void {
  proposalReturn=null;
  if(!simulationModel)return;
  if(simulationModel.dayOff){downloadAudit(simulationModel.sourceResult,'what-if');return;}
  const source=simulationModel.sourceResult;
  const selected=source.audit.analysis.decision.options.find(option=>option.optionId===simulationModel!.optionId);
  if(!selected || selected.status==='FAIL') {
    notice='× This direction fails declared checks. Review the audit or change the assumption.';
    render(); return;
  }
  incident=transitionIncident(initialIncident(),{type:'start-search'});
  incident=transitionIncident(incident,{type:'proposals-ready',runId:source.audit.runId,
    optionIds:source.audit.analysis.repairs.options.map(option=>option.id)});
  incident=transitionIncident(incident,{type:'choose',optionId:simulationModel.optionId});
  incident=transitionIncident(incident,{type:'prepare-draft'});
  proposalFromSimulation=true;
  proposalSource=source;
  chosenProposal=buildPromoterModel(source,simulationModel.optionId);
  proposalMessage=defaultMessage(chosenProposal);
  reviewingMessage=false; screen='draft'; notice='';
  render();
}
function openAgency():void {
  screen='agency';agencyFilter='attention';agencyNotice='';notice='';render();
}
function closeFan(): void {
  screen = 'route';
  render();
}
function stopAgentResearch(): void {
  if (!aiBusy) return;
  ++aiGeneration;
  aiAbort?.abort(new Error('Research stopped by user.'));
  aiAbort = null;
  aiBusy = false;
  aiNotice = '◷ Stopped - the Worker may still count this reserved AI session; no proposal was accepted.';
}
async function researchWithAgent(): Promise<void> {
  if (aiBusy || result.mode !== 'live') return;
  if(navigator.onLine===false){aiNotice='Offline. Live AI research needs a connection; your current comparison is unchanged.';render();return;}
  if(!liveResearchBaseRunId){aiNotice='Refresh Qloo before starting another live research session. Your accepted comparison stays unchanged until a new run succeeds.';render();return;}
  const generation = ++aiGeneration;
  const controller = new AbortController();
  aiAbort = controller;
  const active = () => aiGeneration === generation && !controller.signal.aborted;
  aiBusy = true;
  aiSession = null;
  aiSteps = [];
  aiNotice = '◷ Checking AI availability…';
  render();
  try {
    const health = await aiApi.health(controller.signal);
    if (!active()) return;
    if (!health.enabled) throw new Error('Live AI research is disabled by the Worker.');
    aiNotice = '◷ Research in progress - no proposal can be accepted automatically.';
    render();
    const budget = result.audit.replay.scenario.tour.constraints.additionalBudget;
    const session = await aiApi.rescue({
      knowledge:withBandProfile(tourKnowledge,bandProfile),skill:aiSkill,
      baseRunId: liveResearchBaseRunId,
      policy: result.audit.replay.policy,
      ...(budget.status === 'known' ? { additionalBudgetMinorUnits: budget.value.minorUnits } : {}),
    }, result, event => {
      if (active() && event.type === 'step') {
        aiSteps.push(event.step);
        aiSteps = aiSteps.slice(-60);
        aiNotice = '◷ Research in progress - ' + event.step.message;
        render();
      }
    }, controller.signal);
    if (!active()) return;
    aiSession = session;
    aiSteps = [...session.steps];
    aiNotice = session.stopReason === 'completed'
      ? '✓ Research complete - proposals are checked, not automatically applied.'
      : '? Research incomplete (' + session.stopReason + ') - no proposals were accepted.';
  } catch (err) {
    if (!active()) return;
    aiNotice = '× Failed - existing decision kept. ' + (err instanceof Error ? err.message : 'Agent research unavailable.');
  } finally {
    if (aiGeneration === generation) {
      aiAbort = null;
      aiBusy = false;
      render();
    }
  }
}
async function runLive(): Promise<void> {
  if (liveBusy || !liveTarget || !liveControl) return;
  if(navigator.onLine===false){liveNotice='Offline. Live Qloo needs a connection; your current comparison is unchanged.';render();return;}
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
    liveWorkerVersion=(await api.health()).version;
    const fresh = await api.rescue(selection);
    const view = projectRescue(fresh);
    const nextState = transitionIncident(initialIncident(), { type: 'start-search' });
    incident = transitionIncident(nextState, { type: 'proposals-ready', runId: view.runId, optionIds: view.options.map(item => item.id) });
    result = fresh;
    liveResearchBaseRunId=fresh.audit.runId;
    researchHistory = emptyResearch(); aiSession = null; aiSteps = [];
    projection = view;
    pendingId = view.options.find(x => x.recommended)?.id ?? view.options[0]?.id ?? '';
    chosenProposal = null;
    liveOpen = false;
    screen = 'options';
    audienceModel=projectAudience(fresh);
    selectedAudienceCityId=audienceModel.places[0]?.cityId??'';
    simulationModel=null;
    notice = 'Fresh Qloo run complete. Venue and booking facts remain sample data.';
  } catch (err) {
    incident = priorIncident;
    screen = priorScreen;
    liveNotice = '× Failed - previous decision kept. ' +
      (err instanceof Error ? err.message : 'Qloo evidence unavailable.');
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
    liveNotice = '× Failed - previous decision kept. ' +
      (err instanceof Error ? err.message : 'Search failed. No artist was selected.');
  } finally { liveBusy = false; render(); }
});
root!.addEventListener('change', async event => {
  const node = event.target;
  if (!(node instanceof HTMLElement)) return;
  if(node instanceof HTMLSelectElement&&node.id==='ai-skill'){aiSkill=node.value as TourSkill;return;}
  if(node instanceof HTMLInputElement&&node.id==='knowledge-file'){
    const file=node.files?.[0];if(!file)return;
    if(file.size>8000||!/[.](txt|md)$/i.test(file.name)){notice='Use a TXT or Markdown file up to 2000 characters.';render();return;}
    const text=await file.text();if(text.length>2000){notice='The note exceeds 2000 characters. Shorten it first.';render();return;}
    noteTitle=file.name;noteText=text;notice='Text loaded into the editor. Review and save it.';render();return;
  }
  if (node.id === 'live-role' && node instanceof HTMLSelectElement) {
    liveRole = node.value as ArtistRole; liveChoices = []; render();
  }
  if (node.id === 'promoter-contact' && node instanceof HTMLInputElement) proposalContact = node.value;
});
root!.addEventListener('input', event => {
  const node = event.target;
  if (node instanceof HTMLTextAreaElement && node.id === 'proposal-message') proposalMessage = node.value;
  if (node instanceof HTMLInputElement && node.id === 'promoter-contact') proposalContact = node.value;
  if (node instanceof HTMLTextAreaElement && node.id === 'plan-brief') planBrief = node.value;
  if (node instanceof HTMLTextAreaElement && node.id === 'band-profile') bandProfile = node.value;
  if(node instanceof HTMLInputElement&&node.id==='knowledge-title')noteTitle=node.value;
  if(node instanceof HTMLTextAreaElement&&node.id==='knowledge-text')noteText=node.value;
  if (node instanceof HTMLTextAreaElement && node.id === 'sos-problem') sos = {...sos,problem:node.value};
  if (node instanceof HTMLInputElement && node.id === 'sos-location') sos = {...sos,location:node.value};
  if (node instanceof HTMLInputElement && node.id === 'sos-deadline') sos = {...sos,requiredLocal:node.value};
  if (node instanceof HTMLInputElement && node.id.startsWith('econ-')) economicsDraft[node.id.slice(5)]=node.value;
  if (node instanceof HTMLInputElement && node.id === 'sos-budget') sos = {...sos,budgetCapVnd:Number(node.value)};
  if (node instanceof HTMLElement && node.id.startsWith('sos-')) rememberSosHistory();
});
root!.addEventListener('click', async event => {
  const element = event.target;
  if (!(element instanceof Element)) return;
  if(element.closest('.skip-link')) {event.preventDefault();root!.querySelector<HTMLElement>('#main')?.focus();return;}
  const button = element.closest<HTMLElement>('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if(guide?.isActive()&&['open-live','run-live','ai-mode-live','ai-run-live','run-live-preset'].includes(action??'')){notice='Pause the guided sample before starting live provider requests. The walkthrough uses saved evidence and never spends credits.';render();return;}
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
    case 'tab-route': routeHub(); break;
    case 'tab-crew': incident = initialIncident(); screen = 'crew'; render(); break;
    case 'documents': openWorkspace('documents'); break;
    case 'workspace-back': screen=workspaceReturn;notice='';render();break;
    case 'knowledge-new': noteId='';noteTitle='';noteText='';render();break;
    case 'knowledge-edit': {const doc=tourKnowledge.documents.find(row=>row.id===button.dataset.id);if(doc){noteId=doc.id;noteTitle=doc.title;noteText=doc.text;}render();break;}
    case 'knowledge-delete': {const next={...tourKnowledge,documents:tourKnowledge.documents.filter(row=>row.id!==button.dataset.id)};try{saveKnowledge(next);tourKnowledge=next;if(noteId===button.dataset.id){noteId='';noteTitle='';noteText='';}notice='Note deleted from this device.';}catch{notice='Could not update device storage.';}render();break;}
    case 'knowledge-save': {
      try{
        if(!noteId&&tourKnowledge.documents.filter(row=>row.id!=='band-profile'&&row.id!=='last-decision').length>=6)throw new Error('Six notes are already saved. Edit or delete one.');
        const next=putDocument(withBandProfile(tourKnowledge,bandProfile),{id:noteId||crypto.randomUUID(),title:noteTitle,text:noteText,updatedAt:new Date().toISOString()});tourKnowledge=next;noteId='';noteTitle='';noteText='';notice='Note saved for the next live research session.';
      }catch(e){notice=e instanceof Error?e.message:'Could not save note.';}render();break;
    }
    case 'document-proposal': if(chosenProposal){proposalReturn='documents';screen='draft';render();}break;
    case 'team-assignment': openAgency();agencyAssignOpen='presale';render();break;
    case 'profile-save': {
      const field=root!.querySelector<HTMLTextAreaElement>('#band-profile');
      if(!field?.value.trim()){notice='Describe the band before saving.';render();break;}
      bandProfile=field.value.trim();
      try{localStorage.setItem('tour-rescue.band-profile.v1',bandProfile);notice='✓ Profile saved on this device.';}catch{notice='Profile kept for this session; device storage unavailable.';}
      screen='plan';render();break;
    }
    case 'concept-audience': openAudience(); break;
    case 'concept-agency': openAgency(); break;
    case 'open-sim': openSimulation(); break;
    case 'feature-back': screen === 'agency' ? goHome() : routeHub(); break;
    case 'audience-qloo': audienceSource='qloo';notice='';render();break;
    case 'audience-fans': audienceSource='fans';notice='';render();break;
    case 'audience-select':
      if(audienceModel.places.some(p=>p.cityId===button.dataset.id))selectedAudienceCityId=button.dataset.id!;
      render();break;
    case 'audience-zoom-in':audienceZoom=Math.min(1.45,Math.round((audienceZoom+.15)*100)/100);render();break;
    case 'audience-zoom-out':audienceZoom=Math.max(1,Math.round((audienceZoom-.15)*100)/100);render();break;
    case 'audience-evidence':audienceEvidenceOpen=!audienceEvidenceOpen;render();break;
    case 'audience-try':{
      const city=audienceModel.places.find(p=>p.cityId===selectedAudienceCityId);
      if(city?.routeOptionId)openSimulation(city.routeOptionId);
      else {notice='? Taste lead only - no validated road option for this city.';render();}
      break;
    }
    case 'sim-close':routeHub();break;
    case 'sim-route-tab':simulationTab='route';notice='';render();break;
    case 'sim-budget-tab':simulationTab='budget';notice='';render();break;
    case 'sim-change-city':simChooseCity=!simChooseCity;render();break;
    case 'sim-pick':
      if(simulationModel && button.dataset.id){simulationModel=projectSimulation(result,button.dataset.id,simulationModel.maxAdditionalDistanceKm);simChooseCity=false;simSaved=false;render();}
      break;
    case 'sim-follow-recommendation':
      if(simulationModel?.afterRecommendation.optionId){simulationModel=projectSimulation(result,simulationModel.afterRecommendation.optionId,simulationModel.maxAdditionalDistanceKm);simSaved=false;render();}
      break;
    case 'sim-audit':if(simulationModel)downloadAudit(simulationModel.sourceResult,'what-if');break;
    case 'open-evidence':openEvidence();break;
    case 'sim-full-evidence':if(simulationModel)openEvidence(simulationModel.sourceResult,simulationModel.optionId);break;
    case 'evidence-proposal': {
      const source=evidenceSource??result;
      const id=evidenceOptionId||pendingId;
      if(source.audit.analysis.decision.options.find(row=>row.optionId===id)?.status==='FAIL')break;
      incident=transitionIncident(initialIncident(),{type:'start-search'});
      incident=transitionIncident(incident,{type:'proposals-ready',runId:source.audit.runId,optionIds:source.audit.analysis.repairs.options.map(row=>row.id)});
      incident=transitionIncident(incident,{type:'choose',optionId:id});incident=transitionIncident(incident,{type:'prepare-draft'});
      chosenProposal=buildPromoterModel(source,id);proposalSource=source;proposalReturn='evidence';proposalFromSimulation=false;
      proposalMessage=defaultMessage(chosenProposal);reviewingMessage=false;screen='draft';render();break;
    }
    case 'download-sheet-png':
      if(chosenProposal&&proposalSource){try{await downloadPromoterPng(proposalSource,chosenProposal.optionId);notice='PNG downloaded. The matching audit contains the full evidence.';}catch(error){notice='PNG could not be created. '+(error instanceof Error?error.message:'Use Print A4.');}render();}break;
    case 'start-guide':if(!aiBusy&&!liveBusy)guide?.start(button);break;
    case 'open-live-presets':screen='live-preset';liveNotice='';render();break;
    case 'choose-live-preset':if(!liveBusy&&LIVE_PRESETS.some(row=>row.id===button.dataset.id)){livePresetId=button.dataset.id!;liveNotice='';render();}break;
    case 'run-live-preset':{
      if(liveBusy)break;const preset=LIVE_PRESETS.find(row=>row.id===livePresetId)!;
      liveTarget=preset.selection.target;liveComparisons=[...preset.selection.comparisons];liveControl=preset.selection.control;
      await runLive();break;
    }
    case 'sim-recheck': {
      const input=root!.querySelector<HTMLInputElement>('#sim-cap');
      if(!input||!simulationModel)break;
      simCapDraft=input.value;
      try {
        const cap=parseExtraDistanceKm(input.value);
        simulationModel=projectSimulation(result,simulationModel.optionId,cap);
        simCapDraft=null;simCapError='';simSaved=false;
        notice=(simulationModel.recommendationChanged?'Recommendation changed: ':'Recommendation unchanged: ')+simulationModel.afterRecommendation.name+'. The reviewed alternative is labelled separately.';
      }catch(err){
        simCapError=err instanceof Error?err.message:'Enter 0–500 km.';
        notice='';
      }
      render();break;
    }
    case 'sim-save':saveCurrentSimulation();break;
    case 'sim-proposal':previewSimulationProposal();break;
    case 'sim-evidence':
      if(simulationModel){
        notice='× This what-if fails a check. Downloading this simulation’s audited result.';
        downloadAudit(simulationModel.sourceResult,'what-if');
      }
      render();break;
    case 'agency-overview':openAgency();break;
    case 'agency-all':agencyFilter='all';agencyNotice='';notice='';render();break;
    case 'agency-attention':agencyFilter='attention';agencyNotice='';notice='';render();break;
    case 'agency-sos':openSos();break;
    case 'agency-assign':agencyAssignOpen='presale';agencyProposedOwner=agencyOwners.presale??'Alex';render();break;
    case 'agency-owner-save': {
      const input=root!.querySelector<HTMLSelectElement>('#agency-owner');
      const candidate=input?.value;
      if(candidate==='Unassigned'||candidate==='Marta'||candidate==='You'||candidate==='Alex'){
        agencyOwners.presale=candidate;
        agencyAssignOpen=null;
        agencyNotice='✓ Sample owner updated locally. Nobody was notified.';
      }else agencyNotice='× Choose a listed sample owner.';
      render();break;
    }
    case 'agency-share':
      try{
        await navigator.clipboard.writeText('Tour Rescue · SAMPLE agency queue\n'+
          'Paper Satellites: drum head · 16:00 ICT\nNorthbound: Leipzig cancellation · 14 Nov CET\n'+
          'Night Ferry: presale issue · '+(agencyOwners.presale??'Unassigned')+
          '\nFictional sample only; no booked shows or sent messages.');
        agencyNotice='✓ Sample overview copied, not sent.';
      }catch{agencyNotice='× Clipboard unavailable; nothing was shared.';}
      render();break;
    case 'agency-team':openWorkspace('team',true);break;
    case 'agency-documents':openWorkspace('documents',true);break;
    case 'agency-artist':goHome();break;
    case 'concept-presale': openWorkspace('presale'); break;
    case 'share':
      try { await navigator.clipboard.writeText(window.location.href); notice = 'Preview link copied (not a booking).'; }
      catch { notice = 'Copy this page URL to share the preview.'; }
      render(); break;
    case 'sos': openSos(); break;
    case 'open-live': if(guide?.isActive())guide.skip();dialogReturnAction = 'open-live'; liveOpen = true; notice = ''; render(); break;
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
    case 'open-plan': screen = 'plan'; render(); break;
    case 'plan-build': {
      const field = root!.querySelector<HTMLTextAreaElement>('#plan-brief');
      if (!field) break;
      try {
        planBrief = field.value;
        planSummary = summarizePlanBrief(planBrief);
        screen = 'plan-preview';
        notice = '';
      } catch(err) {
        notice = err instanceof Error ? err.message : 'Invalid planner brief.';
      }
      render(); break;
    }
    case 'concept-profile': openWorkspace('profile'); break;
    case 'open-economics': screen = 'economics'; render(); break;
    case 'econ-toggle': economicsExpanded = !economicsExpanded; render(); break;
    case 'econ-apply': {
      const fields=['price','share','costs','min','max'].map(id=>root!.querySelector<HTMLInputElement>('#econ-'+id)!);
      if(fields.some(field=>!field.reportValidity()))break;
      const values=fields.map(field=>Number(field.value));
      try{
        const next={ticketPriceEur:values[0]!,artistShare:values[1]!/100,fixedCostsEur:values[2]!,minAttendance:values[3]!,maxAttendance:values[4]!};
        evaluateEconomics(next);economics=next;economicsDraft={};economicsError='';economicsExpanded=false;notice='✓ Scenario recalculated from your assumptions.';
      }catch{economicsError='Check the values: attendance must be whole numbers, with the higher case at least equal to the lower case.';}
      render();break;
    }
    case 'econ-terms': screen = 'economics-terms'; render(); break;
    case 'econ-copy':
      try {
        await navigator.clipboard.writeText('Check the ticket split, total costs, room capacity, fee, date, settlement and break-even before committing.');
        notice = 'Sample checklist copied. No message sent.';
      } catch { notice = 'Clipboard unavailable; review the items above manually.'; }
      render(); break;
    case 'open-fan': screen = 'fan'; render(); break;
    case 'close-fan': closeFan(); break;
    case 'fan-preview': {
      const email = root!.querySelector<HTMLInputElement>('#fan-email');
      if (email && !email.checkValidity()) { email.reportValidity(); break; }
      // The optional address is deliberately not captured, stored or transmitted.
      fanPreviewed = true;
      render(); break;
    }
    case 'sos-find': {
      const problem = root!.querySelector<HTMLTextAreaElement>('#sos-problem');
      const location = root!.querySelector<HTMLInputElement>('#sos-location');
      const required = root!.querySelector<HTMLInputElement>('#sos-deadline');
      const budget = root!.querySelector<HTMLInputElement>('#sos-budget');
      if (!problem || !location || !required || !budget) break;
      try {
        sos = transitionSosSample(sos, { type: 'edit-problem', problem: problem.value, location: location.value,
          requiredLocal: required.value, budgetCapVnd: Number(budget.value) });
        sos = transitionSosSample(sos, { type: 'find-sample-options' });
        screen = 'sos-options'; notice = '';
      } catch(err) { notice = err instanceof Error ? err.message : 'Check required fields.'; }
      render(); break;
    }
    case 'sos-select':
      try {
        sos = transitionSosSample(sos, { type: 'choose-sample-supplier', id: button.dataset.id as SosSupplierId });
      } catch(err) { notice = err instanceof Error ? err.message : 'Select a listed sample supplier.'; }
      render(); break;
    case 'sos-quote':
      sos = transitionSosSample(sos, { type: 'review-sample-quote' });
      screen = 'sos-quote'; render(); break;
    case 'sos-approve':
      try {
        sos = transitionSosSample(sos, { type: 'preview-approval' });
        screen = 'sos-approved';
      } catch(err) { notice = err instanceof Error ? err.message : 'Cannot preview approval.'; }
      render(); break;
    case 'sos-guide-exit':{const url=new URL(location.href);url.searchParams.delete('learn');history.replaceState(history.state,'',url);render();break;}
    case 'sos-self-call':
      notice = 'Self-call is outside Tour Rescue. No supplier has been contacted.';
      render(); break;
    case 'sos-restart': sos = initialSosSample(); screen = 'sos-problem'; render(); break;
    case 'open-ai': screen = 'ai'; render(); break;
    case 'ai-mode-demo': if (!aiBusy) { aiMode = 'demo'; aiNotice = ''; aiSession = null; aiSteps = []; render(); } break;
    case 'ai-mode-live': if (!aiBusy) { aiMode = 'live'; aiNotice = ''; aiSession = null; aiSteps = []; render(); } break;
    case 'ai-replay':
      if (aiBusy) break;
      aiSession = createAiDemoSession(aiDemoScenario);
      aiSteps = [...aiSession.steps];
      aiNotice = '✓ Saved demo replayed - synthetic transcript; no live AI or provider request.';
      render(); break;
    case 'ai-demo-scenario':
      if(!aiBusy && AI_DEMO_SCENARIOS.some(row=>row.id===button.dataset.id)){
        aiDemoScenario=button.dataset.id as AiDemoScenarioId;aiSession=null;aiSteps=[];aiNotice='';render();
      }break;
    case 'ai-accept': {
      if(aiBusy || !aiSession || !button.dataset.id)break;
      try {
        const accepted=acceptResearchIntoComparison(result,aiSession,button.dataset.id,researchHistory,{
          generatedAt:new Date(Math.max(Date.now(),Date.parse(result.audit.generatedAt),Date.parse(aiSession.completedAt))).toISOString(),
          runId:'browser-ai-'+crypto.randomUUID(),
        });
        const view=projectRescue(accepted.result);
        result=accepted.result;projection=view;researchHistory=accepted.history;
        liveResearchBaseRunId=null;
        pendingId=accepted.acceptance.optionId;chosenProposal=null;proposalSource=null;simulationModel=null;
        audienceModel=projectAudience(result);
        incident=transitionIncident(initialIncident(),{type:'start-search'});
        incident=transitionIncident(incident,{type:'proposals-ready',runId:result.audit.runId,optionIds:view.options.map(row=>row.id)});
        screen='options';notice='Accepted into comparison. All checks and decision analysis were recalculated. Four confirmed shows are unchanged; no booking was made.';
        if(aiSession.mode==='live'){
          const lead=aiSession.proposals.find(row=>row.draft.id===button.dataset.id)!;
          try{tourKnowledge=putDocument(withBandProfile(tourKnowledge,bandProfile),{id:'last-decision',title:'Most recent accepted research decision',updatedAt:accepted.acceptance.acceptedAt,text:'The user explicitly accepted '+lead.draft.venueName+' for further comparison, not a booking. Reason: '+lead.draft.reason+' Booking availability, fees and terms remain UNKNOWN. Source session: '+aiSession.sessionId});}
          catch{notice+=' The comparison is accepted, but device memory could not be saved.';}
        }
      }catch(error){aiNotice='Could not accept this proposal. The comparison is unchanged. '+(error instanceof Error?error.message:'Validation failed.');}
      render();break;
    }
    case 'ai-run-live': await researchWithAgent(); break;
    case 'ai-stop': stopAgentResearch(); render(); break;
    case 'ai-use-demo':
      if(!aiBusy){result=createDemoResult();projection=projectRescue(result);researchHistory=emptyResearch();aiSession=null;aiSteps=[];liveResearchBaseRunId=null;simulationModel=null;chosenProposal=null;proposalSource=null;pendingId=projection.options.find(row=>row.recommended)?.id??projection.options[0]!.id;aiNotice='Sample comparison selected explicitly. No live request was made.';render();}break;
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
  // WAI-ARIA: tabs use horizontal arrows, radios use both axes plus Home/End.
  // Reacquire the new node after the view is re-rendered.
  if (event.target instanceof Element) {
    const active = event.target.closest<HTMLElement>('[role="tab"],[role="radio"]');
    const group = active?.closest<HTMLElement>('[role="tablist"],[role="radiogroup"],fieldset');
    if (active && group) {
      const kind = active.getAttribute('role') === 'tab' ? 'tablist' : 'radiogroup';
      const items = [...group.querySelectorAll<HTMLElement>(
        kind === 'tablist' ? '[role="tab"]' : '[role="radio"]',
      )].filter(item => item.getClientRects().length > 0 && !item.hasAttribute('disabled'));
      const nextIndex = nextRovingIndex(event.key, items.indexOf(active), items.length, kind);
      if (nextIndex !== null) {
        event.preventDefault();
        const next = items[nextIndex]!;
        const action = next.dataset.action;
        const id = next.dataset.id;
        next.click(); // delegate to existing audited state transition
        const replacement = [...root!.querySelectorAll<HTMLElement>('[role="tab"],[role="radio"]')]
          .find(node => node.dataset.action === action &&
            (id === undefined || node.dataset.id === id));
        replacement?.focus();
        return;
      }
    }
  }
});
// Programmatic focus (including screen readers) must not escape an open modal.
document.addEventListener('focusin', event => {
  const dialog = focusedDialog();
  if (dialog && event.target instanceof Node && !dialog.contains(event.target)) focusFirstHeading(dialog);
});
function followAppHash():void {
  followingLocation=true;
  try {
    const originalHash=window.location.hash.slice(1);
    const hash=canonicalWorkspaceHash(originalHash);
    if(hash!==originalHash)history.replaceState(history.state,'',location.pathname+location.search+(hash?'#'+hash:''));
    const saved=historyWorkspaces.get(history.state?.tourRescueWorkspace);
    const savedHash=saved?workspaceScreenHash(saved.screen):undefined;
    if(saved&&hash===savedHash){restoreWorkspace(saved);render();return;}
    if(isWorkspaceHistoryKey(history.state?.tourRescueWorkspace)&&!saved&&['simulation','evidence','detail','draft'].includes(hash)){
      if(hash==='simulation'){
        const draft=(()=>{try{return loadSimulation(window.localStorage,simulationScope());}catch{return null;}})();
        if(draft){openSimulation(draft.optionId);notice='Saved local draft restored and rechecked. Confirmed shows remain unchanged.';render();return;}
      }
      incident=initialIncident();
      history.replaceState({screen:'options'},'',location.pathname+location.search+'#rescue');
      startRescue('The earlier audited view is no longer held in this tab. Reopen a direction from the current comparison.');return;
    }
    if(hash==='rescue'){incident=initialIncident();startRescue();return;}
    if(hash==='agency'){openAgency();return;}
    if(hash==='audience'){openAudience();return;}
    if(hash==='simulation'){openSimulation();return;}
    if(hash==='evidence'){openEvidence();return;}
    if(hash==='live-preset'){screen='live-preset';render();return;}
    if(hash==='sos'){sos=restoreSosHistory(history.state?.sos,'problem');openSos();return;}
    if(hash==='detail'||hash==='draft'){
      const chosenId=history.state?.chosenOptionId;
      if(typeof chosenId==='string' && optionById(chosenId)) {
        incident=transitionIncident(initialIncident(),{type:'start-search'});
        incident=transitionIncident(incident,{type:'proposals-ready',runId:projection.runId,optionIds:projection.options.map(o=>o.id)});
        incident=transitionIncident(incident,{type:'choose',optionId:chosenId});
      }
      if(hash==='draft' && chosenProposal){
        if(incident.phase==='chosen')incident=transitionIncident(incident,{type:'prepare-draft'});
        screen='draft';render();return;
      }
      if(hash==='detail' && currentOption()){screen='detail';render();return;}
      startRescue();return;
    }
    if(hash.startsWith('sos-')){
      const stages:Record<string,SosStage>={'sos-problem':'problem','sos-options':'options','sos-quote':'quote','sos-approved':'preview-approved'};
      const stage=stages[hash];
      sos=stage?restoreSosHistory(history.state?.sos,stage):initialSosSample();
      if(stage!==sos.stage)history.replaceState({...history.state,sos},'',location.pathname+location.search+'#'+sosScreen(sos.stage));
      screen=sosScreen(sos.stage);render();return;
    }
    if(['fan','crew','route','plan','economics','economics-terms','ai','documents','team','profile','presale'].includes(hash)){
      screen=hash as Screen;if(screen==='team')workspaceAgency=true;render();return;
    }
    if(hash==='plan-preview' && planSummary){screen='plan-preview';render();return;}
    screen='today';render();
  } finally { followingLocation=false; }
}
window.addEventListener('hashchange', followAppHash);
window.addEventListener('popstate', followAppHash);
window.addEventListener('online',()=>render());window.addEventListener('offline',()=>render());
guide=createGuidedTour({
 descriptions:[
  {title:'Start with the cancelled date',body:'Choose Rescue this date. Four confirmed shows stay locked.'},
  {title:'Compare three options',body:'Replacement, detour or day off. Read PASS, FAIL and UNKNOWN separately from the recommendation.'},
  {title:'Overturn one assumption',body:'Expand Adjust extra-distance preference. Enter 354.1 km and choose Recheck one assumption. Watch Nuremberg change to Frankfurt; daily driving stays fixed.'},
  {title:'Inspect the evidence',body:'Read the two-axis plot, artist omissions, control result and sourced Tag Bridge. UNKNOWN stays unknown.'},
  {title:'Export the current decision',body:'Download the audit or prepare the promoter proposal. Its print A4 and PNG exports share the same audited metrics.'},
  {title:'Accept checked AI research',body:'Replay either saved transcript. Inspect its labelled sources, then explicitly Accept into comparison. The validator runs again and keeps the other card. No live model, booking or outreach starts in this walkthrough.'},
 ],
 onStart:beginGuide,
 onExit:finishGuide,
 navigate:step=>{
   if(step===0){screen='today';render();}
   else if(step===1)startRescue();
   else if(step===2){simulationModel??=projectSimulation(result,'replacement-nuremberg',350);screen='simulation';render();}
   else if(step===3||step===4){const source=simulationModel?.sourceResult??result;const id=simulationModel?.afterRecommendation.optionId??pendingId;openEvidence(source,id);}
   else{screen='ai';render();}
 },
 getTarget:step=>{
   // Highlight the next real control, rather than a tall panel whose coach
   // could obscure its own buttons on a phone.
   const selectors=['[data-action=rescue]','[data-action=review]',
     '.sim-edit[open] [data-action=sim-recheck],.sim-edit:not([open]) summary',
     '.evidence-disclosure:has([data-evidence-tags]) > summary','[data-action=audit]',
     '[data-action=ai-replay]'];
   if(step===5){const accept=root!.querySelector<HTMLButtonElement>('[data-action=ai-accept]:not([disabled])');if(accept)return accept;}
   return root!.querySelector<HTMLElement>(selectors[step]!)??root!.querySelector('[data-tour="'+['cancelled-date','options','breakpoint-limit','evidence','exports','ai'][step]+'"]')??root!.querySelector<HTMLElement>('#main,.focused-screen');
 },
 objective:step=>guideObjective(step,{screen,chosen:incident.phase==='chosen',cap:simulationModel?.maxAdditionalDistanceKm??null,winner:simulationModel?.afterRecommendation.optionId??null,evidenceReads:guideEvidenceReads,exports:guideExports,acceptedDemo:researchHistory.accepted.length}),
});
root!.addEventListener('toggle',event=>{const detail=event.target;if(guide?.isActive()&&detail instanceof HTMLDetailsElement){if(screen==='evidence'&&detail.open&&(detail.textContent?.includes('Tag Bridge')||detail.textContent?.includes('Sources & limitations')))guideEvidenceReads++;guide.refresh();}},true);
followAppHash();
initPwa();
if(new URL(location.href).searchParams.get('tour')==='start'){
 const url=new URL(location.href);url.searchParams.delete('tour');history.replaceState(history.state,'',url);guide.start();
}
