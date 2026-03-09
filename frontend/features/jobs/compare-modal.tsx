"use client";

import { Button } from "@/components/ui";
import { useBackendBaseUrl } from "@/lib/platform";
import type { JobFileResult, UploadItem } from "@/types";

type Props = {
  item: UploadItem;
  result?: JobFileResult;
  onClose: () => void;
};

export function CompareModal({ item, result, onClose }: Props) {
  const outputBaseUrl = useBackendBaseUrl();
  const outputUrl = result?.output_path ? `${outputBaseUrl}/jobs/download?path=${encodeURIComponent(result.output_path)}` : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4" onClick={onClose}>
      <div className="w-full max-w-6xl rounded-2xl border bg-slate-950 p-4" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-slate-100">{item.filename}</h3>
            <p className="text-xs text-slate-400">{result?.engine_used ?? "Not processed yet"}</p>
          </div>
          <Button className="bg-slate-700 text-slate-100" onClick={onClose}>Close</Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-200">Original</p>
            <div className="flex min-h-[420px] items-center justify-center overflow-hidden rounded-xl border bg-black">
              {item.preview_url ? <img src={item.preview_url} alt={item.filename} className="max-h-[72vh] w-full object-contain" /> : null}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-slate-200">Processed</p>
            <div className="flex min-h-[420px] items-center justify-center overflow-hidden rounded-xl border bg-black">
              {outputUrl ? (
                <img src={outputUrl} alt={`${item.filename} processed`} className="max-h-[72vh] w-full object-contain" />
              ) : (
                <p className="text-sm text-slate-500">Process this item to compare.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
