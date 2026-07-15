import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { processAvatarImage } from "./avatar";

async function buildTestImage(): Promise<Buffer> {
  return sharp({
    create: {
      width: 1024,
      height: 768,
      channels: 3,
      background: { r: 200, g: 30, b: 30 },
    },
  })
    .jpeg()
    .toBuffer();
}

describe("processAvatarImage", () => {
  it("produces a 512x512 webp image with no exif metadata", async () => {
    const input = await buildTestImage();

    const output = await processAvatarImage(input);
    const metadata = await sharp(output).metadata();

    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(512);
    expect(metadata.exif).toBeUndefined();
  });

  it("rejects garbage bytes", async () => {
    const garbage = Buffer.from("not an image");
    await expect(processAvatarImage(garbage)).rejects.toThrow();
  });
});
