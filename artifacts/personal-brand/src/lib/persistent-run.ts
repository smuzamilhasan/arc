// persistent-run — keep a long-running async operation's state alive across
// in-app navigation. The state lives in a module-level store (outside the React
// tree), so a page can unmount mid-run and remount later to find the result
// waiting. A `beforeunload` guard covers the hard case — closing/refreshing the
// real browser tab, where the in-flight request actually dies.
//
// Usage:
//   const run = usePersistentRun<MyResult>("calibration");
//   run.start(fetch(...).then(r => r.json()));
//   run.status === "running" | "done" | "error" | "idle"
//   run.data, run.error
//   run.reset();

import { useCallback, useEffect, useSyncExternalStore } from "react";

export type RunStatus = "idle" | "running" | "done" | "error";
export type RunState<T> = { status: RunStatus; data: T | null; error: string | null };

const IDLE: RunState<unknown> = { status: "idle", data: null, error: null };

const store = new Map<string, RunState<unknown>>();
const listeners = new Map<string, Set<() => void>>();

function getSnap<T>(key: string): RunState<T> {
  return (store.get(key) ?? IDLE) as RunState<T>;
}

function emit(key: string) {
  listeners.get(key)?.forEach((l) => l());
}

function setState(key: string, next: RunState<unknown>) {
  store.set(key, next);
  emit(key);
}

/** True if ANY persistent run is currently in flight — used by the unload guard. */
export function isAnyRunActive(): boolean {
  for (const s of store.values()) if (s.status === "running") return true;
  return false;
}

export function usePersistentRun<T>(key: string) {
  const subscribe = useCallback(
    (cb: () => void) => {
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(cb);
      return () => set!.delete(cb);
    },
    [key]
  );

  const snapshot = useCallback(() => getSnap<T>(key), [key]);
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);

  // Start an async op. The promise keeps running even if the component
  // unmounts — its resolution writes back to the module store, not component
  // state, so the result survives navigation.
  const start = useCallback(
    (promise: Promise<T>): Promise<T> => {
      setState(key, { status: "running", data: null, error: null });
      promise
        .then((data) => setState(key, { status: "done", data: data as unknown, error: null }))
        .catch((e) =>
          setState(key, {
            status: "error",
            data: null,
            error: e instanceof Error ? e.message : String(e),
          })
        );
      return promise;
    },
    [key]
  );

  const setData = useCallback(
    (data: T) => setState(key, { status: "done", data: data as unknown, error: null }),
    [key]
  );
  const setError = useCallback(
    (error: string) => setState(key, { status: "error", data: null, error }),
    [key]
  );
  const reset = useCallback(() => setState(key, { ...IDLE }), [key]);

  return {
    status: state.status,
    data: state.data,
    error: state.error,
    start,
    setData,
    setError,
    reset,
  };
}

/**
 * Warn the user before unloading the browser tab while any run is active.
 * (In-app navigation is already safe — the run state persists. This only fires
 * on real browser unload: close, refresh, or external navigation.)
 */
export function useUnloadGuard() {
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent): string | undefined => {
      if (isAnyRunActive()) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
      return undefined;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
}
