"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { useBackendBaseUrl } from "@/lib/platform";
import type { JobResponse, UploadItem } from "@/types";

type Props = {
  job?: JobResponse;
  uploads: UploadItem[];
};

export function BeforeAfterPreview({ job, uploads }: Props) {
  const [showProcessed, setShowProcessed] = useState(true);
  const outputBaseUrl = useBackendBaseUrl();
  const done = job?.files.find((f) => f.output_path && f.state === "done");

  if (!done?.output_path) {
    return (
      <Card className="p-4">
        <p className="text-sm text-slate-300">Preview will appear after first processed result.</p>
      </Card>
    );
  }

  const output = `${outputBaseUrl}/jobs/download?path=${encodeURIComponent(done.output_path)}`;
  const upload = uploads.find((item) => item.path === done.input_path);
  const currentImage = showProcessed ? output : upload?.preview_url;

  return (
    <Card className="space-y-3 p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Before / After</h3>
      <div className="flex gap-2">
        <Button className={showProcessed ? "" : "bg-slate-700 text-slate-100"} onClick={() => setShowProcessed(true)}>Processed</Button>
        <Button className={!showProcessed ? "" : "bg-slate-700 text-slate-100"} onClick={() => setShowProcessed(false)}>Original</Button>
      </div>
      <div className="relative h-64 overflow-hidden rounded-lg border bg-slate-950">
        {currentImage ? (
          <img src={currentImage} alt={showProcessed ? "processed preview" : "original preview"} className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">Original preview not available for this item yet.</div>
        )}
      </div>
    </Card>
  );
}
