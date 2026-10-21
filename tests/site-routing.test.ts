import assert from 'node:assert/strict';
import test from 'node:test';
import { guidedTourRequest, legacyAppRedirect } from '../web/src/site-routing.ts';

const root = (hash = '', search = '') => ({ pathname: '/', search, hash });

test('legacy app bookmarks move to the fixed app path without carrying arbitrary query data', () => {
  for (const page of ['route', 'options', 'breakpoint', 'evidence', 'audit', 'promoter', 'ai']) {
    assert.equal(legacyAppRedirect(root(`#${page}`, '?utm_source=old&return=https://elsewhere.example')), `/app#${page}`);
    assert.equal(legacyAppRedirect({ ...root(`#${page}`, '?tour=resume&unknown=value'), pathname: '/index.html' }), `/app?tour=resume#${page}`);
  }
  assert.equal(legacyAppRedirect(root('#options', '?tour=start')), '/app?tour=start#options');
});

test('landing section anchors stay on the landing and a supported tour request opens the route', () => {
  for (const hash of ['', '#how-it-works', '#decision', '#faq', '#judges', '#main-content']) {
    assert.equal(legacyAppRedirect(root(hash)), undefined);
  }
  assert.equal(legacyAppRedirect(root('', '?tour=start')), '/app?tour=start#route');
  assert.equal(legacyAppRedirect(root('#faq', '?tour=resume')), '/app?tour=resume#route');
  for (const pathname of ['/app', '/app/', '/app/index.html', '/unknown']) {
    assert.equal(legacyAppRedirect({ pathname, search: '?tour=start', hash: '#route' }), undefined);
  }
});

test('unsupported, duplicated and hostile navigation values cannot become a redirect target', () => {
  for (const search of ['', '?tour=finish', '?tour=https://elsewhere.example', '?tour=start&tour=resume', '?tour=start&tour=start']) {
    assert.equal(guidedTourRequest(search), undefined);
    assert.equal(legacyAppRedirect(root('#faq', search)), undefined);
  }
  for (const hash of ['#https://elsewhere.example', '#//elsewhere.example', '#route?return=elsewhere', '#%72oute', '#Route']) {
    assert.equal(legacyAppRedirect(root(hash)), undefined);
  }
  assert.equal(guidedTourRequest('?tour=start'), 'start');
  assert.equal(guidedTourRequest('?tour=resume'), 'resume');
});
