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
import { Checkbox } from "@surffit/ui/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@surffit/ui/components/ui/field";
import { Input } from "@surffit/ui/components/ui/input";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function UsernameForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [acceptPolicies, setAcceptPolicies] = useState(false);
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
          claimUsername.mutate({ username, acceptPolicies });
        }}
      >
        <CardContent className="flex flex-col gap-4">
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
          <Field orientation="horizontal">
            <Checkbox
              id="accept-policies"
              checked={acceptPolicies}
              onCheckedChange={(checked) => setAcceptPolicies(checked === true)}
            />
            <FieldLabel htmlFor="accept-policies" className="font-normal">
              I accept the{" "}
              <Link href={route(routes.terms, {})} className="underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href={route(routes.privacy, {})} className="underline">
                Privacy Policy
              </Link>
            </FieldLabel>
          </Field>
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            disabled={claimUsername.isPending || !acceptPolicies}
            className="w-full"
          >
            Continue
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
