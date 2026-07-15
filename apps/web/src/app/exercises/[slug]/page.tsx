import { db } from "@/lib/db";
import { auth } from "@surffit/auth";
import { NotFoundError, createExercisesRepository, createExercisesService } from "@surffit/core";
import { Alert, AlertTitle } from "@surffit/ui/components/ui/alert";
import { Badge } from "@surffit/ui/components/ui/badge";
import { Card, CardContent, CardHeader } from "@surffit/ui/components/ui/card";
import { notFound } from "next/navigation";

export default async function MovementPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  const viewer = session?.user ? { id: session.user.id } : null;

  const service = createExercisesService(createExercisesRepository(db));

  let movement: Awaited<ReturnType<typeof service.getMovementBySlug>>;
  try {
    movement = await service.getMovementBySlug(viewer, "en", slug);
  } catch (err) {
    if (err instanceof NotFoundError) {
      notFound();
    }
    throw err;
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">{movement.name}</h1>
        {movement.status !== "approved" ? (
          <Alert>
            <AlertTitle>
              {movement.status === "rejected" ? "Rejected" : "Pending review"}
            </AlertTitle>
          </Alert>
        ) : null}
        <Badge variant="outline" className="w-fit">
          {movement.difficulty}
        </Badge>
        {movement.description ? (
          <p className="text-muted-foreground">{movement.description}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {movement.variants.map((variant) => (
          <Card key={variant.id}>
            <CardHeader className="flex flex-col gap-2">
              <h3 className="font-medium">{variant.name}</h3>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{variant.equipmentSlug}</Badge>
                {variant.isUnilateral ? <Badge variant="secondary">Unilateral</Badge> : null}
                {variant.status !== "approved" ? <Badge>Pending review</Badge> : null}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {variant.muscles.map((muscle) => (
                  <Badge
                    key={muscle.slug}
                    variant={muscle.role === "primary" ? "default" : "outline"}
                  >
                    {muscle.name}
                  </Badge>
                ))}
              </div>
              {variant.description ? <p className="text-sm">{variant.description}</p> : null}
              {variant.instructions ? (
                <p className="text-muted-foreground text-sm">{variant.instructions}</p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
