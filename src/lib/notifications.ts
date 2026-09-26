"use client";

export type DesktopNotificationPermission =
  | "unsupported"
  | "default"
  | "granted"
  | "denied";

export function getDesktopNotificationSupport(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getDesktopNotificationPermission(): DesktopNotificationPermission {
  if (!getDesktopNotificationSupport()) return "unsupported";
  return Notification.permission as DesktopNotificationPermission;
}

const listeners = new Set<() => void>();
let permissionSnapshot: DesktopNotificationPermission | null = null;

function commitPermission(value: DesktopNotificationPermission): DesktopNotificationPermission {
  if (permissionSnapshot !== value) {
    permissionSnapshot = value;
    listeners.forEach((listener) => listener());
  }
  return value;
}

export function subscribeDesktopPermission(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDesktopPermissionSnapshot(): DesktopNotificationPermission {
  if (permissionSnapshot === null) {
    permissionSnapshot = getDesktopNotificationPermission();
  }
  return permissionSnapshot;
}

export function getDesktopPermissionServerSnapshot(): DesktopNotificationPermission {
  return "default";
}

/**
 * Prompts the OS-level permission dialog. Browsers may ignore the request
 * outside of a user gesture — callers should treat "default" as "ask later".
 */
export async function requestDesktopNotificationPermission(): Promise<DesktopNotificationPermission> {
  if (!getDesktopNotificationSupport()) {
    return commitPermission("unsupported");
  }
  if (Notification.permission !== "default") {
    return commitPermission(Notification.permission as DesktopNotificationPermission);
  }
  try {
    const result = await Notification.requestPermission();
    return commitPermission(result as DesktopNotificationPermission);
  } catch {
    return commitPermission(Notification.permission as DesktopNotificationPermission);
  }
}

/** Fires an OS desktop popup. Returns false when it could not be shown. */
export function showDesktopNotification(options: {
  title: string;
  body?: string;
  tag?: string;
}): boolean {
  if (!getDesktopNotificationSupport() || Notification.permission !== "granted") {
    return false;
  }
  try {
    const notification = new Notification(options.title, {
      body: options.body,
      tag: options.tag,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
    return true;
  } catch {
    return false;
  }
}
