import './landing.css';
import { createDemoResult } from './data.ts';
import { createLanding } from './landing.ts';
import { createLandingModel } from './landing-model.ts';
import { legacyAppRedirect } from './site-routing.ts';

function redirectLegacyApp(): boolean {
  const destination = legacyAppRedirect(window.location);
  if (destination === undefined) return false;
  window.location.replace(destination);
  return true;
}

if (!redirectLegacyApp()) {
  const root = document.getElementById('landing-root');
  try {
    if (root === null) throw new Error('Missing landing container.');
    root.replaceChildren(createLanding(createLandingModel(createDemoResult())));
  } catch {
    // Keep the real demo link available even if preview evaluation fails.
    root?.querySelector('main')?.removeAttribute('aria-busy');
    const status = root?.querySelector('.landing-loading');
    if (status) {
      status.textContent = 'The preview could not be loaded. You can still open the rescue demo.';
      status.setAttribute('role', 'alert');
    }
  }
  window.addEventListener('hashchange', redirectLegacyApp);
}
