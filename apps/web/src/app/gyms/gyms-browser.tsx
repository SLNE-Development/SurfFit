"use client";

import { route, routes } from "@/lib/routes";
import { trpc } from "@/lib/trpc/client";
import { Badge } from "@surffit/ui/components/ui/badge";
import { Card, CardContent, CardHeader } from "@surffit/ui/components/ui/card";
import { Empty, EmptyDescription, EmptyTitle } from "@surffit/ui/components/ui/empty";
import { Input } from "@surffit/ui/components/ui/input";
import { keepPreviousData } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

type GymRow = {
  id: string;
  name: string;
  city: string;
  countryCode: string;
  status: "pending" | "approved" | "rejected";
  memberCount: number;
  isOwner: boolean;
};

export function GymsBrowser({ initialGyms }: { initialGyms: GymRow[] }) {
  const [query, setQuery] = useState("");
  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length >= 2;

  const gymsQuery = trpc.gyms.search.useQuery(
    { locale: "en", query: isSearching ? trimmedQuery : undefined, limit: 20 },
    {
      initialData: !isSearching ? initialGyms : undefined,
      placeholderData: keepPreviousData,
    },
  );

  return (
    <div className="flex flex-col gap-4">
      <Input
        placeholder="Search gyms..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="max-w-xs"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {gymsQuery.data?.map((gym) => (
          <Link key={gym.id} href={route(routes.gyms.gym, { gymId: gym.id })}>
            <Card className="h-full transition hover:border-foreground/40">
              <CardHeader>
                <h3 className="font-medium">{gym.name}</h3>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <p className="text-muted-foreground text-sm">
                  {gym.city}, {gym.countryCode}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{gym.memberCount} members</Badge>
                  {gym.isOwner && gym.status !== "approved" ? <Badge>Pending review</Badge> : null}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
        {gymsQuery.data?.length === 0 ? (
          <Empty>
            <EmptyTitle>No gyms found</EmptyTitle>
            <EmptyDescription>Try a different search term.</EmptyDescription>
          </Empty>
        ) : null}
      </div>
    </div>
  );
}
