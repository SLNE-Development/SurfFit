"use client";

import { route, routes } from "@/lib/routes";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@surffit/ui/components/ui/button";
import { Field, FieldError, FieldLabel } from "@surffit/ui/components/ui/field";
import { Input } from "@surffit/ui/components/ui/input";
import { Textarea } from "@surffit/ui/components/ui/textarea";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export function GymForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [address, setAddress] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const createGym = trpc.gyms.create.useMutation({
    onSuccess: (result) => {
      toast.success("Submitted for review");
      router.push(route(routes.gyms.gym, { gymId: result.id }));
    },
    onError: (error) => {
      const data = error.data as { i18nKey?: string } | null;
      setErrorMessage(data?.i18nKey ?? error.message);
    },
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setErrorMessage(null);
        createGym.mutate({
          name,
          description: description || null,
          city,
          countryCode,
          address: address || null,
        });
      }}
    >
      <Field data-invalid={errorMessage ? true : undefined}>
        <FieldLabel htmlFor="gym-name">Name</FieldLabel>
        <Input
          id="gym-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
        {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
      </Field>
      <Field>
        <FieldLabel htmlFor="gym-description">Description</FieldLabel>
        <Textarea
          id="gym-description"
          value={description}
          onChange={(event) => setDescription(event.target.value.slice(0, 2000))}
        />
        <p className="text-muted-foreground text-xs">{description.length}/2000</p>
      </Field>
      <Field>
        <FieldLabel htmlFor="gym-city">City</FieldLabel>
        <Input
          id="gym-city"
          value={city}
          onChange={(event) => setCity(event.target.value)}
          required
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="gym-country">Country code</FieldLabel>
        <Input
          id="gym-country"
          value={countryCode}
          onChange={(event) => setCountryCode(event.target.value.toUpperCase())}
          maxLength={2}
          required
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="gym-address">Address</FieldLabel>
        <Input
          id="gym-address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
        />
      </Field>
      <Button type="submit" disabled={createGym.isPending} className="w-fit">
        Submit gym
      </Button>
    </form>
  );
}
