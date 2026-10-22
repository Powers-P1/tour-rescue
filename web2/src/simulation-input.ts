/** Explicit strict decimal input. Number('') must never turn an empty cap into 0 km. */
export function parseExtraDistanceKm(raw:string):number{
 const s=raw.trim();
 if(!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(s))
   throw new RangeError('Enter a numeric distance from 0 to 500 km.');
 if(/[1-9]/.test((s.split('.')[1]??'').slice(3)))throw new RangeError('Use whole-metre increments (0.001 km).');
 const value=Number(s);
 const metres=Math.round(value*1000);
 if(!Number.isFinite(value)||value<0||value>500||!Number.isSafeInteger(metres)||Math.abs(value*1000-metres)>1e-7)
   throw new RangeError('Enter 0–500 km in 0.001 km increments.');
 return metres/1000;
}
