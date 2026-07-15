export function parseWorkerQueues(raw: string | undefined, known: string[]): string[] {
  if (!raw || raw.trim() === "") {
    return known;
  }

  const requested = raw.split(",").map((name) => name.trim());

  for (const name of requested) {
    if (!known.includes(name)) {
      throw new Error(`Unknown worker queue "${name}". Valid names: ${known.join(", ")}`);
    }
  }

  return requested;
}
