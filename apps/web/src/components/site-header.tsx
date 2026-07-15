import { route, routes } from "@/lib/routes";
import { getAvatarUrl, getStorage } from "@/lib/storage";
import { auth } from "@surffit/auth";
import { Button } from "@surffit/ui/components/ui/button";
import Link from "next/link";
import { UserMenu } from "./user-menu";

export async function SiteHeader() {
  const session = await auth();

  return (
    <header className="flex items-center justify-between border-b px-4 py-3">
      <Link href={route(routes.home, {})} className="font-semibold">
        SurfFit
      </Link>
      {session?.user ? (
        <UserMenu
          username={session.user.username}
          displayName={session.user.displayName}
          avatarUrl={await getAvatarUrl(await getStorage(), session.user.avatarKey)}
        />
      ) : (
        <Button nativeButton={false} render={<Link href={route(routes.signin, {})} />}>
          Sign in
        </Button>
      )}
    </header>
  );
}
