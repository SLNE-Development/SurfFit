import { createLogger, gdprSweepEvent, publishEvent } from "@surffit/core";
import type { ConfirmChannel } from "amqplib";

export type StartCronOptions = {
  channel: ConfirmChannel;
  intervalMs?: number;
};

const DEFAULT_INTERVAL_MS = 3_600_000;

// Safe to run in every worker replica: the gdpr sweep is claim-based
// (conditional updates / SELECT ... FOR UPDATE SKIP LOCKED), so concurrent
// sweeps from multiple replicas never double-process the same row.
export function startCron(opts: StartCronOptions): { stop(): void } {
  const logger = createLogger("cron");
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;

  let stopped = false;

  async function tick(): Promise<void> {
    try {
      await publishEvent(opts.channel, gdprSweepEvent.create({}));
    } catch (err) {
      logger.error({ err }, "failed to publish gdpr.sweep");
    }
  }

  void tick();
  const timer = setInterval(() => {
    if (stopped) return;
    void tick();
  }, intervalMs);

  return {
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
    },
  };
}
