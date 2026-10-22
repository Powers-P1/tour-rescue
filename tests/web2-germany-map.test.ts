import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GERMANY_BORDER_RINGS, GERMANY_BORDER_POINT_COUNT,
 GERMANY_OUTLINE_PATH, projectGermany } from '../web2/src/germany-geography.ts';
import { GERMANY_MAP_CITIES, GEOGRAPHIC_KEY_IDS,
 cityById, cityByName, mapPoint, renderGermanyGeographicMap } from '../web2/src/germany-map.ts';
import { createDemoResult } from '../web/src/data.ts';
import { projectRescue } from '../web2/src/model.ts';
import { publicSiteModel } from '../web2/src/marketing-model.ts';
import { landingMarkup } from '../web2/src/marketing.ts';

test('real Natural Earth Germany 10m boundary is a locally bundled simplified 300-600 point multipolygon',()=>{
 const total=GERMANY_BORDER_RINGS.reduce((n,ring)=>n+ring.length,0);
 assert.equal(total,GERMANY_BORDER_POINT_COUNT);
 assert.ok(total>=300&&total<=600,total+' total vertices');
 assert.ok(GERMANY_BORDER_RINGS.length>=3,'keep notable islands');
 const mainland=GERMANY_BORDER_RINGS[0]!;
 const west=Math.min(...mainland.map(p=>p[0]));
 const east=Math.max(...mainland.map(p=>p[0]));
 const north=Math.max(...mainland.map(p=>p[1]));
 const south=Math.min(...mainland.map(p=>p[1]));
 assert.ok(west<5.9&&east>15&&north>54.8&&south<47.4,
   'Natural Earth outline must cover actual Germany extent');
 assert.ok((GERMANY_OUTLINE_PATH.match(/M/g)??[]).length>=3);
 assert.ok(GERMANY_OUTLINE_PATH.length>4000,'outline must not be a rough polygon');
 const source=readFileSync(new URL('../web2/src/germany-geography.ts',import.meta.url),'utf8');
 assert.match(source,/Natural Earth 1:10m/);
 assert.match(source,/public domain/);
 assert.doesNotMatch(source,/fetch\(|https?:\/\/.*\.png/);
});
test('same WGS84 equirectangular projection places genuine city-centre coordinates',()=>{
 const hamburg=cityById('de-hamburg')!;
 const berlin=cityById('de-berlin')!;
 const leipzig=cityById('de-leipzig')!;
 const munich=cityById('de-munich')!;
 assert.equal(hamburg.lat,53.55);
 assert.equal(berlin.lon,13.405);
 assert.equal(leipzig.lat,51.34);
 assert.equal(munich.lon,11.575);
 assert.ok(projectGermany(berlin.lon,berlin.lat)[0]>projectGermany(leipzig.lon,leipzig.lat)[0]);
 assert.ok(mapPoint(berlin)[1]<mapPoint(munich)[1]);
 assert.ok(projectGermany(5.8525,51)[0]<projectGermany(15.02,51)[0]);
 for(const id of GEOGRAPHIC_KEY_IDS)assert.ok(cityById(id),id);
 assert.equal(GERMANY_MAP_CITIES.length,26,'24 frozen + Erfurt/Halle reference only');
 assert.equal(cityByName('Halle')?.id,'de-halle');
 assert.equal(cityByName('Frankfurt')?.id,'de-frankfurt');
 assert.throws(()=>projectGermany(100,30));
});
test('actual Germany SVG renders candidate dashed arcs and cancelled Leipzig without book claims',()=>{
 const core=projectRescue(createDemoResult());
 const options=core.options.filter(o=>o.kind!=='day-off'&&o.cityId);
 const html=renderGermanyGeographicMap({
  scope:'command',from:core.fromCity,cancelled:core.cancelledCity,to:core.toCity,
  proposalIds:options.map(o=>o.cityId!),
  preferredProposalId:options.find(o=>o.recommended)?.cityId,
 });
 assert.match(html,/class="geo-country-outline"/);
 assert.match(html,/class="geo-route-current"/);
 assert.equal((html.match(/data-route-candidate=/g)??[]).length,2);
 assert.match(html,/data-city-id="de-leipzig"/);
 assert.match(html,/geo-cancel-cross/);
 assert.match(html,/Berlin/);
 assert.match(html,/Hamburg/);
 assert.match(html,/Dortmund/);
 assert.match(html,/aria-describedby="geo-key-command"/);
 assert.equal((html.match(/class="geo-key-item"/g)??[]).length,11);
 assert.equal((html.match(/class="geo-city geo-city-/g)??[]).length,26);
 assert.match(html,/lines do not follow roads/);
 assert.doesNotMatch(html,/<image|<foreignObject|<iframe|<script|<style|http:|https:/i);
});
test('landing Germany route is geographic but does not invent booked venue or road detail',()=>{
 const html=landingMarkup(publicSiteModel());
 assert.match(html,/data-map-scope="landing"/);
 assert.match(html,/Nuremberg is a candidate, not a booked venue\. Road checks use a separate OSRM snapshot\./);
 assert.match(html,/Solid: current plan/);
 assert.match(html,/Dashed: Proposed/);
 assert.doesNotMatch(html,/d="M204 20 L370/);
});
