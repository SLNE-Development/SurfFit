"use client";

import { trpc } from "@/lib/trpc/client";
import { Button } from "@surffit/ui/components/ui/button";
import { Field, FieldError, FieldLabel } from "@surffit/ui/components/ui/field";
import { Input } from "@surffit/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@surffit/ui/components/ui/select";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

type Preferences = {
  unitSystem: "metric" | "imperial";
  theme: "dark" | "light" | "system";
  firstWeekday: number;
  defaultRestSeconds: number;
};

export function PreferencesForm({ initial }: { initial: Preferences }) {
  const router = useRouter();
  const [unitSystem, setUnitSystem] = useState(initial.unitSystem);
  const [theme, setTheme] = useState(initial.theme);
  const [firstWeekday, setFirstWeekday] = useState(initial.firstWeekday);
  const [defaultRestSeconds, setDefaultRestSeconds] = useState(initial.defaultRestSeconds);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const updatePreferences = trpc.settings.updatePreferences.useMutation({
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
        updatePreferences.mutate({ unitSystem, theme, firstWeekday, defaultRestSeconds });
      }}
    >
      <Field>
        <FieldLabel>Units</FieldLabel>
        <Select
          value={unitSystem}
          onValueChange={(value) => setUnitSystem(value as typeof unitSystem)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="metric">Metric (kg)</SelectItem>
            <SelectItem value="imperial">Imperial (lb)</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>Theme</FieldLabel>
        <Select value={theme} onValueChange={(value) => setTheme(value as typeof theme)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dark">Dark</SelectItem>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>First weekday</FieldLabel>
        <Select
          value={String(firstWeekday)}
          onValueChange={(value) => setFirstWeekday(Number(value))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Sunday</SelectItem>
            <SelectItem value="1">Monday</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field data-invalid={errorMessage ? true : undefined}>
        <FieldLabel htmlFor="defaultRestSeconds">Default rest (seconds)</FieldLabel>
        <Input
          id="defaultRestSeconds"
          type="number"
          min={15}
          max={600}
          value={defaultRestSeconds}
          onChange={(event) => setDefaultRestSeconds(Number(event.target.value))}
        />
        {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
      </Field>
      <Button type="submit" disabled={updatePreferences.isPending} className="w-fit">
        Save
      </Button>
    </form>
  );
}
