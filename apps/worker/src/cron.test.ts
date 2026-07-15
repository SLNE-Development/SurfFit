import type { ConfirmChannel } from "amqplib";
import { describe, expect, it } from "vitest";
import { startCron } from "./cron";

function createStubChannel(opts: { throwOnCallIndex?: number } = {}) {
  const publishes: Array<{ exchange: string; routingKey: string }> = [];
  let callIndex = 0;

  const channel = {
    publish(
      exchange: string,
      routingKey: string,
      _content: Buffer,
      _options: unknown,
      callback?: (err: Error | null) => void,
    ) {
      const currentIndex = callIndex++;
      if (opts.throwOnCallIndex === currentIndex) {
        callback?.(new Error("simulated publish failure"));
        return false;
      }
      publishes.push({ exchange, routingKey });
      callback?.(null);
      return true;
    },
    async waitForConfirms() {},
  } as unknown as ConfirmChannel;

  return { channel, publishes };
}

describe("startCron", () => {
  it("publishes gdpr.sweep to surffit.events at least 3 times within ~180ms at intervalMs 50", async () => {
    const { channel, publishes } = createStubChannel();
    const cron = startCron({ channel, intervalMs: 50 });

    await new Promise((resolve) => setTimeout(resolve, 180));
    cron.stop();

    expect(publishes.length).toBeGreaterThanOrEqual(3);
    for (const p of publishes) {
      expect(p.exchange).toBe("surffit.events");
      expect(p.routingKey).toBe("gdpr.sweep");
    }
  });

  it("stop() halts further publishes", async () => {
    const { channel, publishes } = createStubChannel();
    const cron = startCron({ channel, intervalMs: 30 });

    await new Promise((resolve) => setTimeout(resolve, 60));
    cron.stop();
    const countAtStop = publishes.length;

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(publishes.length).toBe(countAtStop);
  });

  it("a channel that throws once doesn't kill subsequent ticks", async () => {
    const { channel, publishes } = createStubChannel({ throwOnCallIndex: 0 });
    const cron = startCron({ channel, intervalMs: 30 });

    await new Promise((resolve) => setTimeout(resolve, 120));
    cron.stop();

    expect(publishes.length).toBeGreaterThan(0);
  });
});
