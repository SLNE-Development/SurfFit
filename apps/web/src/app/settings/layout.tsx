import { route, routes } from "@/lib/routes";
import { auth } from "@surffit/auth";
import { Separator } from "@surffit/ui/components/ui/separator";
import Link from "next/link";
import { redirect } from "next/navigation";

const NAV_ITEMS = [
  { label: "Profile", route: routes.settings.profile },
  { label: "Preferences", route: routes.settings.preferences },
  { label: "Privacy", route: routes.settings.privacy },
  { label: "Account", route: routes.settings.account },
];

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect(route(routes.signin, {}));
  }
  if (!session.user.onboarded) {
    redirect(route(routes.onboarding, {}));
  }

  return (
    <main className="mx-auto flex max-w-4xl gap-8 px-4 py-12">
      <nav className="flex w-40 shrink-0 flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.label}
            href={route(item.route, {})}
            className="rounded-md px-3 py-1.5 text-sm hover:bg-muted"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <Separator orientation="vertical" className="h-auto" />
      <div className="flex-1">{children}</div>
    </main>
  );
}
