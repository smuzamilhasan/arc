// IngestNotifier — emits IngestEvent so downstream consumers (voice extractor)
// can react to a successful ingest run.
//
// Foundation implementation: in-process EventEmitter. We can swap to BullMQ /
// Postgres LISTEN/NOTIFY later without touching dispatcher callers.

import { EventEmitter } from "node:events";
import type { IngestEvent, IngestNotifier } from "./dispatcher";

const EVENT_NAME = "ingest:samples-ready";

class InProcessNotifier implements IngestNotifier {
  private readonly emitter = new EventEmitter();

  async emit(event: IngestEvent): Promise<void> {
    this.emitter.emit(EVENT_NAME, event);
  }

  /** Subscribe to ingest events. Returns an unsubscribe function. */
  on(handler: (event: IngestEvent) => void | Promise<void>): () => void {
    const wrapped = (event: IngestEvent) => {
      // Fire-and-forget; consumers handle their own errors.
      Promise.resolve(handler(event)).catch((err) => {
        console.error("[ingest notifier] consumer threw:", err);
      });
    };
    this.emitter.on(EVENT_NAME, wrapped);
    return () => this.emitter.off(EVENT_NAME, wrapped);
  }
}

export const ingestNotifier = new InProcessNotifier();
