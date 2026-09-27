// Header/menu icons shared by the desktop icon toolbar and the mobile menu,
// so the two entry points to the same action never drift apart visually.

export function TutorialIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <circle cx="12" cy="12" r="9.25" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M9.4 9.6a2.6 2.6 0 0 1 5.05.87c0 1.73-2.6 2.6-2.6 2.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="11.87" cy="16.85" r="1.05" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function BookmarkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <path
        d="M6.5 3.75h11a.75.75 0 0 1 .75.75v16l-6.25-3.6-6.25 3.6v-16a.75.75 0 0 1 .75-.75Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <line x1="4.5" y1="7" x2="19.5" y2="7" />
        <line x1="4.5" y1="12" x2="19.5" y2="12" />
        <line x1="4.5" y1="17" x2="19.5" y2="17" />
      </g>
    </svg>
  );
}

export function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <line x1="12" y1="3" x2="12" y2="5.2" />
        <line x1="12" y1="18.8" x2="12" y2="21" />
        <line x1="3" y1="12" x2="5.2" y2="12" />
        <line x1="18.8" y1="12" x2="21" y2="12" />
        <line x1="5.6" y1="5.6" x2="7.1" y2="7.1" />
        <line x1="16.9" y1="16.9" x2="18.4" y2="18.4" />
        <line x1="5.6" y1="18.4" x2="7.1" y2="16.9" />
        <line x1="16.9" y1="7.1" x2="18.4" y2="5.6" />
      </g>
    </svg>
  );
}

export function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
      <path
        d="M20 14.2A8.5 8.5 0 1 1 9.8 4a7 7 0 0 0 10.2 10.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}
