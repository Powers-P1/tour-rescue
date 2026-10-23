import test from 'node:test';
import assert from 'node:assert/strict';
import {guideObjective,type GuideFacts} from '../web2/src/guide-objectives.ts';
import {createDemoResult} from '../web/src/data.ts';
import {projectSimulation} from '../web2/src/desktop-model.ts';
const baseline:GuideFacts={screen:'today',chosen:false,cap:350,winner:'replacement-nuremberg',evidenceReads:0,exports:0,acceptedDemo:0};
test('guide completion requires actual user outcomes, including the real solver breakpoint',()=>{
 for(let step=0;step<6;step++)assert.equal(guideObjective(step,baseline).complete,false);
 const model=projectSimulation(createDemoResult(),'replacement-nuremberg',354.1);
 assert.equal(guideObjective(2,{...baseline,cap:model.maxAdditionalDistanceKm,winner:model.afterRecommendation.optionId}).complete,true);
 assert.equal(guideObjective(2,{...baseline,cap:354.1}).complete,false,'input alone does not change the winner');
 assert.equal(guideObjective(2,{...baseline,winner:'detour-frankfurt'}).complete,false,'a different constraint cannot satisfy the required experiment');
 for(const [step,value]of [[0,{screen:'options'}],[1,{chosen:true}],[3,{evidenceReads:1}],[4,{exports:1}],[5,{acceptedDemo:1}]] as const)assert.equal(guideObjective(step,{...baseline,...value}).complete,true);
});
