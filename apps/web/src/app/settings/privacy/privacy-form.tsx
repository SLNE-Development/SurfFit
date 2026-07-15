"use client";

import { trpc } from "@/lib/trpc/client";
import { Button } from "@surffit/ui/components/ui/button";
import { Field, FieldLabel } from "@surffit/ui/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@surffit/ui/components/ui/select";
import { Switch } from "@surffit/ui/components/ui/switch";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

type Privacy = {
  profileVisibility: "public" | "following" | "private";
  showStatistics: boolean;
  showAchievements: boolean;
  showWorkouts: boolean;
  showBodyMetrics: boolean;
};

const VISIBILITY_DESCRIPTIONS: Record<Privacy["profileVisibility"], string> = {
  public: "Anyone can view your profile",
  following: "Only people you follow can view your profile",
  private: "Only you can view your profile",
};

const SWITCH_ROWS: Array<{ key: keyof Omit<Privacy, "profileVisibility">; label: string }> = [
  { key: "showStatistics", label: "Show statistics" },
  { key: "showAchievements", label: "Show achievements" },
  { key: "showWorkouts", label: "Show workouts" },
  { key: "showBodyMetrics", label: "Show body metrics" },
];

export function PrivacyForm({ initial }: { initial: Privacy }) {
  const router = useRouter();
  const [privacy, setPrivacy] = useState(initial);

  const updatePrivacy = trpc.settings.updatePrivacy.useMutation({
    onSuccess: () => {
      toast.success("Saved");
      router.refresh();
    },
    onError: (error) => {
      const data = error.data as { i18nKey?: string } | null;
      toast.error(data?.i18nKey ?? error.message);
    },
  });

  return (
    <form
      className="flex max-w-md flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        updatePrivacy.mutate(privacy);
      }}
    >
      <Field>
        <FieldLabel>Profile visibility</FieldLabel>
        <Select
          value={privacy.profileVisibility}
          onValueChange={(value) =>
            setPrivacy((p) => ({ ...p, profileVisibility: value as Privacy["profileVisibility"] }))
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public">Public</SelectItem>
            <SelectItem value="following">Following</SelectItem>
            <SelectItem value="private">Private</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-muted-foreground text-xs">
          {VISIBILITY_DESCRIPTIONS[privacy.profileVisibility]}
        </p>
      </Field>
      {SWITCH_ROWS.map((row) => (
        <Field key={row.key} orientation="horizontal">
          <FieldLabel htmlFor={row.key} className="font-normal">
            {row.label}
          </FieldLabel>
          <Switch
            id={row.key}
            checked={privacy[row.key]}
            onCheckedChange={(checked) => setPrivacy((p) => ({ ...p, [row.key]: checked }))}
          />
        </Field>
      ))}
      <Button type="submit" disabled={updatePrivacy.isPending} className="w-fit">
        Save
      </Button>
    </form>
  );
}
