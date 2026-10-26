import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';

// Run the actual browser controller; fake only the DOM and network boundary.
const { initFilmPlayer }: { initFilmPlayer(root: unknown): () => void } =
  await import(new URL('../web2/src/film-player.ts', import.meta.url).href);
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
class Control extends EventTarget {
  hidden = false; disabled = false; textContent = ''; focused = false;
  focus() { this.focused = true; }
  click() { this.dispatchEvent(new Event('click')); }
}
class Video extends EventTarget {
  src = ''; controls = false; tabIndex = -1; paused = true; error: unknown = null;
  loads = 0; plays = 0; focused = false; blockPlay = false;
  load() { this.loads++; }
  pause() { this.paused = true; }
  async play() { this.plays++; if (this.blockPlay) throw new Error('Fresh gesture required'); this.paused = false; }
  focus() { this.focused = true; }
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
}
function harness(t: TestContext, network: typeof fetch) {
  const play = new Control(), cancel = new Control(), status = new Control(), progress = new Control(), video = new Video();
  const controls = new Map<string, unknown>([
    ['[data-film-video]', video], ['[data-film-load]', play], ['[data-film-cancel]', cancel],
    ['[data-film-status]', status], ['[data-film-progress]', progress],
  ]);
  const player = { dataset: { filmSrc: '/film.mp4', filmBytes: '8', filmState: '' },
    setAttribute() {}, querySelector: (selector: string) => controls.get(selector) };
  const lifecycle = new EventTarget();
  const oldWindow = Reflect.get(globalThis, 'window');
  Reflect.set(globalThis, 'window', lifecycle);
  t.mock.method(globalThis, 'fetch', network);
  const created: Blob[] = [], revoked: string[] = [];
  t.mock.method(URL, 'createObjectURL', (blob: Blob) => { created.push(blob); return 'blob:film-' + created.length; });
  t.mock.method(URL, 'revokeObjectURL', (url: string) => { revoked.push(url); });
  const dispose = initFilmPlayer({ querySelector: () => player });
  t.after(() => { dispose(); if (oldWindow === undefined) Reflect.deleteProperty(globalThis, 'window'); else Reflect.set(globalThis, 'window', oldWindow); });
  return { player, play, cancel, status, progress, video, lifecycle, created, revoked, dispose };
}
const film = () => new Response(new Uint8Array(8), { headers: { 'Content-Type': 'video/mp4' } });

test('film is lazy; cancel aborts and a late cancelled body cannot replace a successful retry', async t => {
  const oldBody = deferred<Blob>();
  const signals: AbortSignal[] = [];
  let requests = 0;
  const h = harness(t, (async (_url, options) => {
    requests++; signals.push(options!.signal!);
    return requests === 1 ? { ok: true, blob: () => oldBody.promise } : film();
  }) as typeof fetch);
  assert.equal(requests, 0); assert.equal(h.video.src, ''); assert.equal(h.video.plays, 0);
  h.play.click(); h.play.click(); await tick();
  assert.equal(requests, 1); assert.equal(h.player.dataset.filmState, 'loading');
  assert.equal(h.cancel.hidden, false); assert.equal(h.progress.hidden, false);
  h.cancel.click();
  assert.equal(signals[0]!.aborted, true); assert.equal(h.play.disabled, false);
  assert.equal(h.video.plays, 0); assert.equal(h.play.focused, true);
  h.play.click(); await tick();
  assert.equal(h.player.dataset.filmState, 'ready'); assert.equal(h.video.src, 'blob:film-1');
  assert.equal(h.video.controls, true); assert.equal(h.video.tabIndex, 0); assert.equal(h.video.plays, 1);
  oldBody.resolve(new Blob([new Uint8Array(8)])); await tick();
  assert.equal(h.created.length, 1); assert.equal(h.created[0]!.size, 8);
  assert.equal(h.video.src, 'blob:film-1'); assert.equal(h.video.plays, 1);
  h.lifecycle.dispatchEvent(new Event('pagehide'));
  assert.equal(signals[1]!.aborted, true); assert.deepEqual(h.revoked, ['blob:film-1']);
  assert.equal(h.player.dataset.filmState, 'idle'); assert.equal(h.video.src, ''); assert.equal(h.video.paused, true);
  assert.equal(requests, 2, 'navigation never starts another automatic download');
  h.play.click(); await tick();
  assert.equal(requests, 3); assert.equal(h.player.dataset.filmState, 'ready', 'restored page can load again');
  h.dispose(); assert.deepEqual(h.revoked, ['blob:film-1', 'blob:film-2']);
});

test('failed and incomplete downloads remain retryable; blocked async play retains native controls', async t => {
  let requests = 0;
  const h = harness(t, (async () => {
    requests++;
    return requests === 1 ? new Response('unavailable', { status: 503 }) : requests === 2 ? new Response(new Uint8Array(3)) : film();
  }) as typeof fetch);
  h.play.click(); await tick();
  assert.equal(h.player.dataset.filmState, 'error'); assert.equal(h.cancel.hidden, true);
  assert.equal(h.play.disabled, false); assert.match(h.status.textContent, /download the MP4/);
  h.play.click(); await tick();
  assert.equal(h.player.dataset.filmState, 'error'); assert.equal(h.created.length, 0);
  h.video.blockPlay = true;
  h.play.click(); await tick();
  assert.equal(h.player.dataset.filmState, 'ready'); assert.equal(h.video.controls, true);
  assert.equal(h.video.focused, true); assert.equal(h.video.paused, true);
  assert.match(h.status.textContent, /Press Play in the video controls/);
  h.video.error = new Error('Decoder error'); h.video.dispatchEvent(new Event('error'));
  assert.equal(h.player.dataset.filmState, 'error'); assert.deepEqual(h.revoked, ['blob:film-1']);
  assert.equal(h.video.src, ''); assert.equal(h.play.hidden, false);
});

test('pagehide aborts a pending load without late playback or an error on the restored page', async t => {
  const pending = deferred<Response>(); let signal: AbortSignal | undefined;
  const h = harness(t, (async (_url, options) => { signal = options!.signal!; return pending.promise; }) as typeof fetch);
  h.play.click(); h.lifecycle.dispatchEvent(new Event('pagehide'));
  assert.equal(signal!.aborted, true); assert.equal(h.player.dataset.filmState, 'idle');
  pending.resolve(film()); await tick();
  assert.equal(h.created.length, 0); assert.equal(h.video.plays, 0);
  assert.equal(h.player.dataset.filmState, 'idle'); assert.equal(h.play.disabled, false);
});
