// Browser plugin unavailable in CI. Exercise the actual film in isolated
// Playwright contexts against the ordinary full-200 preview, never a Range shim.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const port = process.env.QA_PORT ?? '4198';
const base = process.env.BASE_URL ?? 'http://127.0.0.1:' + port;
const out = resolve(process.env.QA_OUTPUT ?? 'artifacts/screenshots/v2/film-player');
const filmPath = '/video/tour-rescue-final-v4.mp4';
const sha256 = 'c9c6a5b8f3a25fc6d25093026567e57ec7cfe4e9fffe3f9da7b701a196c10d4f';
const report = { createdAt: new Date().toISOString(), base, browserRouting: 'Browser plugin not available; isolated Playwright',
  environment: 'Actual built Pages assets. Ordinary web2/serve.mjs returns full HTTP 200 bodies, including for Range requests.',
  checks: [], cleanup: { browserClosed: false, ownServerStopped: null } };
let server, browser;
const settle = page => page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
await mkdir(out, { recursive: true });
try {
  if (!process.env.BASE_URL) {
    server = spawn(process.execPath, ['web2/serve.mjs', '--deploy'], { env: { ...process.env, PORT: port }, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((done, fail) => {
      const timer = setTimeout(() => fail(new Error('Preview did not start')), 10000);
      server.once('error', fail);
      server.once('exit', code => { clearTimeout(timer); fail(new Error('Preview exited: ' + code)); });
      server.stdout.on('data', chunk => { if (chunk.toString().includes('preview:')) { clearTimeout(timer); done(); } });
    });
  }
  const range = await fetch(base + filmPath, { headers: { Range: 'bytes=0-1023' } });
  assert.equal(range.status, 200, 'regression server must reproduce Pages full-200 Range behavior');
  assert.equal(range.headers.get('content-range'), null);
  const full = Buffer.from(await range.arrayBuffer());
  assert.equal(full.length, 23144942);
  assert.equal(createHash('sha256').update(full).digest('hex'), sha256);
  report.httpRange = { status: range.status, bytes: full.length, contentRange: null, sha256 };
  browser = await chromium.launch({ headless: true,
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
    ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {}) });
  report.browserVersion = browser.version();
  for (const width of [390, 1440]) {
    const row = { viewport: { width, height: width === 390 ? 844 : 1000 }, requests: [], responses: [], console: [], errors: [], screenshots: [], seeks: [] };
    report.checks.push(row);
    const context = await browser.newContext({ viewport: row.viewport, locale: 'en-GB', serviceWorkers: 'block' });
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort('blockedbyclient'));
    await context.addInitScript(() => {
      const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = blob => { sessionStorage.setItem('film-created', String(Number(sessionStorage.getItem('film-created') ?? 0) + 1)); return create(blob); };
      URL.revokeObjectURL = url => { sessionStorage.setItem('film-revoked', String(Number(sessionStorage.getItem('film-revoked') ?? 0) + 1)); revoke(url); };
    });
    const page = await context.newPage();
    let phase = 'initial', releaseCancelled;
    page.on('pageerror', error => row.errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') row.console.push({ phase, text: message.text() }); });
    page.on('request', request => { if (new URL(request.url()).pathname === filmPath) row.requests.push({ phase, range: request.headers().range ?? null }); });
    page.on('response', response => { if (new URL(response.url()).pathname === filmPath) row.responses.push({ phase, status: response.status() }); });
    const capture = async name => { const file = width + '-' + name + '.png'; await page.screenshot({ path: resolve(out, file) }); row.screenshots.push(file); };
    const ready = async () => page.waitForFunction(() => {
      const v = document.querySelector('[data-film-video]');
      return v?.currentSrc.startsWith('blob:') && v.readyState >= 2 && v.duration === 120 && v.querySelector('track').readyState === 2;
    });
    try {
      await page.goto(base + '/judges/', { waitUntil: 'networkidle' });
      assert.match(await page.title(), /Tour Rescue/);
      assert.ok((await page.locator('main').innerText()).length > 500);
      await capture('first-viewport');
      assert.equal(row.requests.length, 0, 'opening judges must not download the MP4');
      await page.getByRole('link', { name: 'Watch the two-minute film', exact: true }).click();
      const player = page.locator('[data-film-player]'), video = page.locator('[data-film-video]');
      await video.scrollIntoViewIfNeeded(); await settle(page); await capture('idle');
      assert.equal(row.requests.length, 0, 'scrolling to the poster must not download the MP4');
      assert.equal(await video.getAttribute('src'), null);
      assert.equal(await video.evaluate(v => v.paused), true);

      // Delay the first request, cancel it, then expose a real HTTP error response.
      // Only these failure paths are injected; all decoded frames use the actual MP4.
      let attempts = 0;
      const cancelledGate = new Promise(done => { releaseCancelled = done; });
      await page.route('**' + filmPath, async route => {
        attempts++;
        if (attempts === 1) { await cancelledGate; await route.continue().catch(() => {}); }
        else if (attempts === 2) await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Temporary film unavailability' });
        else await route.continue();
      });
      phase = 'cancelled-download';
      await page.getByRole('button', { name: 'Play the two-minute film (23 MB)', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-film-player]').dataset.filmState === 'loading');
      await page.getByRole('button', { name: 'Cancel download', exact: true }).waitFor();
      await capture('loading');
      await page.getByRole('button', { name: 'Cancel download', exact: true }).click(); releaseCancelled();
      assert.match(await page.locator('[data-film-status]').innerText(), /cancelled/);
      assert.equal(await video.getAttribute('src'), null); assert.equal(await video.evaluate(v => v.paused), true);
      phase = 'injected-http-503';
      await page.getByRole('button', { name: 'Play the two-minute film (23 MB)', exact: true }).click();
      await page.getByRole('button', { name: 'Retry film download (23 MB)', exact: true }).waitFor();
      assert.match(await page.locator('[data-film-status]').innerText(), /could not be loaded/);
      await capture('retry');
      row.cancelAndErrorRetry = 'passed (delayed cancellation and injected HTTP 503)';

      phase = 'playback';
      await page.getByRole('button', { name: 'Retry film download (23 MB)', exact: true }).click();
      await ready();
      row.media = await video.evaluate(v => ({ duration: v.duration, width: v.videoWidth, height: v.videoHeight,
        captions: v.textTracks[0].cues.length, captionMode: v.textTracks[0].mode, source: new URL(v.currentSrc).protocol }));
      assert.deepEqual(row.media, { duration: 120, width: 1920, height: 1080, captions: 39, captionMode: 'showing', source: 'blob:' });
      await video.scrollIntoViewIfNeeded(); await video.focus();
      if (!(await video.evaluate(v => v.paused))) await page.keyboard.press('Space');
      await page.waitForFunction(() => document.querySelector('video').paused);
      await page.keyboard.press('Space');
      await page.waitForFunction(() => { const v = document.querySelector('video'); return !v.paused && v.currentTime > .1; });
      await page.keyboard.press('Space');
      await page.waitForFunction(() => document.querySelector('video').paused);
      row.nativeKeyboardPlayback = 'passed';
      for (const seconds of [3.2, 35, 87, 116]) {
        const decodedTime = await video.evaluate((v, target) => new Promise((done, fail) => {
          const timer = setTimeout(() => fail(new Error('No decoded frame after seek')), 10000);
          v.requestVideoFrameCallback((_now, metadata) => { clearTimeout(timer); done(metadata.mediaTime); });
          v.currentTime = target;
        }), seconds);
        assert.ok(Math.abs(decodedTime - seconds) < .1, 'decoded frame must match the requested seek');
        await page.waitForFunction(target => { const v = document.querySelector('video'); return !v.seeking && v.readyState >= 2 && Math.abs(v.currentTime - target) < .05; }, seconds);
        await settle(page);
        const activeCaptions = await video.evaluate(v => [...v.textTracks[0].activeCues].map(cue => cue.text));
        if (seconds === 3.2) assert.ok(activeCaptions.includes('The band is already on the road.'));
        if (seconds === 87) assert.ok(activeCaptions.includes('Review a sample quote against your budget.'));
        row.seeks.push({ seconds, decodedTime, activeCaptions });
        await capture('at-' + String(seconds).replace('.', '_') + 's');
      }
      const download = page.getByRole('link', { name: 'Download MP4 (23 MB)', exact: true });
      assert.equal(await download.getAttribute('download'), 'TourRescue-jury-final-v4.mp4');
      const pending = page.waitForEvent('download'); await download.click();
      const downloaded = await pending, downloadedBytes = await readFile(await downloaded.path());
      assert.equal(createHash('sha256').update(downloadedBytes).digest('hex'), sha256); await downloaded.delete();
      row.directDownload = { bytes: downloadedBytes.length, sha256 };
      const transcript = page.getByRole('link', { name: 'Read the English transcript', exact: true });
      await transcript.click(); await page.waitForURL('**/video/transcript.txt');
      assert.match(await page.locator('body').innerText(), /Nothing is booked or paid/);
      assert.ok(Number(await page.evaluate(() => sessionStorage.getItem('film-revoked'))) >= 1, 'leaving the player revokes its object URL');
      const beforeBack = row.requests.length;
      await page.goBack({ waitUntil: 'networkidle' });
      await player.waitFor();
      assert.equal(await player.getAttribute('data-film-state'), 'idle');
      assert.equal(row.requests.length, beforeBack, 'Back must not start an automatic download');
      await page.getByRole('button', { name: 'Play the two-minute film (23 MB)', exact: true }).click(); await ready();
      row.transcriptBackAndReload = 'passed'; await capture('after-back');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
      assert.deepEqual(row.errors, []);
      assert.deepEqual(row.console.filter(item => item.phase !== 'injected-http-503'), []);
      assert.ok(row.requests.every(request => request.range === null), 'native video must never request remote ranges');
      assert.ok(row.responses.filter(response => response.phase === 'playback').every(response => response.status === 200));
      row.status = 'passed';
    } catch (error) { row.status = 'failed'; row.error = String(error?.stack ?? error); throw error; }
    finally { releaseCancelled?.(); await context.close(); }
  }
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = String(error?.stack ?? error); process.exitCode = 1; }
finally {
  if (browser) { await browser.close(); report.cleanup.browserClosed = true; }
  if (server) {
    const stopped = new Promise(done => server.once('exit', done)); server.kill();
    await Promise.race([stopped, new Promise(done => setTimeout(done, 2000))]);
    report.cleanup.ownServerStopped = server.exitCode !== null || server.signalCode !== null;
  }
  report.completedAt = new Date().toISOString();
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, error: report.error, checks: report.checks.map(row => ({ viewport: row.viewport, status: row.status, media: row.media, seeks: row.seeks, errors: row.errors })), cleanup: report.cleanup }, null, 2));
}
