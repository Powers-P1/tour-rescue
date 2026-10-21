import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publicSiteModel } from '../web2/src/marketing-model.ts';
import { judgesMarkup } from '../web2/src/marketing.ts';

const errorPage=readFileSync(new URL('../web2/404.html',import.meta.url),'utf8');
const marketingCSS=readFileSync(new URL('../web2/src/marketing.css',import.meta.url),'utf8');

test('404 uses only stylesheet classes and distinct accessible navigation',()=>{
 assert.doesNotMatch(errorPage,/\sstyle\s*=/i,'CSP forbids inline styles');
 assert.match(errorPage,/class="site-shell not-found-page"/);
 assert.match(marketingCSS,/\.not-found-page\s*\{[^}]*padding-top:/);
 assert.match(errorPage,/class="not-found-links"/);
 for(const href of ['/', '/judges/', '/app/']){
   assert.match(errorPage,new RegExp('href="'+href.replaceAll('/','\\/')+'"'));
 }
 const navCSS=marketingCSS.match(/\.not-found-links a\s*\{([^}]+)\}/)?.[1]??'';
 assert.match(navCSS,/min-height:\s*48px/);
 assert.match(navCSS,/display:\s*inline-flex/);
 assert.match(navCSS,/text-decoration:\s*underline/);
});

test('judges links expose both targets as >=48px controls',()=>{
 const html=judgesMarkup(publicSiteModel());
 assert.equal((html.match(/class="judges-external-link"/g)??[]).length,2);
 for(const label of ['Public source &amp; licence ↗','Agent contract ↗']){
   assert.ok(html.includes(label));
 }
 const css=marketingCSS.match(/\.judges-external-link\s*\{([^}]+)\}/)?.[1]??'';
 assert.match(css,/min-height:\s*48px/);
 assert.match(css,/display:\s*inline-flex/);
});

test('desktop Review includes a visible Back and renderer checks actual focus restoration',()=>{
 const source=readFileSync(new URL('../web2/src/main.ts',import.meta.url),'utf8');
 const styles=readFileSync(new URL('../web2/src/desktop.css',import.meta.url),'utf8');
 assert.match(source,/desktop-review-back/);
 assert.match(styles,/\.desktop-centered \.desktop-review-back\s*\{/);
 assert.match(source,/node\.getClientRects\(\)\.length === 0/);
 assert.match(source,/document\.activeElement === node/);
 assert.match(source,/if \(!tryRestoreFocus\(restored\)\) focusFirstHeading/);
});
