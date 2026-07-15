"use client";

import { signOutAction } from "@/app/actions";
import { route, routes } from "@/lib/routes";
import { Avatar, AvatarFallback, AvatarImage } from "@surffit/ui/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@surffit/ui/components/ui/dropdown-menu";
import Link from "next/link";

export function UserMenu({
  username,
  displayName,
  avatarUrl,
}: {
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}) {
  const fallback = (displayName ?? username ?? "?").charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full">
        <Avatar>
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
          <AvatarFallback>{fallback}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {username ? (
          <DropdownMenuItem render={<Link href={route(routes.profile, { username })} />}>
            Profile
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem render={<Link href={route(routes.settings.profile, {})} />}>
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<form action={signOutAction} className="w-full" />}>
          <button type="submit" className="w-full text-left">
            Sign out
          </button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
