import sharp from "sharp";

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

export async function processAvatarImage(input: Buffer): Promise<Buffer> {
  return sharp(input).rotate().resize(512, 512, { fit: "cover" }).webp({ quality: 85 }).toBuffer();
}
