import { db } from "@/lib/db";
import { auth } from "@surffit/auth";
import { createIdentityRepository, createIdentityService } from "@surffit/core";
import { PrivacyForm } from "./privacy-form";

export default async function SettingsPrivacyPage() {
  const session = await auth();
  const userId = (session?.user as { id: string }).id;

  const identityService = createIdentityService(createIdentityRepository(db));
  const privacy = await identityService.getPrivacySettings(userId);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-lg font-semibold">Privacy</h1>
        <p className="text-muted-foreground text-sm">
          Control who can see your profile and activity.
        </p>
      </div>
      <PrivacyForm initial={privacy} />
    </div>
  );
}
