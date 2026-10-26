// Pages serves full HTTP 200 bodies for Range requests. Load the complete film
// only on request, then let the native player seek within a local Blob.
export function initFilmPlayer(root: ParentNode): () => void {
  const player = root.querySelector<HTMLElement>('[data-film-player]');
  const video = player?.querySelector<HTMLVideoElement>('[data-film-video]');
  const play = player?.querySelector<HTMLButtonElement>('[data-film-load]');
  const cancel = player?.querySelector<HTMLButtonElement>('[data-film-cancel]');
  const status = player?.querySelector<HTMLElement>('[data-film-status]');
  const progress = player?.querySelector<HTMLProgressElement>('[data-film-progress]');
  const source = player?.dataset.filmSrc;
  const bytes = Number(player?.dataset.filmBytes);
  if (!player || !video || !play || !cancel || !status || !progress || !source || !Number.isSafeInteger(bytes) || bytes <= 0) return () => {};

  let phase: 'idle' | 'loading' | 'ready' | 'error' = 'idle';
  let request: AbortController | null = null;
  let objectUrl: string | null = null;
  const render = (next: typeof phase, message: string) => {
    phase = next;
    player.dataset.filmState = next;
    status.textContent = message;
    play.hidden = next === 'ready';
    play.disabled = next === 'loading';
    play.textContent = next === 'error' ? 'Retry film download (23 MB)' : next === 'loading' ? 'Loading film…' : 'Play the two-minute film (23 MB)';
    cancel.hidden = next !== 'loading';
    progress.hidden = next !== 'loading';
    video.controls = next === 'ready';
    video.tabIndex = next === 'ready' ? 0 : -1;
  };
  const release = () => {
    const active = request;
    request = null;
    active?.abort();
    video.pause();
    if (objectUrl) {
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  };
  const reset = () => {
    release();
    render('idle', 'The film downloads only when you press Play. Full download: 23 MB.');
  };
  const load = async () => {
    if (phase === 'loading' || phase === 'ready') return;
    release();
    const active = new AbortController();
    request = active;
    render('loading', 'Loading the full film (23 MB) so you can seek. You can cancel this download.');
    try {
      const response = await fetch(source, { signal: active.signal, credentials: 'same-origin' });
      if (request !== active) return;
      if (!response.ok) throw new Error('Film download failed.');
      const blob = await response.blob();
      if (request !== active) return;
      if (blob.size !== bytes) throw new Error('Incomplete film download.');
      objectUrl = URL.createObjectURL(new Blob([blob], { type: 'video/mp4' }));
      video.src = objectUrl;
      video.load();
      render('ready', 'Film ready. Native controls support playback, seeking and English captions.');
      video.focus({ preventScroll: true });
      try {
        // This follows the explicit Play request. Some browsers require a fresh
        // gesture after the download; their native Play control stays available.
        await video.play();
      } catch {
        if (request === active && player.dataset.filmState === 'ready') status.textContent = 'Film ready. Press Play in the video controls to start.';
      }
    } catch {
      if (request !== active) return;
      release();
      render('error', 'The film could not be loaded. Retry, download the MP4, or read the transcript below.');
    }
  };
  const stop = () => {
    release();
    render('idle', 'Download cancelled. Press Play to try again, or use the transcript below.');
    play.focus({ preventScroll: true });
  };
  const failed = () => {
    if (phase !== 'ready' || !video.error) return;
    release();
    render('error', 'This browser could not play the film. Retry, download the MP4, or read the transcript below.');
  };
  reset();
  play.addEventListener('click', load);
  cancel.addEventListener('click', stop);
  video.addEventListener('error', failed);
  // Releasing on pagehide also covers navigation into the transcript and BFCache.
  // A restored page presents an idle, usable loader rather than a revoked URL.
  window.addEventListener('pagehide', reset);
  return () => {
    play.removeEventListener('click', load);
    cancel.removeEventListener('click', stop);
    video.removeEventListener('error', failed);
    window.removeEventListener('pagehide', reset);
    reset();
  };
}
