import type { Route } from "next";
import { createRoutes, renderPath } from "typesafe-routes";

export const routes = createRoutes({
  home: { path: [] },
  signin: { path: ["signin"] },
  onboarding: { path: ["onboarding"] },
  terms: { path: ["terms"] },
  privacy: { path: ["privacy"] },
});

export function route<T extends Parameters<typeof renderPath>[0]>(
  ...args: Parameters<typeof renderPath<T>>
): Route {
  return renderPath(...args) as Route;
}
