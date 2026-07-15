import { db } from "@/lib/db";
import { route, routes } from "@/lib/routes";
import { auth } from "@surffit/auth";
import { createExercisesRepository, createExercisesService } from "@surffit/core";
import { redirect } from "next/navigation";
import { SubmitForms } from "./submit-forms";

export default async function SubmitExercisePage() {
  const session = await auth();
  if (!session?.user) {
    redirect(route(routes.signin, {}));
  }
  if (!session.user.onboarded) {
    redirect(route(routes.onboarding, {}));
  }

  const service = createExercisesService(createExercisesRepository(db));
  const viewer = { id: session.user.id };
  const locale = "en";

  const [equipment, muscleGroups, movements] = await Promise.all([
    service.listEquipment(locale),
    service.listMuscleGroups(locale),
    service.listMovements(viewer, { locale }),
  ]);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-lg font-semibold">Submit an exercise</h1>
        <p className="text-muted-foreground text-sm">
          New submissions enter a pending state until a moderator reviews them.
        </p>
      </div>
      <SubmitForms equipment={equipment} muscleGroups={muscleGroups} movements={movements} />
    </main>
  );
}
