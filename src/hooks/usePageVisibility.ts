import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Hook that tracks page visibility and suppresses background activity.
 * Prevents refetches, revalidation, and UI updates while the tab is hidden.
 */
export function usePageVisibility() {
  const [isVisible, setIsVisible] = useState(!document.hidden);
  const callbacksRef = useRef<Set<(visible: boolean) => void>>(new Set());

  useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = !document.hidden;
      setIsVisible(visible);
      callbacksRef.current.forEach((cb) => cb(visible));
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const onVisibilityChange = useCallback((cb: (visible: boolean) => void) => {
    callbacksRef.current.add(cb);
    return () => {
      callbacksRef.current.delete(cb);
    };
  }, []);

  return { isVisible, onVisibilityChange };
}

/**
 * Hook to persist and restore view state (active tab, scroll, etc.) per route.
 */
export function useViewStatePersistence(key: string) {
  const storageKey = `obramap_view_state_${key}`;

  const save = useCallback(
    (state: Record<string, unknown>) => {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(state));
      } catch {
        // Ignore storage errors
      }
    },
    [storageKey]
  );

  const restore = useCallback((): Record<string, unknown> | null => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  }, [storageKey]);

  return { save, restore };
}
