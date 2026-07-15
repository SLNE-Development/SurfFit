import type { ConfirmChannel } from "amqplib";
import type { EventEnvelope } from "../events/envelope";
import { EVENTS_EXCHANGE } from "./topology";

export async function publishEvent(
  channel: ConfirmChannel,
  envelope: EventEnvelope,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    channel.publish(
      EVENTS_EXCHANGE,
      envelope.type,
      Buffer.from(JSON.stringify(envelope)),
      { persistent: true },
      (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      },
    );
  });
  await channel.waitForConfirms();
}
