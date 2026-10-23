export interface GuideFacts {screen:string;chosen:boolean;cap:number|null;winner:string|null;evidenceReads:number;exports:number;acceptedDemo:number}
export function guideObjective(step:number,facts:GuideFacts):{complete:boolean;task:string}{
 switch(step){
  case 0:return {complete:facts.screen==='options',task:'Choose Rescue this date. Four confirmed shows stay locked.'};
  case 1:return {complete:facts.chosen,task:'Choose a direction, then use Review to inspect its checks.'};
  case 2:return {complete:facts.cap===354.1&&facts.winner==='detour-frankfurt',task:'Enter 354.1 km and recheck. Confirm Frankfurt replaces Nuremberg.'};
  case 3:return {complete:facts.evidenceReads>0,task:'Expand Tag Bridge or Sources & limitations to inspect what is known.'};
  case 4:return {complete:facts.exports>0,task:'Download the current audit. The file uses this comparison and threshold.'};
  case 5:return {complete:facts.acceptedDemo>0,task:'Replay a saved AI scenario, review its sources, then Accept into comparison.'};
  default:return {complete:false,task:'Unknown walkthrough step.'};
 }
}
