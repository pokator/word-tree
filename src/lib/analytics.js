// Umami custom events. The tracker script (index.html) only loads on the
// production domain, so everywhere else -- dev, previews, tests -- window.umami
// is undefined and these are no-ops. Analytics must never break the app, so
// every call is guarded.

export function track(name, data) {
  try {
    window.umami?.track(name, data);
  } catch {
    // tracker failed or blocked -- ignore
  }
}

const sent = new Set();

/** Fires once per page load -- for "did this visitor ever do X" funnel steps. */
export function trackOnce(name, data) {
  if (sent.has(name)) return;
  sent.add(name);
  track(name, data);
}
