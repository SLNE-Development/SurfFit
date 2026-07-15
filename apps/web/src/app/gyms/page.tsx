import { db } from "@/lib/db";
import { route, routes } from "@/lib/routes";
import { auth } from "@surffit/auth";
import { createGymsRepository, createGymsService } from "@surffit/core";
import { Badge } from "@surffit/ui/components/ui/badge";
import { Button } from "@surffit/ui/components/ui/button";
import { Card, CardContent, CardHeader } from "@surffit/ui/components/ui/card";
import Link from "next/link";
import { GymsBrowser } from "./gyms-browser";

export default async function GymsPage() {
  const session = await auth();
  const viewer = session?.user ? { id: session.user.id } : null;

  const service = createGymsService(createGymsRepository(db));
  const [initialGyms, myGyms] = await Promise.all([
    service.searchGyms(viewer, {}),
    viewer ? service.listMyGyms(viewer.id) : Promise.resolve([]),
  ]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Gyms</h1>
          <p className="text-muted-foreground text-sm">Find a gym or add your own.</p>
        </div>
        <Button nativeButton={false} render={<Link href={route(routes.gyms.new, {})} />}>
          Add your gym
        </Button>
      </div>

      {myGyms.length > 0 ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">My gyms</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
            {myGyms.map((gym) => (
              <Link key={gym.id} href={route(routes.gyms.gym, { gymId: gym.id })}>
                <Card>
                  <CardHeader>
                    <h3 className="font-medium">{gym.name}</h3>
                  </CardHeader>
                  <CardContent className="flex gap-2">
                    <Badge variant="outline">{gym.city}</Badge>
                    {gym.status !== "approved" ? <Badge>Pending review</Badge> : null}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <GymsBrowser initialGyms={initialGyms} />
    </main>
  );
}
