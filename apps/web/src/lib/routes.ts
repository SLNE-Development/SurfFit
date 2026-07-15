import type { Route } from "next";
import { createRoutes, renderPath, str } from "typesafe-routes";

export const routes = createRoutes({
  home: { path: [] },
  signin: { path: ["signin"] },
  onboarding: { path: ["onboarding"] },
  terms: { path: ["terms"] },
  privacy: { path: ["privacy"] },
  profile: { path: ["u", str("username")] },
  settings: {
    path: ["settings"],
    children: {
      profile: { path: ["profile"] },
      preferences: { path: ["preferences"] },
      privacy: { path: ["privacy"] },
      account: { path: ["account"] },
    },
  },
});

export function route<T extends Parameters<typeof renderPath>[0]>(
  ...args: Parameters<typeof renderPath<T>>
): Route {
  return renderPath(...args) as Route;
}
