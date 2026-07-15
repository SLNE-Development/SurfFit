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
  exercises: {
    path: ["exercises"],
    children: {
      movement: { path: [str("slug")] },
      submit: { path: ["submit"] },
    },
  },
  gyms: {
    path: ["gyms"],
    children: {
      gym: { path: [str("gymId")] },
      new: { path: ["new"] },
    },
  },
  moderation: { path: ["moderation"] },
});

export function route<T extends Parameters<typeof renderPath>[0]>(
  ...args: Parameters<typeof renderPath<T>>
): Route {
  return renderPath(...args) as Route;
}
