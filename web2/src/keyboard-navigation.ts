/** Pure keyboard-navigation policy for WAI-ARIA tabs and radio groups. */
export type RovingKind = 'tablist'|'radiogroup';
export function nextRovingIndex(
 key:string,current:number,total:number,kind:RovingKind,
):number|null{
 if(!Number.isInteger(current)||current<0||!Number.isInteger(total)||total<1||current>=total)return null;
 if(key==='Home')return 0;
 if(key==='End')return total-1;
 if(key==='ArrowRight'||(kind==='radiogroup'&&key==='ArrowDown'))return (current+1)%total;
 if(key==='ArrowLeft'||(kind==='radiogroup'&&key==='ArrowUp'))return (current-1+total)%total;
 return null;
}
