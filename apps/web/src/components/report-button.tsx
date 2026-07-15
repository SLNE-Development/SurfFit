"use client";

import { trpc } from "@/lib/trpc/client";
import { Button } from "@surffit/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@surffit/ui/components/ui/dialog";
import { Field, FieldLabel } from "@surffit/ui/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@surffit/ui/components/ui/select";
import { Textarea } from "@surffit/ui/components/ui/textarea";
import { useState } from "react";
import { toast } from "sonner";

const REASONS: { value: string; label: string }[] = [
  { value: "spam", label: "Spam" },
  { value: "inappropriate", label: "Inappropriate" },
  { value: "incorrect", label: "Incorrect" },
  { value: "copyright", label: "Copyright" },
  { value: "other", label: "Other" },
];

export function ReportButton({
  subjectType,
  subjectId,
  visible,
}: {
  subjectType: "movement" | "exercise" | "gym" | "user";
  subjectId: string;
  visible: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("spam");
  const [details, setDetails] = useState("");

  const report = trpc.moderation.report.useMutation({
    onSuccess: () => {
      toast.success("Report submitted");
      setOpen(false);
      setDetails("");
    },
    onError: (error) => {
      const data = error.data as { code?: string } | null;
      if (data?.code === "CONFLICT") {
        toast.error("You already reported this");
      } else {
        toast.error(error.message);
      }
    },
  });

  if (!visible) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>Report</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report content</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            report.mutate({
              subjectType,
              subjectId,
              reason: reason as never,
              details: details || undefined,
            });
          }}
        >
          <Field>
            <FieldLabel>Reason</FieldLabel>
            <Select value={reason} onValueChange={(value) => value && setReason(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="report-details">Details (optional)</FieldLabel>
            <Textarea
              id="report-details"
              value={details}
              onChange={(event) => setDetails(event.target.value.slice(0, 1000))}
            />
            <p className="text-muted-foreground text-xs">{details.length}/1000</p>
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={report.isPending}>
              Submit report
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
