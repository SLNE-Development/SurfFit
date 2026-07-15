import { db } from "@/lib/db";
import { auth } from "@surffit/auth";
import { createExercisesRepository, createExercisesService } from "@surffit/core";
import { CatalogBrowser } from "./catalog-browser";

export default async function ExercisesPage() {
  const session = await auth();
  const viewer = session?.user ? { id: session.user.id } : null;

  const service = createExercisesService(createExercisesRepository(db));

  // Wiring point: locale hardcoded to "en" until the i18n phase plumbs
  // users.locale through every read (mirrors the Phase 6 pattern).
  const locale = "en";
  const [filters, initialMovements] = await Promise.all([
    Promise.all([service.listEquipment(locale), service.listMuscleGroups(locale)]).then(
      ([equipment, muscleGroups]) => ({ equipment, muscleGroups }),
    ),
    service.listMovements(viewer, { locale }),
  ]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-lg font-semibold">Exercise Catalog</h1>
        <p className="text-muted-foreground text-sm">
          Browse movements and variants, or submit your own for review.
        </p>
      </div>
      <CatalogBrowser filters={filters} initialMovements={initialMovements} />
    </main>
  );
}
