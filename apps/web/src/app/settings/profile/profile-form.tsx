"use client";

import { trpc } from "@/lib/trpc/client";
import { Button } from "@surffit/ui/components/ui/button";
import { Field, FieldError, FieldLabel } from "@surffit/ui/components/ui/field";
import { Input } from "@surffit/ui/components/ui/input";
import { Textarea } from "@surffit/ui/components/ui/textarea";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

const BIOGRAPHY_MAX = 500;

export function ProfileForm({
  initial,
}: {
  initial: { displayName: string | null; biography: string | null };
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initial.displayName ?? "");
  const [biography, setBiography] = useState(initial.biography ?? "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const updateProfile = trpc.profile.update.useMutation({
    onSuccess: () => {
      toast.success("Saved");
      router.refresh();
    },
    onError: (error) => {
      const data = error.data as { i18nKey?: string } | null;
      setErrorMessage(data?.i18nKey ?? error.message);
    },
  });

  return (
    <form
      className="flex max-w-md flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setErrorMessage(null);
        updateProfile.mutate({
          displayName: displayName.trim() === "" ? null : displayName,
          biography: biography.trim() === "" ? null : biography,
        });
      }}
    >
      <Field data-invalid={errorMessage ? true : undefined}>
        <FieldLabel htmlFor="displayName">Display name</FieldLabel>
        <Input
          id="displayName"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="biography">Biography</FieldLabel>
        <Textarea
          id="biography"
          value={biography}
          maxLength={BIOGRAPHY_MAX}
          onChange={(event) => setBiography(event.target.value)}
        />
        <p className="text-muted-foreground text-xs">
          {biography.length}/{BIOGRAPHY_MAX}
        </p>
        {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
      </Field>
      <Button type="submit" disabled={updateProfile.isPending} className="w-fit">
        Save
      </Button>
    </form>
  );
}
