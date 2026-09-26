"use client";

const MUTE_KEY = "storehub_mute_notifications";

let audioContext: AudioContext | null = null;
let listenersBound = false;

function safeStorageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode) — in-memory only.
  }
}

export function isNotificationMuted(): boolean {
  if (typeof window === "undefined") return false;
  return safeStorageGet(MUTE_KEY) === "1";
}

const muteListeners = new Set<() => void>();
let clientMuted: boolean | null = null;
let storageBound = false;

function notifyMuteListeners(): void {
  muteListeners.forEach((listener) => listener());
}

function bindStorageListener(): void {
  if (storageBound || typeof window === "undefined") return;
  storageBound = true;
  window.addEventListener("storage", (event) => {
    if (event.key !== MUTE_KEY) return;
    clientMuted = null;
    notifyMuteListeners();
  });
}

/** `useSyncExternalStore` subscription for the mute preference. */
export function subscribeNotificationMuted(listener: () => void): () => void {
  bindStorageListener();
  muteListeners.add(listener);
  return () => {
    muteListeners.delete(listener);
  };
}

export function getNotificationMutedSnapshot(): boolean {
  if (clientMuted === null) clientMuted = isNotificationMuted();
  return clientMuted;
}

export function getNotificationMutedServerSnapshot(): boolean {
  return false;
}

export function setNotificationMuted(muted: boolean): void {
  clientMuted = muted;
  safeStorageSet(MUTE_KEY, muted ? "1" : "0");
  notifyMuteListeners();
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) audioContext = new Ctor();
  return audioContext;
}

/**
 * Browsers block audio until the user interacts with the page. Call this from
 * the first pointerdown/keydown so a later chime is allowed to play.
 */
export function primeNotificationSound(): void {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;

  const unlock = () => {
    const context = getAudioContext();
    if (context && context.state === "suspended") {
      void context.resume().catch(() => {});
    }
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };

  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

function scheduleNote(
  context: AudioContext,
  frequency: number,
  startAt: number,
  duration: number,
  peakGain: number
): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startAt);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.05);
}

/** Soft two-tone chime used when a new pending order arrives. */
export function playOrderChime(): void {
  if (typeof window === "undefined" || isNotificationMuted()) return;

  const context = getAudioContext();
  if (!context) return;

  const play = () => {
    if (context.state !== "running") return;
    const now = context.currentTime + 0.02;
    scheduleNote(context, 659.25, now, 0.28, 0.07); // E5
    scheduleNote(context, 987.77, now + 0.14, 0.4, 0.05); // B5
  };

  if (context.state === "suspended") {
    void context.resume().then(play).catch(() => {});
  } else {
    play();
  }
}
