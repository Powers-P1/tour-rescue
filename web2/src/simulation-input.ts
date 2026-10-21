/** Explicit strict decimal input. Number('') must never turn an empty cap into 0 km. */
export function parseExtraDistanceKm(raw:string):number{
 const s=raw.trim();
 if(!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(s))
   throw new RangeError('Enter a numeric distance from 0 to 500 km.');
 const value=Number(s);
 if(!Number.isFinite(value)||value<0||value>500||!Number.isSafeInteger(value*1000))
   throw new RangeError('Enter 0–500 km in 0.001 km increments.');
 return value;
}
