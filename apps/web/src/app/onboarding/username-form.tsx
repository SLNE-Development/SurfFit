"use client";

import { route, routes } from "@/lib/routes";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@surffit/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@surffit/ui/components/ui/card";
import { Field, FieldError, FieldLabel } from "@surffit/ui/components/ui/field";
import { Input } from "@surffit/ui/components/ui/input";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function UsernameForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const claimUsername = trpc.identity.claimUsername.useMutation({
    onSuccess: () => {
      router.push(route(routes.home, {}));
    },
    onError: (error) => {
      const data = error.data as { i18nKey?: string } | null;
      setErrorMessage(data?.i18nKey ?? error.message);
    },
  });

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Choose a username</CardTitle>
        <CardDescription>This is how other surfers will find you.</CardDescription>
      </CardHeader>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setErrorMessage(null);
          claimUsername.mutate({ username });
        }}
      >
        <CardContent>
          <Field data-invalid={errorMessage ? true : undefined}>
            <FieldLabel htmlFor="username">Username</FieldLabel>
            <Input
              id="username"
              name="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="off"
              required
            />
            {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
          </Field>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={claimUsername.isPending} className="w-full">
            Continue
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
