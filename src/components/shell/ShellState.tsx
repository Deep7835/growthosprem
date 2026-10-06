"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { SIDEBAR_COOKIE } from "@/lib/shell";

interface Shell {
  /** Wide screens: the sidebar is hidden (remembered in a cookie, so the server renders it right). */
  collapsed: boolean;
  /** Narrow screens: the sidebar is open as a drawer. */
  drawer: boolean;
  /** The top bar's sidebar button: collapses on wide screens, opens the drawer on narrow ones. */
  toggle: () => void;
  closeDrawer: () => void;
}

const ShellContext = createContext<Shell>({ collapsed: false, drawer: false, toggle: () => {}, closeDrawer: () => {} });

export function ShellProvider({ initialCollapsed, children }: { initialCollapsed: boolean; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [drawer, setDrawer] = useState(false);
  const toggle = useCallback(() => {
    if (window.matchMedia("(min-width: 768px)").matches) {
      document.cookie = `${SIDEBAR_COOKIE}=${collapsed ? "open" : "collapsed"}; path=/; max-age=31536000; samesite=lax`;
      setCollapsed(!collapsed);
    } else setDrawer((d) => !d);
  }, [collapsed]);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  const value = useMemo(() => ({ collapsed, drawer, toggle, closeDrawer }), [collapsed, drawer, toggle, closeDrawer]);
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export const useShell = () => useContext(ShellContext);
