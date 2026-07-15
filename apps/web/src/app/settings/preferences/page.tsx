import { db } from "@/lib/db";
import { auth } from "@surffit/auth";
import { createIdentityRepository, createIdentityService } from "@surffit/core";
import { PreferencesForm } from "./preferences-form";

export default async function SettingsPreferencesPage() {
  const session = await auth();
  const userId = (session?.user as { id: string }).id;

  const identityService = createIdentityService(createIdentityRepository(db));
  const preferences = await identityService.getPreferences(userId);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-lg font-semibold">Preferences</h1>
        <p className="text-muted-foreground text-sm">Units, theme, and workout defaults.</p>
      </div>
      <PreferencesForm initial={preferences} />
    </div>
  );
}
