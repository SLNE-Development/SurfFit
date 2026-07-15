"use client";

import { route, routes } from "@/lib/routes";
import { trpc } from "@/lib/trpc/client";
import { Badge } from "@surffit/ui/components/ui/badge";
import { Button } from "@surffit/ui/components/ui/button";
import { Card, CardContent, CardHeader } from "@surffit/ui/components/ui/card";
import { Empty, EmptyDescription, EmptyTitle } from "@surffit/ui/components/ui/empty";
import { Input } from "@surffit/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@surffit/ui/components/ui/select";
import { keepPreviousData } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

type Filters = {
  equipment: { id: string; slug: string; name: string }[];
  muscleGroups: { id: string; slug: string; bodyRegion: string; name: string }[];
};

type MovementRow = {
  id: string;
  slug: string;
  name: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  status: "draft" | "pending" | "approved" | "rejected";
  isOwner: boolean;
  equipmentSlugs: string[];
};

const ALL = "all";

export function CatalogBrowser({
  filters,
  initialMovements,
}: {
  filters: Filters;
  initialMovements: MovementRow[];
}) {
  const [query, setQuery] = useState("");
  const [muscleGroupId, setMuscleGroupId] = useState<string>(ALL);
  const [equipmentId, setEquipmentId] = useState<string>(ALL);
  const [difficulty, setDifficulty] = useState<string>(ALL);

  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length >= 2;

  const isDefaultFilters =
    muscleGroupId === ALL && equipmentId === ALL && difficulty === ALL && !isSearching;

  const movementsQuery = trpc.exercises.movements.useQuery(
    {
      locale: "en",
      muscleGroupId: muscleGroupId === ALL ? undefined : muscleGroupId,
      equipmentId: equipmentId === ALL ? undefined : equipmentId,
      difficulty: difficulty === ALL ? undefined : (difficulty as never),
    },
    {
      enabled: !isSearching,
      initialData: isDefaultFilters ? initialMovements : undefined,
      placeholderData: keepPreviousData,
    },
  );

  const searchQuery = trpc.exercises.search.useQuery(
    {
      locale: "en",
      query: trimmedQuery,
      muscleGroupId: muscleGroupId === ALL ? undefined : muscleGroupId,
      equipmentId: equipmentId === ALL ? undefined : equipmentId,
      difficulty: difficulty === ALL ? undefined : (difficulty as never),
    },
    { enabled: isSearching, placeholderData: keepPreviousData },
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search exercises..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="max-w-xs"
        />
        <Select value={muscleGroupId} onValueChange={(value) => setMuscleGroupId(value ?? ALL)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Muscle group" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All muscle groups</SelectItem>
            {filters.muscleGroups.map((mg) => (
              <SelectItem key={mg.id} value={mg.id}>
                {mg.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={equipmentId} onValueChange={(value) => setEquipmentId(value ?? ALL)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Equipment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All equipment</SelectItem>
            {filters.equipment.map((eq) => (
              <SelectItem key={eq.id} value={eq.id}>
                {eq.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={difficulty} onValueChange={(value) => setDifficulty(value ?? ALL)}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Difficulty" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All difficulties</SelectItem>
            <SelectItem value="beginner">Beginner</SelectItem>
            <SelectItem value="intermediate">Intermediate</SelectItem>
            <SelectItem value="advanced">Advanced</SelectItem>
          </SelectContent>
        </Select>
        <Button
          nativeButton={false}
          render={<Link href={route(routes.exercises.submit, {})} />}
          className="ml-auto"
        >
          Submit an exercise
        </Button>
      </div>

      {isSearching ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {searchQuery.data?.map((exercise) => (
            <Link
              key={exercise.id}
              href={route(routes.exercises.movement, { slug: exercise.movementSlug })}
            >
              <Card className="h-full transition hover:border-foreground/40">
                <CardHeader>
                  <h3 className="font-medium">{exercise.name}</h3>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Badge variant="outline">{exercise.equipmentName}</Badge>
                  {exercise.status !== "approved" ? <Badge>Pending review</Badge> : null}
                </CardContent>
              </Card>
            </Link>
          ))}
          {searchQuery.data?.length === 0 ? (
            <Empty>
              <EmptyTitle>No exercises found</EmptyTitle>
              <EmptyDescription>Try a different search term.</EmptyDescription>
            </Empty>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
          {movementsQuery.data?.map((movement) => (
            <Link
              key={movement.id}
              href={route(routes.exercises.movement, { slug: movement.slug })}
            >
              <Card className="h-full transition hover:border-foreground/40">
                <CardHeader>
                  <h3 className="font-medium">{movement.name}</h3>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Badge variant="outline">{movement.difficulty}</Badge>
                  {movement.equipmentSlugs.map((slug) => (
                    <Badge key={slug} variant="secondary">
                      {slug}
                    </Badge>
                  ))}
                  {movement.status !== "approved" ? <Badge>Pending review</Badge> : null}
                </CardContent>
              </Card>
            </Link>
          ))}
          {movementsQuery.data?.length === 0 ? (
            <Empty>
              <EmptyTitle>No movements found</EmptyTitle>
              <EmptyDescription>Try clearing your filters.</EmptyDescription>
            </Empty>
          ) : null}
        </div>
      )}
    </div>
  );
}
