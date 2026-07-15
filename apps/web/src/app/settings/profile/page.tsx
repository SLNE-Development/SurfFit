import { db } from "@/lib/db";
import { getAvatarUrl, getStorage } from "@/lib/storage";
import { auth } from "@surffit/auth";
import { createIdentityRepository, createIdentityService } from "@surffit/core";
import { AvatarSection } from "./avatar-section";
import { ProfileForm } from "./profile-form";

export default async function SettingsProfilePage() {
  const session = await auth();
  const userId = (session?.user as { id: string }).id;

  const identityService = createIdentityService(createIdentityRepository(db));
  const profile = await identityService.getOwnProfile(userId);
  const avatarUrl = await getAvatarUrl(await getStorage(), profile.avatarKey);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-lg font-semibold">Profile</h1>
        <p className="text-muted-foreground text-sm">
          This information appears on your public profile.
        </p>
      </div>
      <AvatarSection initialAvatarUrl={avatarUrl} displayName={profile.displayName} />
      <ProfileForm initial={{ displayName: profile.displayName, biography: profile.biography }} />
    </div>
  );
}
