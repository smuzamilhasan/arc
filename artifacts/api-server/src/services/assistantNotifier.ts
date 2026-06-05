import type { Response } from "express";

// In-process pub/sub for live assistant notifications. The background proactive
// scheduler calls notify(clientId) after persisting a new suggestion; any open
// SSE connections for that client receive an event so the web app can refresh
// its unread indicator without polling. State is per-process, which is fine for
// this single-instance app — connections simply reconnect if the process cycles.
const subscribers = new Map<number, Set<Response>>();

export function subscribe(clientId: number, res: Response): void {
  let set = subscribers.get(clientId);
  if (!set) {
    set = new Set();
    subscribers.set(clientId, set);
  }
  set.add(res);
}

export function unsubscribe(clientId: number, res: Response): void {
  const set = subscribers.get(clientId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) subscribers.delete(clientId);
}

export function notify(clientId: number): void {
  const set = subscribers.get(clientId);
  if (!set || set.size === 0) return;
  const payload = `data: ${JSON.stringify({ type: "proactive" })}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch {
      // A broken connection will be cleaned up by its own close handler.
    }
  }
}
