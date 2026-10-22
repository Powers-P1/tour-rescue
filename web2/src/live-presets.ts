import type { LiveSelection } from '../../web/src/data.ts';
/** Public identities resolved through the existing Worker on2026-10-23. No scores cached here. */
const radiohead={id:'70CAE5BF-2F4C-445C-A3E5-4EDACFC3591C',name:'Radiohead'};
const arctic={id:'E3CF515E-C3EA-46DF-92DD-64A0DC360C90',name:'Arctic Monkeys'};
const dua={id:'1D792A35-7D72-4D57-88D0-C3A4F3E73EF6',name:'Dua Lipa'};
const national={id:'192BB96E-F4BD-4A76-B24E-CD049EC9DFA2',name:'The National'};
export const LIVE_PRESETS:readonly {readonly id:string;readonly selection:LiveSelection}[]=[
 {id:'radiohead',selection:{target:radiohead,comparisons:[national,arctic],control:dua}},
 {id:'arctic-monkeys',selection:{target:arctic,comparisons:[radiohead,national],control:dua}},
 {id:'dua-lipa',selection:{target:dua,comparisons:[radiohead,national],control:arctic}},
];
