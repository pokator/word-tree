export default function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className="icon-toolbar__btn"
      onClick={onToggle}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? (
        <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
          <path
            d="M20 14.2A8.5 8.5 0 1 1 9.8 4a7 7 0 0 0 10.2 10.2Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
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
      )}
    </button>
  );
}
