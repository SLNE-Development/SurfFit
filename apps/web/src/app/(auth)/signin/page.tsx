import { signIn } from "@surffit/auth";
import { Button } from "@surffit/ui/components/ui/button";

export default function SignInPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Sign in to SurfFit</h1>
      <form
        action={async () => {
          "use server";
          await signIn("discord");
        }}
      >
        <Button type="submit">Continue with Discord</Button>
      </form>
    </main>
  );
}
