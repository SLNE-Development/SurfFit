"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@surffit/ui/components/ui/avatar";
import { Button } from "@surffit/ui/components/ui/button";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

export function AvatarSection({
  initialAvatarUrl,
  displayName,
}: {
  initialAvatarUrl: string | null;
  displayName: string | null;
}) {
  const router = useRouter();
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [isPending, setIsPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fallback = (displayName ?? "?").charAt(0).toUpperCase();

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.size > AVATAR_MAX_BYTES) {
      toast.error("avatar.tooLarge");
      return;
    }

    setIsPending(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch("/api/avatar", { method: "POST", body: formData });
      const body = (await response.json()) as { avatarUrl?: string; error?: { i18nKey: string } };
      if (!response.ok || !body.avatarUrl) {
        toast.error(body.error?.i18nKey ?? "avatar.uploadFailed");
        return;
      }
      setAvatarUrl(body.avatarUrl);
      toast.success("Saved");
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  async function handleRemove() {
    setIsPending(true);
    try {
      const response = await fetch("/api/avatar", { method: "DELETE" });
      if (!response.ok) {
        toast.error("avatar.removeFailed");
        return;
      }
      setAvatarUrl(null);
      toast.success("Saved");
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-16">
        {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
        <AvatarFallback>{fallback}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          Upload avatar
        </Button>
        {avatarUrl ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={handleRemove}
          >
            Remove avatar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
