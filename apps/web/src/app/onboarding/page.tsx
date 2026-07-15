import { route, routes } from "@/lib/routes";
import { auth } from "@surffit/auth";
import { redirect } from "next/navigation";
import { UsernameForm } from "./username-form";

export default async function OnboardingPage() {
  const session = await auth();

  if (!session?.user) {
    redirect(route(routes.signin, {}));
  }

  if (session.user.onboarded) {
    redirect(route(routes.home, {}));
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4">
      <UsernameForm />
    </main>
  );
}
