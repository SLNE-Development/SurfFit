import { route, routes } from "@/lib/routes";
import { auth } from "@surffit/auth";
import { redirect } from "next/navigation";
import { GymForm } from "./gym-form";

export default async function NewGymPage() {
  const session = await auth();
  if (!session?.user) {
    redirect(route(routes.signin, {}));
  }
  if (!session.user.onboarded) {
    redirect(route(routes.onboarding, {}));
  }

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-lg font-semibold">Add your gym</h1>
        <p className="text-muted-foreground text-sm">
          New gyms enter a pending state until a moderator reviews them.
        </p>
      </div>
      <GymForm />
    </main>
  );
}
