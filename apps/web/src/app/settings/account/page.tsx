import { AccountPanels } from "./account-panels";

export default function SettingsAccountPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-lg font-semibold">Account</h1>
        <p className="text-muted-foreground text-sm">
          Consents, data export, and account deletion.
        </p>
      </div>
      <AccountPanels />
    </div>
  );
}
