import { useState } from "react";
import { useClickOutside } from "../lib/useClickOutside";
import { BookmarkIcon, GroupsIcon, MenuIcon, MoonIcon, ReviewIcon, SunIcon, TutorialIcon } from "./icons";

/**
 * The mobile header's single ☰ entry point for everything the desktop
 * header spreads across a button row and an icon toolbar -- search stays
 * outside it, in the bar itself, since it's the most-used control. Every
 * item closes the menu as it acts, except the theme row, which flips in
 * place so you can see the result without reopening. A plain disclosure
 * (trigger + list of buttons), not an ARIA menu -- that role promises
 * arrow-key roving focus this doesn't need.
 */
export default function MobileMenu({
  reviewCount,
  onReview,
  savedCount,
  onOpenSaved,
  groupsCount,
  onOpenGroups,
  onTutorial,
  tutorialDisabled,
  theme,
  onToggleTheme,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useClickOutside(isOpen, () => setIsOpen(false));
  const isDark = theme === "dark";

  function act(fn) {
    return () => {
      setIsOpen(false);
      fn();
    };
  }

  return (
    <div className="mobile-menu" ref={wrapRef}>
      <button
        type="button"
        className="icon-toolbar__btn mobile-menu__trigger"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-controls="mobile-menu-sheet"
        aria-label="Menu"
      >
        <MenuIcon />
      </button>
      {isOpen && (
        <div className="mobile-menu__sheet" id="mobile-menu-sheet">
          {/* Only while Anki is connected -- reviews happen there. */}
          {onReview && (
            <button type="button" className="mobile-menu__item" onClick={act(onReview)}>
              <ReviewIcon />
              <span className="mobile-menu__label">Review in Anki</span>
              {reviewCount > 0 && <span className="mobile-menu__count">{reviewCount}</span>}
            </button>
          )}
          <button type="button" className="mobile-menu__item" onClick={act(onOpenSaved)}>
            <BookmarkIcon />
            <span className="mobile-menu__label">Bookmarks</span>
            {savedCount > 0 && <span className="mobile-menu__count">{savedCount}</span>}
          </button>
          <button type="button" className="mobile-menu__item" onClick={act(onOpenGroups)}>
            <GroupsIcon />
            <span className="mobile-menu__label">Groups</span>
            {groupsCount > 0 && <span className="mobile-menu__count">{groupsCount}</span>}
          </button>
          <button
            type="button"
           
            className="mobile-menu__item"
            onClick={act(onTutorial)}
            disabled={tutorialDisabled}
          >
            <TutorialIcon />
            <span className="mobile-menu__label">Tutorial</span>
          </button>
          <button type="button" className="mobile-menu__item" onClick={onToggleTheme}>
            {isDark ? <MoonIcon /> : <SunIcon />}
            <span className="mobile-menu__label">{isDark ? "Switch to light theme" : "Switch to dark theme"}</span>
          </button>
          {/* The desktop credit is a fixed corner link, which would sit on
              top of the graph on a phone -- it lives here instead. */}
          <a className="mobile-menu__credit" href="https://souravbanerjee.com" target="_blank" rel="noopener noreferrer">
            by Sourav Banerjee
          </a>
        </div>
      )}
    </div>
  );
}
