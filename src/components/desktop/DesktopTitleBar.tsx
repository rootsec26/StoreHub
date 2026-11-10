"use client";

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
} from "react";
import Image from "next/image";
import { Copy, Minus, Square, X } from "lucide-react";
import { isTauriDesktopApp } from "@/lib/platform";

const subscribeNever = () => () => {};

/**
 * Custom window chrome for the StoreHub Tauri desktop app.
 *
 * The desktop window is created with `decorations: false`, so this bar provides
 * the StoreHub-branded title area plus min/max/close controls. It renders
 * nothing in a regular browser — detection is via Tauri's injected internals.
 */
export default function DesktopTitleBar() {
  const isDesktop = useSyncExternalStore(
    subscribeNever,
    isTauriDesktopApp,
    () => false
  );
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isDesktop) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const appWindow = getCurrentWindow();
      if (cancelled) return;

      setMaximized(await appWindow.isMaximized());
      unlisten = await appWindow.onResized(async () => {
        setMaximized(await appWindow.isMaximized());
      });
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [isDesktop]);

  if (!isDesktop) return null;

  async function minimize() {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().minimize();
  }

  async function toggleMaximize() {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const appWindow = getCurrentWindow();
    await appWindow.toggleMaximize();
    setMaximized(await appWindow.isMaximized());
  }

  async function close() {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
  }

  // Stop mousedown propagation so Tauri's drag-region handler can never
  // swallow clicks aimed at the window controls.
  const stopDragPropagation = (e: ReactMouseEvent) => e.stopPropagation();

  const btn =
    "flex h-full w-11 cursor-pointer items-center justify-center text-slate-300 transition-colors hover:bg-white/10 hover:text-white";

  return (
    <div className="sticky top-0 z-[70] flex h-10 items-stretch border-b border-slate-800 bg-slate-900 text-white select-none">
      {/* Drag region — logo + app name. Double-click toggles maximize,
          matching standard Windows title-bar behavior. */}
      <div
        data-tauri-drag-region
        onDoubleClick={toggleMaximize}
        className="flex min-w-0 flex-1 items-center gap-2 px-3"
      >
        <Image
          src="/icon.png"
          alt="StoreHub"
          width={20}
          height={20}
          className="h-5 w-5 shrink-0 rounded-sm"
          draggable={false}
        />
        <span className="truncate text-sm font-semibold tracking-wide">
          StoreHub
        </span>
      </div>

      {/* Window controls — sibling of the drag region (never nested inside
          it), elevated with z-10 so nothing overlaps the buttons. */}
      <div
        dir="ltr"
        className="relative z-10 flex items-stretch"
        onMouseDown={stopDragPropagation}
      >
        <button
          type="button"
          onClick={minimize}
          onMouseDown={stopDragPropagation}
          className={btn}
          aria-label="Minimize"
          title="Minimize"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={toggleMaximize}
          onMouseDown={stopDragPropagation}
          className={btn}
          aria-label={maximized ? "Restore" : "Maximize"}
          title={maximized ? "Restore" : "Maximize"}
        >
          {maximized ? (
            <Copy className="h-3.5 w-3.5" />
          ) : (
            <Square className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={close}
          onMouseDown={stopDragPropagation}
          className={`${btn} hover:bg-red-600 hover:text-white`}
          aria-label="Close"
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
