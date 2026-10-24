import test from 'node:test';
import assert from 'node:assert/strict';
import {guideObjective,type GuideFacts} from '../web2/src/guide-objectives.ts';
import {createDemoResult} from '../web/src/data.ts';
import {projectSimulation} from '../web2/src/desktop-model.ts';
// The browser module is checked with DOM types by web/tsconfig.json. Import its
// pure geometry functions dynamically so Node's core typecheck stays DOM-free.
type Rect={left:number;top:number;width:number;height:number};
const {placeGuideCard,guideControlBounds}:{guideControlBounds(primary:Rect|null,related:readonly Rect[],view:Rect):Rect|null;
 placeGuideCard(view:Rect,card:{width:number;height:number},control:Rect|null,
 compact:boolean,range:{minimum:number;maximum:number}):{left:number;top:number;scrollDelta:number}}=
 await import(new URL('../web/src/guided-tour.ts',import.meta.url).href);
const baseline:GuideFacts={screen:'today',chosen:false,cap:350,winner:'replacement-nuremberg',evidenceReads:0,exports:0,acceptedDemo:0};
test('guide completion requires actual user outcomes, including the real solver breakpoint',()=>{
 for(let step=0;step<6;step++)assert.equal(guideObjective(step,baseline).complete,false);
 const model=projectSimulation(createDemoResult(),'replacement-nuremberg',354.1);
 assert.equal(guideObjective(2,{...baseline,cap:model.maxAdditionalDistanceKm,winner:model.afterRecommendation.optionId}).complete,true);
 assert.equal(guideObjective(2,{...baseline,cap:354.1}).complete,false,'input alone does not change the winner');
 assert.equal(guideObjective(2,{...baseline,winner:'detour-frankfurt'}).complete,false,'a different constraint cannot satisfy the required experiment');
 for(const [step,value]of [[0,{screen:'options'}],[1,{chosen:true}],[3,{evidenceReads:1}],[4,{exports:1}],[5,{acceptedDemo:1}]] as const)assert.equal(guideObjective(step,{...baseline,...value}).complete,true);
});

const phone:Rect={left:0,top:0,width:390,height:844};
const range={minimum:-2000,maximum:2000};
const overlaps=(a:Rect,b:Rect)=>a.left<b.left+b.width&&a.left+a.width>b.left&&a.top<b.top+b.height&&a.top+a.height>b.top;
test('step 4 protects both evidence disclosure controls after normal scrolling',()=>{
 const card={width:356,height:407};
 for(const top of [255.71875,435.71875]){
  const tags={left:24,top,width:342,height:48},sources={...tags,top:top+72};
  const bounds=guideControlBounds(tags,[sources],phone);
  assert.deepEqual(bounds,{...tags,height:120});
  const placed=placeGuideCard(phone,card,bounds,false,range);
  for(const control of [tags,sources])assert.equal(overlaps({...control,top:control.top-placed.scrollDelta},
   {...card,left:placed.left,top:placed.top}),false);
 }
 const offscreenTags={left:24,top:-700,width:342,height:48},sources={...offscreenTags,top:330};
 assert.deepEqual(guideControlBounds(offscreenTags,[sources],phone),sources,'protect the visible source when expanded tags are above the viewport');
});
test('expanded phone coach scrolls the actual goal and focused neighboring input into a free band',()=>{
 const card={width:356,height:440};
 // Reviewer reproduction: Recheck at y408 after filling 354.1 while expanded.
 const goal:Rect={left:24,top:408,width:211,height:48};
 for(const protectedArea of [goal,{left:24,top:330,width:342,height:126}]){
  const placed=placeGuideCard(phone,card,protectedArea,false,range);
  assert.notEqual(placed.scrollDelta,0,'centering without making room would cover the control');
  const moved={...protectedArea,top:protectedArea.top-placed.scrollDelta};
  assert.equal(overlaps(moved,{...card,left:placed.left,top:placed.top}),false);
  assert.ok(moved.top>=16&&moved.top+moved.height<=phone.height-16);
 }
});

test('compact phone coach stays at the bottom instead of following the audit over its adjacent proposal action',()=>{
 const card={width:356,height:74},audit:Rect={left:24,top:330,width:342,height:54};
 const proposal:Rect={left:24,top:400,width:260,height:48};
 const first=placeGuideCard(phone,card,audit,true,range);
 const scrolled=placeGuideCard(phone,card,{...audit,top:230},true,range);
 assert.equal(first.top,phone.height-card.height-16);
 assert.equal(first.top,scrolled.top);
 assert.equal(overlaps(proposal,{...card,left:first.left,top:first.top}),false);
 // Runtime clips the usable viewport to the top of a visible fixed nav.
 const navTop=phone.height-77;
 const withNav=placeGuideCard({...phone,height:navTop},card,audit,true,range);
 assert.ok(withNav.top+card.height<navTop);
});

test('short visual viewport keeps a focused neighboring control clear of the compact dock',()=>{
 const view={left:0,top:80,width:390,height:320},card={width:356,height:74};
 const focused={left:24,top:315,width:240,height:48};
 const placed=placeGuideCard(view,card,focused,true,{minimum:0,maximum:1000});
 const moved={...focused,top:focused.top-placed.scrollDelta};
 assert.ok(placed.scrollDelta>0);
 assert.equal(overlaps(moved,{...card,left:placed.left,top:placed.top}),false);
 assert.ok(placed.top>=view.top+16&&placed.top+card.height<=view.top+view.height-16);
});

test('expanded coach chooses the feasible scroll direction at a document edge and preserves desktop side placement',()=>{
 const card={width:356,height:440},goal={left:24,top:408,width:211,height:48};
 const placed=placeGuideCard(phone,card,goal,false,{minimum:0,maximum:1000});
 assert.ok(placed.scrollDelta>0,'cannot scroll upwards at the top of the document');
 assert.equal(overlaps({...goal,top:goal.top-placed.scrollDelta},{...card,left:placed.left,top:placed.top}),false);
 const desktop=placeGuideCard({left:0,top:0,width:1536,height:1024},card,{left:480,top:300,width:300,height:48},false,range);
 assert.equal(desktop.left,794);assert.equal(desktop.top,300);assert.equal(desktop.scrollDelta,0);
});
