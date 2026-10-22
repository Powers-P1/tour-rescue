import { brand, icon } from './icons.ts';

export type WorkspaceScreen = 'profile' | 'documents' | 'team' | 'presale';
export const isWorkspaceScreen = (screen: string): screen is WorkspaceScreen => ['profile','documents','team','presale'].includes(screen);
export interface WorkspaceContext {
  profile: string;
  hasProposal: boolean;
  agency: boolean;
  presaleOwner: string;
}
const esc = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const button = (label: string, action: string, primary = false) => '<button type="button" class="'+(primary?'primary-button':'text-button')+'" data-action="'+action+'">'+label+'</button>';
export function workspaceView(screen: WorkspaceScreen, ctx: WorkspaceContext): string {
  const content = screen === 'profile' ?
    '<div class="intro"><p class="eyebrow">Band profile · this device</p><h1>Your touring rules.</h1><p class="muted">Describe the band and how you like to travel.</p></div>'+
    '<label for="band-profile">In your own words</label><textarea id="band-profile" rows="7" maxlength="1500">'+esc(ctx.profile)+'</textarea>'+
    '<p class="tiny-label">Saved locally for your planning brief. This does not change the audited rescue constraints or send anything to an AI service.</p>'+
    '<div class="focused-bottom">'+button('Save band profile','profile-save',true)+'</div>' :
  screen === 'documents' ?
    '<div class="intro"><p class="eyebrow">'+(ctx.agency?'Agency':'Northbound')+' workspace</p><h1>Your documents.</h1><p class="muted">Decision evidence and your promoter draft in one place.</p></div>'+
    '<div class="document-row">'+icon('document')+'<div><h2>Decision audit</h2><p class="muted">Current comparison, sources and checks · JSON</p>'+button('Download current audit','audit')+'</div></div>'+
    '<div class="document-row">'+icon('document')+'<div><h2>Promoter proposal</h2><p class="muted">'+(ctx.hasProposal?'Draft prepared in this session. Not sent.':'No proposal prepared yet.')+'</p>'+
    button(ctx.hasProposal?'Open promoter draft':'Choose a rescue direction',ctx.hasProposal?'document-proposal':'rescue',true)+'</div></div>'+
    '<p class="tiny-label">Drafts are session-only. Download or print before closing. No external document store is connected.</p>' :
  screen === 'team' ?
    '<div class="intro"><p class="eyebrow">Roadline Agency · fictional roster</p><h1>Who’s on it.</h1><p class="muted">One owner for each open issue.</p></div>'+
    '<div class="workspace-list"><div><strong>Marta</strong><p>Paper Satellites · local drum repair</p><span class="tiny-label">Today, 16:00 · ICT</span></div>'+
    '<div><strong>You</strong><p>Northbound · canceled Leipzig date</p><span class="tiny-label">14 Nov · CET</span></div>'+
    '<div><strong>'+esc(ctx.presaleOwner)+'</strong><p>Night Ferry · presale follow-up</p>'+button('Review assignment','team-assignment')+'</div></div>'+
    '<p class="tiny-label">Sample assignments only. Nobody is contacted or notified.</p>' :
    '<div class="intro"><p class="eyebrow">Northbound · promotion</p><h1>Check the presale.</h1><p class="muted">Connect actual ticket figures before deciding on a push.</p></div>'+
    '<div class="extension-callout"><strong>? No ticketing data connected.</strong><p>Sales, targets and the venue contact are unknown. Cultural affinity does not fill in those numbers.</p></div>'+
    '<div class="workspace-list"><div><h2>Next steps</h2><ol><li>Confirm current sales with the promoter.</li><li>Check the target and remaining on-sale days.</li><li>Agree who owns the local promotion.</li></ol></div></div>'+
    '<div class="focused-bottom">'+button('Open crew day sheet','tab-crew',true)+'</div>';
  return '<section class="mobile-view rescue-view workspace-view"><header class="mobile-header"><button type="button" class="back-button" data-action="workspace-back">'+icon('back')+'<span>Back</span></button><div class="wordmark workspace-brand">'+brand()+'</div></header>'+content+'</section>';
}
