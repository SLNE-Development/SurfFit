"use client";

import { route, routes } from "@/lib/routes";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@surffit/ui/components/ui/button";
import { Checkbox } from "@surffit/ui/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@surffit/ui/components/ui/field";
import { Input } from "@surffit/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@surffit/ui/components/ui/select";
import { Switch } from "@surffit/ui/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@surffit/ui/components/ui/tabs";
import { Textarea } from "@surffit/ui/components/ui/textarea";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

type Equipment = { id: string; slug: string; name: string };
type MuscleGroup = { id: string; slug: string; bodyRegion: string; name: string };
type Movement = { id: string; slug: string; name: string };

function extractI18nKey(error: unknown, fallback: string): string {
  const data = (error as { data?: { i18nKey?: string } } | undefined)?.data;
  return data?.i18nKey ?? fallback;
}

function MovementForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState<"beginner" | "intermediate" | "advanced">(
    "beginner",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const submitMovement = trpc.exercises.submitMovement.useMutation({
    onSuccess: (result) => {
      toast.success("Submitted for review");
      router.push(route(routes.exercises.movement, { slug: result.slug }));
    },
    onError: (error) => {
      const key = extractI18nKey(error, error.message);
      if (key === "exercises.movement.exists") {
        toast.error("A movement with that name already exists");
      }
      setErrorMessage(key);
    },
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setErrorMessage(null);
        submitMovement.mutate({
          name,
          description: description || null,
          difficulty,
        });
      }}
    >
      <Field data-invalid={errorMessage ? true : undefined}>
        <FieldLabel htmlFor="movement-name">Name</FieldLabel>
        <Input
          id="movement-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
        {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
      </Field>
      <Field>
        <FieldLabel htmlFor="movement-description">Description</FieldLabel>
        <Textarea
          id="movement-description"
          value={description}
          onChange={(event) => setDescription(event.target.value.slice(0, 2000))}
          maxLength={2000}
        />
        <p className="text-muted-foreground text-xs">{description.length}/2000</p>
      </Field>
      <Field>
        <FieldLabel>Difficulty</FieldLabel>
        <Select
          value={difficulty}
          onValueChange={(value) => value && setDifficulty(value as typeof difficulty)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="beginner">Beginner</SelectItem>
            <SelectItem value="intermediate">Intermediate</SelectItem>
            <SelectItem value="advanced">Advanced</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Button type="submit" disabled={submitMovement.isPending} className="w-fit">
        Submit movement
      </Button>
    </form>
  );
}

function VariantForm({
  equipment,
  muscleGroups,
  movements,
}: {
  equipment: Equipment[];
  muscleGroups: MuscleGroup[];
  movements: Movement[];
}) {
  const router = useRouter();
  const [movementId, setMovementId] = useState(movements[0]?.id ?? "");
  const [equipmentId, setEquipmentId] = useState(equipment[0]?.id ?? "");
  const [difficulty, setDifficulty] = useState<"beginner" | "intermediate" | "advanced">(
    "beginner",
  );
  const [isUnilateral, setIsUnilateral] = useState(false);
  const [primaryMuscleGroupId, setPrimaryMuscleGroupId] = useState(muscleGroups[0]?.id ?? "");
  const [secondaryIds, setSecondaryIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedMovement = movements.find((m) => m.id === movementId);
  const selectedEquipment = equipment.find((e) => e.id === equipmentId);
  const defaultNamePreview =
    selectedMovement && selectedEquipment
      ? `${selectedMovement.name} (${selectedEquipment.name})`
      : "";

  const submitExercise = trpc.exercises.submitExercise.useMutation({
    onSuccess: () => {
      toast.success("Submitted for review");
      if (selectedMovement) {
        router.push(route(routes.exercises.movement, { slug: selectedMovement.slug }));
      }
    },
    onError: (error) => {
      const key = extractI18nKey(error, error.message);
      if (key === "exercises.variant.exists") {
        toast.error("This equipment variant already exists for this movement");
      }
      setErrorMessage(key);
    },
  });

  function toggleSecondary(id: string) {
    setSecondaryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 5 ? [...prev, id] : prev,
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setErrorMessage(null);
        submitExercise.mutate({
          movementId,
          equipmentId,
          difficulty,
          isUnilateral,
          primaryMuscleGroupId,
          secondaryMuscleGroupIds: secondaryIds,
          name: name || null,
          description: description || null,
          instructions: instructions || null,
        });
      }}
    >
      <Field>
        <FieldLabel>Movement</FieldLabel>
        <Select value={movementId} onValueChange={(value) => value && setMovementId(value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {movements.map((movement) => (
              <SelectItem key={movement.id} value={movement.id}>
                {movement.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>Equipment</FieldLabel>
        <Select value={equipmentId} onValueChange={(value) => value && setEquipmentId(value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {equipment.map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>Difficulty</FieldLabel>
        <Select
          value={difficulty}
          onValueChange={(value) => value && setDifficulty(value as typeof difficulty)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="beginner">Beginner</SelectItem>
            <SelectItem value="intermediate">Intermediate</SelectItem>
            <SelectItem value="advanced">Advanced</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field orientation="horizontal">
        <Switch checked={isUnilateral} onCheckedChange={setIsUnilateral} id="unilateral" />
        <FieldLabel htmlFor="unilateral" className="font-normal">
          Unilateral
        </FieldLabel>
      </Field>
      <Field>
        <FieldLabel>Primary muscle</FieldLabel>
        <Select
          value={primaryMuscleGroupId}
          onValueChange={(value) => value && setPrimaryMuscleGroupId(value)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {muscleGroups.map((mg) => (
              <SelectItem key={mg.id} value={mg.id}>
                {mg.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field>
        <FieldLabel>Secondary muscles (up to 5)</FieldLabel>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {muscleGroups
            .filter((mg) => mg.id !== primaryMuscleGroupId)
            .map((mg) => {
              const checked = secondaryIds.includes(mg.id);
              const atCap = secondaryIds.length >= 5;
              return (
                <label
                  key={mg.id}
                  htmlFor={`secondary-${mg.id}`}
                  className="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    id={`secondary-${mg.id}`}
                    checked={checked}
                    disabled={!checked && atCap}
                    onCheckedChange={() => toggleSecondary(mg.id)}
                  />
                  {mg.name}
                </label>
              );
            })}
        </div>
      </Field>
      <Field data-invalid={errorMessage ? true : undefined}>
        <FieldLabel htmlFor="variant-name">Name (optional)</FieldLabel>
        <Input
          id="variant-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={defaultNamePreview}
        />
        {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
      </Field>
      <Field>
        <FieldLabel htmlFor="variant-description">Description</FieldLabel>
        <Textarea
          id="variant-description"
          value={description}
          onChange={(event) => setDescription(event.target.value.slice(0, 2000))}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="variant-instructions">Instructions</FieldLabel>
        <Textarea
          id="variant-instructions"
          value={instructions}
          onChange={(event) => setInstructions(event.target.value.slice(0, 4000))}
        />
      </Field>
      <Button type="submit" disabled={submitExercise.isPending} className="w-fit">
        Submit variant
      </Button>
    </form>
  );
}

export function SubmitForms({
  equipment,
  muscleGroups,
  movements,
}: {
  equipment: Equipment[];
  muscleGroups: MuscleGroup[];
  movements: Movement[];
}) {
  return (
    <Tabs defaultValue="movement">
      <TabsList>
        <TabsTrigger value="movement">New movement</TabsTrigger>
        <TabsTrigger value="variant">New variant</TabsTrigger>
      </TabsList>
      <TabsContent value="movement">
        <MovementForm />
      </TabsContent>
      <TabsContent value="variant">
        <VariantForm equipment={equipment} muscleGroups={muscleGroups} movements={movements} />
      </TabsContent>
    </Tabs>
  );
}
