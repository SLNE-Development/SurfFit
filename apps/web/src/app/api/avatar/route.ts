// The only sanctioned non-tRPC mutation route in this app: multipart file
// upload is a binary transport concern that tRPC's JSON pipe doesn't fit.
import { ACCEPTED_AVATAR_TYPES, AVATAR_MAX_BYTES, processAvatarImage } from "@/lib/avatar";
import { db } from "@/lib/db";
import { getStorage } from "@/lib/storage";
import { auth } from "@surffit/auth";
import { createIdentityRepository, createIdentityService, createLogger } from "@surffit/core";
import { newId } from "@surffit/db";

export const dynamic = "force-dynamic";

const logger = createLogger("avatar");

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: { i18nKey: "authz.unauthenticated" } }, { status: 401 });
  }
  const userId = session.user.id;

  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: { i18nKey: "avatar.missing" } }, { status: 400 });
  }

  if (!ACCEPTED_AVATAR_TYPES.includes(file.type)) {
    return Response.json({ error: { i18nKey: "avatar.unsupportedType" } }, { status: 400 });
  }

  if (file.size > AVATAR_MAX_BYTES) {
    return Response.json({ error: { i18nKey: "avatar.tooLarge" } }, { status: 400 });
  }

  const inputBuffer = Buffer.from(await file.arrayBuffer());

  let outputBuffer: Buffer;
  try {
    outputBuffer = await processAvatarImage(inputBuffer);
  } catch {
    return Response.json({ error: { i18nKey: "avatar.invalidImage" } }, { status: 400 });
  }

  const storage = await getStorage();
  const key = `avatars/${userId}/${newId()}.webp`;
  await storage.putObject(key, outputBuffer, { contentType: "image/webp" });

  const identityService = createIdentityService(createIdentityRepository(db));
  const { previousKey } = await identityService.setAvatar(userId, key);

  if (previousKey) {
    storage.deleteObject(previousKey).catch((err) => {
      logger.warn({ err, previousKey }, "failed to delete replaced avatar object");
    });
  }

  const avatarUrl = await storage.getSignedDownloadUrl(key, { expiresInSeconds: 3600 });
  return Response.json({ avatarUrl });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: { i18nKey: "authz.unauthenticated" } }, { status: 401 });
  }
  const userId = session.user.id;

  const identityService = createIdentityService(createIdentityRepository(db));
  const { previousKey } = await identityService.clearAvatar(userId);

  if (previousKey) {
    const storage = await getStorage();
    storage.deleteObject(previousKey).catch((err) => {
      logger.warn({ err, previousKey }, "failed to delete cleared avatar object");
    });
  }

  return Response.json({ ok: true });
}
