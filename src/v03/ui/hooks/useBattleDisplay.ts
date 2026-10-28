import { useCallback, useEffect, useRef, useState } from 'react';

export type BattlePanel = 'commands' | 'minimap' | 'help' | 'topbar' | 'rail';
const DEFAULT_PANELS: Record<BattlePanel, boolean> = {
  commands: true,
  minimap: true,
  help: false,
  topbar: true,
  rail: true,
};

/** Presentation only: expanding or hiding panels never changes the campaign. */
export function useBattleDisplay(enabled: boolean) {
  const root = useRef<HTMLElement>(null);
  const [panels, setPanels] = useState(DEFAULT_PANELS);
  const [expanded, setExpanded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const previousPanels = useRef(DEFAULT_PANELS);
  const nativeFullscreen = useRef(false);
  const fullscreenWanted = useRef(false);
  const requestRevision = useRef(0);
  const enabledNow = useRef(enabled);
  enabledNow.current = enabled;
  const restore = useCallback(() => {
    setExpanded(false);
    setPanels(previousPanels.current);
  }, []);
  const expand = () => {
    if (expanded) return;
    previousPanels.current = panels;
    setPanels({ ...panels, commands: false, help: false, topbar: false, rail: false });
    setExpanded(true);
  };
  const leave = useCallback(() => {
    fullscreenWanted.current = false;
    requestRevision.current++;
    nativeFullscreen.current = false;
    setFullscreen(false);
    restore();
    if (root.current && document.fullscreenElement === root.current)
      void document.exitFullscreen().catch(() => {});
  }, [restore]);
  useEffect(() => {
    const element = root.current;
    const changed = () => {
      const active = document.fullscreenElement === element && element !== null;
      // A pending browser request may complete after Restore, navigation or unmount.
      if (active && (!fullscreenWanted.current || !enabledNow.current)) {
        void document.exitFullscreen().catch(() => {});
        return;
      }
      setFullscreen(active);
      if (!active && nativeFullscreen.current) {
        fullscreenWanted.current = false;
        restore();
      }
      nativeFullscreen.current = active;
    };
    document.addEventListener('fullscreenchange', changed);
    return () => {
      fullscreenWanted.current = false;
      requestRevision.current++;
      document.removeEventListener('fullscreenchange', changed);
      if (element && document.fullscreenElement === element)
        void document.exitFullscreen().catch(() => {});
    };
  }, [restore]);
  useEffect(() => {
    if (!enabled && (expanded || fullscreenWanted.current)) leave();
  }, [enabled, expanded, leave]);
  const toggleFullscreen = async () => {
    if (fullscreen || fullscreenWanted.current) {
      leave();
      return;
    }
    expand();
    fullscreenWanted.current = true;
    const revision = ++requestRevision.current;
    const element = root.current;
    // Embedded browsers may decline native fullscreen; window expansion still works.
    try {
      await element?.requestFullscreen();
      if (
        (!fullscreenWanted.current || !enabledNow.current || root.current !== element) &&
        element &&
        document.fullscreenElement === element
      )
        void document.exitFullscreen().catch(() => {});
    } catch {
      if (requestRevision.current === revision) fullscreenWanted.current = false;
    }
  };
  return {
    root,
    panels,
    expanded,
    fullscreen,
    expand,
    leave,
    toggleFullscreen,
    toggle: (panel: BattlePanel) => setPanels((value) => ({ ...value, [panel]: !value[panel] })),
  };
}

export type BattleDisplay = ReturnType<typeof useBattleDisplay>;
