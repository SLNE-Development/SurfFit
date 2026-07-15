"use client";

import { trpc } from "@/lib/trpc/client";
import { Button } from "@surffit/ui/components/ui/button";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

export function GymActions({
  gymId,
  isMember,
  status,
  isSignedIn,
}: {
  gymId: string;
  isMember: boolean;
  status: "pending" | "approved" | "rejected";
  isSignedIn: boolean;
}) {
  const router = useRouter();

  const join = trpc.gyms.join.useMutation({
    onSuccess: () => {
      toast.success("Joined gym");
      router.refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const leave = trpc.gyms.leave.useMutation({
    onSuccess: () => {
      toast.success("Left gym");
      router.refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  if (!isSignedIn || status !== "approved") return null;

  return isMember ? (
    <Button
      variant="outline"
      className="w-fit"
      disabled={leave.isPending}
      onClick={() => leave.mutate({ gymId })}
    >
      Leave gym
    </Button>
  ) : (
    <Button className="w-fit" disabled={join.isPending} onClick={() => join.mutate({ gymId })}>
      Join gym
    </Button>
  );
}
