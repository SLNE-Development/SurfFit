"use client";

import { trpc } from "@/lib/trpc/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@surffit/ui/components/ui/alert-dialog";
import { Badge } from "@surffit/ui/components/ui/badge";
import { Button } from "@surffit/ui/components/ui/button";
import { Empty, EmptyDescription, EmptyTitle } from "@surffit/ui/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@surffit/ui/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@surffit/ui/components/ui/tabs";
import { Textarea } from "@surffit/ui/components/ui/textarea";
import { useState } from "react";
import { toast } from "sonner";

type QueueRow = {
  subjectType: "movement" | "exercise" | "gym";
  subjectId: string;
  name: string;
  movementSlug: string | null;
  ownerUsername: string | null;
  submittedAt: Date;
};

type ReportRow = {
  id: string;
  subjectType: "movement" | "exercise" | "gym" | "user";
  subjectId: string;
  subjectLabel: string;
  reason: "spam" | "inappropriate" | "incorrect" | "copyright" | "other";
  details: string | null;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  reporterUsername: string | null;
  createdAt: Date;
};

function contentHref(row: QueueRow): string {
  if (row.subjectType === "gym") return `/gyms/${row.subjectId}`;
  if (row.movementSlug) return `/exercises/${row.movementSlug}`;
  return "#";
}

function SubmissionsTable({ initialQueue }: { initialQueue: QueueRow[] }) {
  const utils = trpc.useUtils();
  const queueQuery = trpc.moderation.queue.useQuery(undefined, { initialData: initialQueue });
  const [rejectReason, setRejectReason] = useState("");

  const review = trpc.moderation.review.useMutation({
    onSuccess: () => {
      toast.success("Reviewed");
      utils.moderation.queue.invalidate();
    },
    onError: (error) => {
      const data = error.data as { code?: string } | null;
      if (data?.code === "CONFLICT") {
        toast.error("Already reviewed");
        utils.moderation.queue.invalidate();
      } else {
        toast.error(error.message);
      }
    },
  });

  if (queueQuery.data?.length === 0) {
    return (
      <Empty>
        <EmptyTitle>Nothing pending</EmptyTitle>
        <EmptyDescription>New submissions will show up here.</EmptyDescription>
      </Empty>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead>Submitted</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {queueQuery.data?.map((row) => (
          <TableRow key={`${row.subjectType}-${row.subjectId}`}>
            <TableCell>
              <Badge variant="outline">{row.subjectType}</Badge>
            </TableCell>
            <TableCell>
              <a href={contentHref(row)} className="underline">
                {row.name}
              </a>
            </TableCell>
            <TableCell>{row.ownerUsername ?? "—"}</TableCell>
            <TableCell>{new Date(row.submittedAt).toLocaleDateString()}</TableCell>
            <TableCell className="flex gap-2">
              <Button
                size="sm"
                disabled={review.isPending}
                onClick={() =>
                  review.mutate({
                    subjectType: row.subjectType,
                    subjectId: row.subjectId,
                    decision: "approve",
                  })
                }
              >
                Approve
              </Button>
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="error" size="sm" />}>
                  Reject
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reject this submission?</AlertDialogTitle>
                  </AlertDialogHeader>
                  <Textarea
                    placeholder="Reason (optional)"
                    value={rejectReason}
                    onChange={(event) => setRejectReason(event.target.value)}
                  />
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        review.mutate({
                          subjectType: row.subjectType,
                          subjectId: row.subjectId,
                          decision: "reject",
                          reason: rejectReason || undefined,
                        });
                        setRejectReason("");
                      }}
                    >
                      Reject
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ReportsTable({ initialReports }: { initialReports: ReportRow[] }) {
  const utils = trpc.useUtils();
  const reportsQuery = trpc.moderation.reports.useQuery(
    { status: "open" },
    { initialData: initialReports },
  );

  const resolveReport = trpc.moderation.resolveReport.useMutation({
    onSuccess: () => {
      toast.success("Report updated");
      utils.moderation.reports.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  if (reportsQuery.data?.length === 0) {
    return (
      <Empty>
        <EmptyTitle>No open reports</EmptyTitle>
        <EmptyDescription>Reports filed by users will show up here.</EmptyDescription>
      </Empty>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Subject</TableHead>
          <TableHead>Reason</TableHead>
          <TableHead>Details</TableHead>
          <TableHead>Reporter</TableHead>
          <TableHead>Created</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {reportsQuery.data?.map((report) => (
          <TableRow key={report.id}>
            <TableCell>
              {report.subjectLabel} <Badge variant="outline">{report.subjectType}</Badge>
            </TableCell>
            <TableCell>
              <Badge>{report.reason}</Badge>
            </TableCell>
            <TableCell title={report.details ?? undefined} className="max-w-40 truncate">
              {report.details ?? "—"}
            </TableCell>
            <TableCell>{report.reporterUsername ?? "—"}</TableCell>
            <TableCell>{new Date(report.createdAt).toLocaleDateString()}</TableCell>
            <TableCell className="flex gap-2">
              <Button
                size="sm"
                disabled={resolveReport.isPending}
                onClick={() =>
                  resolveReport.mutate({ reportId: report.id, resolution: "resolved" })
                }
              >
                Resolve
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={resolveReport.isPending}
                onClick={() =>
                  resolveReport.mutate({ reportId: report.id, resolution: "dismissed" })
                }
              >
                Dismiss
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ModerationPanels({
  initialQueue,
  initialReports,
}: {
  initialQueue: QueueRow[];
  initialReports: ReportRow[];
}) {
  return (
    <Tabs defaultValue="submissions">
      <TabsList>
        <TabsTrigger value="submissions">Submissions</TabsTrigger>
        <TabsTrigger value="reports">Reports</TabsTrigger>
      </TabsList>
      <TabsContent value="submissions">
        <SubmissionsTable initialQueue={initialQueue} />
      </TabsContent>
      <TabsContent value="reports">
        <ReportsTable initialReports={initialReports} />
      </TabsContent>
    </Tabs>
  );
}
