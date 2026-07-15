import { db } from "@/lib/db";
import { auth } from "@surffit/auth";
import {
  NotFoundError,
  createExercisesRepository,
  createExercisesService,
  createGymsRepository,
  createGymsService,
} from "@surffit/core";
import { Alert, AlertTitle } from "@surffit/ui/components/ui/alert";
import { Badge } from "@surffit/ui/components/ui/badge";
import { Card, CardContent, CardHeader } from "@surffit/ui/components/ui/card";
import { Item, ItemContent, ItemTitle } from "@surffit/ui/components/ui/item";
import { notFound } from "next/navigation";
import { GymActions } from "./gym-actions";
import { GymManage } from "./gym-manage";

export default async function GymPage({ params }: { params: Promise<{ gymId: string }> }) {
  const { gymId } = await params;
  const session = await auth();
  const viewer = session?.user ? { id: session.user.id } : null;

  const gymsService = createGymsService(createGymsRepository(db));

  let gym: Awaited<ReturnType<typeof gymsService.getGymById>>;
  try {
    gym = await gymsService.getGymById(viewer, "en", gymId);
  } catch (err) {
    if (err instanceof NotFoundError) {
      notFound();
    }
    throw err;
  }

  const exercisesService = createExercisesService(createExercisesRepository(db));
  const equipmentOptions = gym.isOwner ? await exercisesService.listEquipment("en") : [];

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">{gym.name}</h1>
        <p className="text-muted-foreground text-sm">
          {gym.city}, {gym.countryCode}
          {gym.address ? ` — ${gym.address}` : ""}
        </p>
        {gym.status !== "approved" ? (
          <Alert>
            <AlertTitle>{gym.status === "rejected" ? "Rejected" : "Pending review"}</AlertTitle>
          </Alert>
        ) : null}
        {gym.description ? <p>{gym.description}</p> : null}
        <Badge variant="outline" className="w-fit">
          {gym.memberCount} members
        </Badge>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Equipment</h2>
        {gym.equipment.length === 0 ? (
          <p className="text-muted-foreground text-sm">No equipment listed yet.</p>
        ) : (
          gym.equipment.map((item) => (
            <Item key={item.id}>
              <ItemContent>
                <ItemTitle>{item.label}</ItemTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{item.equipmentName}</Badge>
                  {item.notes ? (
                    <span className="text-muted-foreground text-xs">{item.notes}</span>
                  ) : null}
                </div>
              </ItemContent>
            </Item>
          ))
        )}
      </div>

      <GymActions
        gymId={gym.id}
        isMember={gym.isMember}
        status={gym.status}
        isSignedIn={viewer !== null}
      />

      {gym.isOwner ? (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-medium">Manage</h2>
          </CardHeader>
          <CardContent>
            <GymManage gym={gym} equipmentOptions={equipmentOptions} />
          </CardContent>
        </Card>
      ) : null}
    </main>
  );
}
