import { route, routes } from "@/lib/routes";
import { auth } from "@surffit/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await auth();

  if (session?.user && !session.user.onboarded) {
    redirect(route(routes.onboarding, {}));
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2">
      <h1 className="text-4xl font-bold">SurfFit</h1>
      <p className="text-muted-foreground">Track your surf sessions.</p>
    </main>
  );
}
