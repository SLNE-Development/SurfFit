import { db } from "@/lib/db";
import { route, routes } from "@/lib/routes";
import { getAvatarUrl, getStorage } from "@/lib/storage";
import { auth } from "@surffit/auth";
import { NotFoundError, createIdentityRepository, createIdentityService } from "@surffit/core";
import { Avatar, AvatarFallback, AvatarImage } from "@surffit/ui/components/ui/avatar";
import { Button } from "@surffit/ui/components/ui/button";
import { Card, CardContent, CardHeader } from "@surffit/ui/components/ui/card";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const session = await auth();
  const viewer = session?.user ? { id: session.user.id } : null;

  const identityService = createIdentityService(createIdentityRepository(db));

  let profile: Awaited<ReturnType<typeof identityService.getProfileByUsername>>;
  try {
    profile = await identityService.getProfileByUsername(viewer, username);
  } catch (err) {
    if (err instanceof NotFoundError) {
      notFound();
    }
    throw err;
  }

  const avatarUrl = await getAvatarUrl(await getStorage(), profile.avatarKey);
  const fallback = (profile.displayName ?? profile.username ?? "?").charAt(0).toUpperCase();
  const joined = profile.createdAt.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <Card>
        <CardHeader className="flex flex-col items-center gap-3">
          <Avatar className="size-24">
            {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
            <AvatarFallback className="text-2xl">{fallback}</AvatarFallback>
          </Avatar>
          <div className="text-center">
            <h1 className="text-xl font-semibold">{profile.displayName ?? profile.username}</h1>
            <p className="text-muted-foreground text-sm">@{profile.username}</p>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 text-center">
          {profile.biography ? <p>{profile.biography}</p> : null}
          <p className="text-muted-foreground text-sm">Joined {joined}</p>
          {profile.isOwner ? (
            <Button render={<Link href={route(routes.settings.profile, {})} />}>
              Edit profile
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
