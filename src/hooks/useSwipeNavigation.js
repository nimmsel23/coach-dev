import { useEffect, useRef, useState } from 'react';

export function useSwipeNavigation({ navMode, tab, swipeEnabled, setTab, NAV_ITEMS }) {
  const touchStartRef   = useRef(null);
  const gestureTypeRef  = useRef('none');
  const mainRef         = useRef(null);
  const tabRef          = useRef(tab);
  const navModeRef      = useRef(navMode);
  const swipeEnabledRef = useRef(swipeEnabled);
  
  const [swipeHint, setSwipeHint] = useState(null);
  const [slideDirection, setSlideDirection] = useState('bottom');
  const hasVibratedRef  = useRef(false);

  useEffect(() => { tabRef.current = tab; }, [tab]);
  useEffect(() => { navModeRef.current = navMode; }, [navMode]);
  useEffect(() => { swipeEnabledRef.current = swipeEnabled; }, [swipeEnabled]);

  useEffect(() => {
    const mainEl = mainRef.current;
    if (!mainEl) return;

    const triggerVibration = () => {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(10);
      }
    };

    const shouldIgnoreSwipe = (target) => {
      if (!target) return true;
      const isInteractive = target.closest('input, textarea, select, button, a, [role="button"], [data-no-swipe="true"]');
      if (isInteractive) return true;

      let el = target;
      while (el && el.nodeType === 1 && el !== document.body && el !== document.documentElement) {
        if (el.classList && (el.classList.contains('overflow-x-auto') || el.classList.contains('overflow-x-scroll'))) {
          if (el.scrollWidth > el.clientWidth) return true;
        }
        const style = window.getComputedStyle(el);
        if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
          if (el.scrollWidth > el.clientWidth) return true;
        }
        el = el.parentElement;
      }
      return false;
    };

    const onTouchStart = (e) => {
      if (!swipeEnabledRef.current || navModeRef.current !== 'tabs') return;

      const touch = e.touches[0];
      if (shouldIgnoreSwipe(touch.target)) {
        touchStartRef.current = null;
        gestureTypeRef.current = 'scrolling';
        return;
      }

      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now()
      };
      gestureTypeRef.current = 'none';
      hasVibratedRef.current = false;
      setSwipeHint(null);
    };

    const onTouchMove = (e) => {
      if (!touchStartRef.current || gestureTypeRef.current === 'scrolling') return;

      const touch = e.touches[0];
      const deltaX = touchStartRef.current.x - touch.clientX;
      const deltaY = touchStartRef.current.y - touch.clientY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (gestureTypeRef.current === 'none') {
        if (absX > 10 || absY > 10) {
          if (absX > absY * 1.5) {
            gestureTypeRef.current = 'swiping';
          } else {
            gestureTypeRef.current = 'scrolling';
            return;
          }
        } else {
          return;
        }
      }

      if (gestureTypeRef.current === 'swiping') {
        if (e.cancelable) {
          e.preventDefault();
        }

        const HINT_START = 30;
        const MIN_SWIPE = 75;
        const idx = NAV_ITEMS.findIndex(i => i.id === tabRef.current);
        if (idx === -1) return;

        // Perform real-time visual page sliding with rubber-banding at boundaries
        let translation = -deltaX;
        const isAtLeftBoundary = deltaX < 0 && idx === 0;
        const isAtRightBoundary = deltaX > 0 && idx === NAV_ITEMS.length - 1;
        if (isAtLeftBoundary || isAtRightBoundary) {
          translation = translation * 0.25; // 4x resistance
        }
        mainEl.style.transform = `translateX(${translation}px)`;
        mainEl.style.transition = 'none';

        // Trigger detent haptic tick when crossing switch threshold
        const isFarEnough = Math.abs(deltaX) > MIN_SWIPE;
        const canMoveLeft = deltaX > 0 && idx < NAV_ITEMS.length - 1;
        const canMoveRight = deltaX < 0 && idx > 0;
        if (isFarEnough && (canMoveLeft || canMoveRight)) {
          if (!hasVibratedRef.current) {
            triggerVibration();
            hasVibratedRef.current = true;
          }
        } else {
          hasVibratedRef.current = false;
        }

        if      (deltaX >  HINT_START && idx < NAV_ITEMS.length - 1) setSwipeHint('left');
        else if (deltaX < -HINT_START && idx > 0)                    setSwipeHint('right');
        else                                                         setSwipeHint(null);
      }
    };

    const onTouchEnd = (e) => {
      const start = touchStartRef.current;
      const type = gestureTypeRef.current;

      touchStartRef.current = null;
      gestureTypeRef.current = 'none';
      setSwipeHint(null);

      if (!start || type !== 'swiping') {
        if (mainEl) {
          mainEl.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
          mainEl.style.transform = '';
        }
        return;
      }

      const touch = e.changedTouches ? e.changedTouches[0] : null;
      if (!touch) {
        if (mainEl) {
          mainEl.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
          mainEl.style.transform = '';
        }
        return;
      }

      const deltaX = start.x - touch.clientX;
      const deltaY = start.y - touch.clientY;
      const duration = Date.now() - start.time;

      const MIN_SWIPE = 75;
      const MAX_SWIPE_TIME = 300;
      const idx = NAV_ITEMS.findIndex(i => i.id === tabRef.current);
      if (idx === -1) {
        if (mainEl) {
          mainEl.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
          mainEl.style.transform = '';
        }
        return;
      }

      const isQuickFlick = duration < MAX_SWIPE_TIME && Math.abs(deltaX) > 40 && Math.abs(deltaX) > Math.abs(deltaY) * 2;
      const isFarSwipe = Math.abs(deltaX) > MIN_SWIPE;

      if (isQuickFlick || isFarSwipe) {
        if (deltaX > 0 && idx < NAV_ITEMS.length - 1) {
          if (!hasVibratedRef.current) {
            triggerVibration();
          }
          if (mainEl) {
            mainEl.style.transition = 'none';
            mainEl.style.transform = '';
          }
          setSlideDirection('left');
          setTab(NAV_ITEMS[idx + 1].id);
        } else if (deltaX < 0 && idx > 0) {
          if (!hasVibratedRef.current) {
            triggerVibration();
          }
          if (mainEl) {
            mainEl.style.transition = 'none';
            mainEl.style.transform = '';
          }
          setSlideDirection('right');
          setTab(NAV_ITEMS[idx - 1].id);
        } else {
          if (mainEl) {
            mainEl.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
            mainEl.style.transform = '';
          }
        }
      } else {
        if (mainEl) {
          mainEl.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
          mainEl.style.transform = '';
        }
      }
    };

    mainEl.addEventListener('touchstart', onTouchStart, { passive: false });
    mainEl.addEventListener('touchmove',  onTouchMove,  { passive: false });
    mainEl.addEventListener('touchend',   onTouchEnd,   { passive: true });

    return () => {
      mainEl.removeEventListener('touchstart', onTouchStart);
      mainEl.removeEventListener('touchmove',  onTouchMove);
      mainEl.removeEventListener('touchend',   onTouchEnd);
    };
  }, [swipeEnabled, navMode, tab, NAV_ITEMS]);

  return { mainRef, swipeHint, slideDirection, setSlideDirection };
}
