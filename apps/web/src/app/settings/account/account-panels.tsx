"use client";

import { trpc } from "@/lib/trpc/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@surffit/ui/components/ui/alert-dialog";
import { Button } from "@surffit/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@surffit/ui/components/ui/card";
import { Spinner } from "@surffit/ui/components/ui/spinner";
import { toast } from "sonner";

function ConsentsCard() {
  const consents = trpc.gdpr.consents.useQuery();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Consents</CardTitle>
        <CardDescription>Policies you've accepted.</CardDescription>
      </CardHeader>
      <CardContent>
        {consents.data && consents.data.length > 0 ? (
          <ul className="flex flex-col gap-2 text-sm">
            {consents.data.map((c) => (
              <li key={`${c.consentType}-${c.policyVersion}`} className="flex justify-between">
                <span className="capitalize">{c.consentType}</span>
                <span className="text-muted-foreground">
                  {c.policyVersion} &middot; {new Date(c.grantedAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">No consents recorded yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

function DataExportCard() {
  const utils = trpc.useUtils();
  const status = trpc.gdpr.exportStatus.useQuery(undefined, {
    refetchInterval: (query) => {
      const state = query.state.data?.status;
      return state === "pending" || state === "processing" ? 3000 : false;
    },
  });

  const requestExport = trpc.gdpr.requestExport.useMutation({
    onSuccess: () => {
      utils.gdpr.exportStatus.invalidate();
    },
    onError: (error) => {
      const data = error.data as { i18nKey?: string } | null;
      toast.error(data?.i18nKey ?? error.message);
    },
  });

  const isActive = status.data?.status === "pending" || status.data?.status === "processing";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data export</CardTitle>
        <CardDescription>Download a copy of your data.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {status.data?.status === "ready" && status.data.downloadUrl ? (
          <div className="flex items-center gap-3">
            {/* biome-ignore lint/a11y/useAnchorContent: content comes from Button's children via the render prop */}
            <Button nativeButton={false} render={<a href={status.data.downloadUrl} />}>
              Download
            </Button>
            {status.data.expiresAt ? (
              <span className="text-muted-foreground text-sm">
                expires {new Date(status.data.expiresAt).toLocaleDateString()}
              </span>
            ) : null}
          </div>
        ) : isActive ? (
          <div className="flex items-center gap-2 text-sm">
            <Spinner className="size-4" /> Preparing your export…
          </div>
        ) : status.data?.status === "expired" || status.data?.status === "failed" ? (
          <p className="text-muted-foreground text-sm">
            Your previous export {status.data.status}. Request a new one below.
          </p>
        ) : null}
        <Button
          className="w-fit"
          disabled={isActive || requestExport.isPending}
          onClick={() => requestExport.mutate()}
        >
          Request export
        </Button>
      </CardContent>
    </Card>
  );
}

function DangerZoneCard() {
  const utils = trpc.useUtils();
  const deletionStatus = trpc.gdpr.deletionStatus.useQuery();

  const requestDeletion = trpc.gdpr.requestDeletion.useMutation({
    onSuccess: () => {
      utils.gdpr.deletionStatus.invalidate();
      toast.success("Deletion scheduled");
    },
    onError: (error) => {
      const data = error.data as { i18nKey?: string } | null;
      toast.error(data?.i18nKey ?? error.message);
    },
  });

  const cancelDeletion = trpc.gdpr.cancelDeletion.useMutation({
    onSuccess: () => {
      utils.gdpr.deletionStatus.invalidate();
      toast.success("Deletion cancelled");
    },
    onError: (error) => {
      const data = error.data as { i18nKey?: string } | null;
      toast.error(data?.i18nKey ?? error.message);
    },
  });

  return (
    <Card className="border-error/50">
      <CardHeader>
        <CardTitle>Danger zone</CardTitle>
        <CardDescription>Delete your account and all associated data.</CardDescription>
      </CardHeader>
      <CardContent>
        {deletionStatus.data ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              Your account is scheduled for deletion on{" "}
              {new Date(deletionStatus.data.scheduledFor).toLocaleDateString()}.
            </p>
            <Button
              variant="outline"
              className="w-fit"
              disabled={cancelDeletion.isPending}
              onClick={() => cancelDeletion.mutate()}
            >
              Cancel deletion
            </Button>
          </div>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="error" className="w-fit" />}>
              Delete account
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  Scheduled in 30 days. Your profile is anonymized and your data is permanently
                  removed. You can cancel until then.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => requestDeletion.mutate()}>
                  Delete account
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </CardContent>
    </Card>
  );
}

export function AccountPanels() {
  return (
    <div className="flex flex-col gap-6">
      <ConsentsCard />
      <DataExportCard />
      <DangerZoneCard />
    </div>
  );
}
