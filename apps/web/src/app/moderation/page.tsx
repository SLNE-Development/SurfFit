import { db } from "@/lib/db";
import { route, routes } from "@/lib/routes";
import { auth } from "@surffit/auth";
import {
  PermissionDeniedError,
  createModerationRepository,
  createModerationService,
} from "@surffit/core";
import { notFound, redirect } from "next/navigation";
import { ModerationPanels } from "./moderation-panels";

export default async function ModerationPage() {
  const session = await auth();
  if (!session?.user) {
    redirect(route(routes.signin, {}));
  }

  const service = createModerationService(createModerationRepository(db));

  let queue: Awaited<ReturnType<typeof service.getQueue>>;
  let reports: Awaited<ReturnType<typeof service.listReports>>;
  try {
    // The moderation surface stays invisible to non-moderators — a
    // permission failure here reads the same as a missing page.
    [queue, reports] = await Promise.all([
      service.getQueue(session.user.id),
      service.listReports(session.user.id, { status: "open" }),
    ]);
  } catch (err) {
    if (err instanceof PermissionDeniedError) {
      notFound();
    }
    throw err;
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-lg font-semibold">Moderation</h1>
        <p className="text-muted-foreground text-sm">Review submissions and reports.</p>
      </div>
      <ModerationPanels initialQueue={queue} initialReports={reports} />
    </main>
  );
}
