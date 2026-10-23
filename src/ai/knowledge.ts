/** Small, request-scoped lexical retrieval. No shared index, embeddings or provider page storage. */
export interface TourDocument { readonly id:string; readonly title:string; readonly text:string; readonly updatedAt:string }
export interface TourKnowledge { readonly schemaVersion:'tour-rescue.knowledge.v1'; readonly workspaceId:string; readonly documents:readonly TourDocument[] }
export interface KnowledgeRead { readonly documentId:string; readonly title:string; readonly updatedAt:string; readonly excerpt:string; readonly query:string }
export const TOUR_SKILLS={
 'corridor-repair':{title:'Repair the corridor',purpose:'Find replacement and detour leads within the fixed constraints.',tools:['search_tour_knowledge','get_fit_data','get_road_legs','web_search','validate_option','analyze_decision','generate_audit','submit_proposals']},
 'evidence-gaps':{title:'Resolve evidence gaps',purpose:'Identify missing evidence and prioritize verifiable research. Leave unresolved booking facts UNKNOWN.',tools:['search_tour_knowledge','get_sources','web_search','web_fetch','validate_option','generate_audit','submit_proposals']},
} as const;
export type TourSkill=keyof typeof TOUR_SKILLS;
const obj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const str=(v:unknown,n:number)=>{if(typeof v!=='string'||!v.trim()||v.length>n||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))throw new TypeError('Invalid knowledge text.');return v.trim();};
export function parseTourKnowledge(value:unknown):TourKnowledge {
 if(!obj(value)||value.schemaVersion!=='tour-rescue.knowledge.v1'||Object.keys(value).some(k=>!['schemaVersion','workspaceId','documents'].includes(k))||!Array.isArray(value.documents)||value.documents.length>8)throw new TypeError('Use at most eight text documents.');
 const workspaceId=str(value.workspaceId,100),ids=new Set<string>();let total=0;
 const documents=value.documents.map(raw=>{
  if(!obj(raw)||Object.keys(raw).some(k=>!['id','title','text','updatedAt'].includes(k)))throw new TypeError('Invalid document.');
  const id=str(raw.id,100),title=str(raw.title,120),text=str(raw.text,2000),updatedAt=str(raw.updatedAt,40);
  if(ids.has(id)||!Number.isFinite(Date.parse(updatedAt)))throw new TypeError('Duplicate ID or invalid document date.');ids.add(id);total+=text.length;
  return {id,title,text,updatedAt};
 });
 if(total>6000)throw new TypeError('Knowledge is limited to 6000 characters.');
 return {schemaVersion:'tour-rescue.knowledge.v1',workspaceId,documents};
}
const tokens=(s:string)=>new Set(s.toLocaleLowerCase('en').normalize('NFKC').match(/[\p{L}\p{N}]{2,}/gu)??[]);
export function searchTourKnowledge(knowledge:TourKnowledge|undefined,query:string):KnowledgeRead[]{
 const q=str(query,600),terms=tokens(q);
 return (knowledge?.documents??[]).map((doc,index)=>{
   const parts=doc.text.split(/\n\s*\n/).filter(Boolean);const best=parts.map(text=>({text,score:[...terms].filter(t=>tokens(doc.title+' '+text).has(t)).length})).sort((a,b)=>b.score-a.score)[0];
   return {doc,index,score:best?.score??0,text:best?.text??doc.text};
  }).filter(row=>row.score>0||row.doc.id==='band-profile').sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,3)
  .map(({doc,text})=>({documentId:doc.id,title:doc.title,updatedAt:doc.updatedAt,excerpt:text.slice(0,900),query:q}));
}
export function parseKnowledgeReads(value:unknown):KnowledgeRead[]{
 if(!Array.isArray(value)||value.length>12)throw new TypeError('Invalid knowledge reads.');
 return value.map(raw=>{if(!obj(raw))throw new TypeError('Invalid knowledge read.');const updatedAt=str(raw.updatedAt,40);if(!Number.isFinite(Date.parse(updatedAt)))throw new TypeError('Invalid date.');return {documentId:str(raw.documentId,100),title:str(raw.title,120),updatedAt,excerpt:str(raw.excerpt,900),query:str(raw.query,600)};});
}
/** The model receives only excerpts that fit the same bounded exported audit. */
export function admitKnowledgeReads(history:KnowledgeRead[],rows:readonly KnowledgeRead[]):KnowledgeRead[]{
 return rows.filter(row=>{if(history.some(r=>r.documentId===row.documentId&&r.excerpt===row.excerpt&&r.query===row.query))return true;if(history.length>=12)return false;history.push(row);return true;});
}
