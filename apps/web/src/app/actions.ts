"use server";

import { route, routes } from "@/lib/routes";
import { signOut } from "@surffit/auth";

export async function signOutAction() {
  await signOut({ redirectTo: route(routes.home, {}) });
}
