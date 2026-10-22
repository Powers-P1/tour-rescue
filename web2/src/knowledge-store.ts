import {parseTourKnowledge} from '../../src/ai/knowledge.ts';
import type {TourDocument,TourKnowledge} from '../../src/ai/knowledge.ts';
const KEY='tour-rescue.knowledge.v1';
export function loadKnowledge():TourKnowledge{
 try{const text=localStorage.getItem(KEY);if(text)return parseTourKnowledge(JSON.parse(text));}catch{}
 return {schemaVersion:'tour-rescue.knowledge.v1',workspaceId:crypto.randomUUID(),documents:[]};
}
export function saveKnowledge(value:TourKnowledge):void{localStorage.setItem(KEY,JSON.stringify(parseTourKnowledge(value)));}
export function putDocument(value:TourKnowledge,doc:TourDocument):TourKnowledge{
 const next=parseTourKnowledge({...value,documents:[...value.documents.filter(row=>row.id!==doc.id),doc]});saveKnowledge(next);return next;
}
export function withBandProfile(value:TourKnowledge,profile:string):TourKnowledge{
 return parseTourKnowledge({...value,documents:[...value.documents.filter(row=>row.id!=='band-profile'),{id:'band-profile',title:'Band profile and touring preferences',text:profile,updatedAt:new Date().toISOString()}]});
}
