"use client";

import { useEffect, useRef, useState } from "react";
import { ImageUp, ClipboardPaste, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

type Props = {
  onFiles: (files: File[]) => void;
};

export function UploadDropzone({ onFiles }: Props) {
  const inputRef  = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [isOver,  setIsOver]  = useState(false);

  const fromFileList = (list: FileList | null) => {
    if (!list?.length) return;
    onFiles(Array.from(list));
  };

  const onPaste = async () => {
    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith("image/")) {
            const blob = await item.getType(type);
            files.push(new File([blob], `clipboard-${Date.now()}.png`, { type: blob.type }));
          }
        }
      }
      if (files.length) onFiles(files);
    } catch {
      // Clipboard access denied — silently ignore
    }
  };

  useEffect(() => {
    const onChooseFiles = () => inputRef.current?.click();
    const onChooseFolder = () => folderRef.current?.click();
    window.addEventListener("ipu:choose-files", onChooseFiles);
    window.addEventListener("ipu:choose-folder", onChooseFolder);
    return () => {
      window.removeEventListener("ipu:choose-files", onChooseFiles);
      window.removeEventListener("ipu:choose-folder", onChooseFolder);
    };
  }, []);

  return (
    <div
      className={cn(
        "relative rounded-2xl border-2 border-dashed transition-colors duration-150",
        isOver
          ? "border-white/30 bg-white/[0.04]"
          : "border-white/[0.08] bg-zinc-900/40 hover:border-white/[0.14] hover:bg-zinc-900/60",
      )}
      onDragOver={(e) => { e.preventDefault(); setIsOver(true); }}
      onDragLeave={() => setIsOver(false)}
      onDrop={(e) => { e.preventDefault(); setIsOver(false); fromFileList(e.dataTransfer.files); }}
    >
      <div className="flex flex-col items-center gap-4 px-6 py-10 text-center">
        <div className={cn(
          "flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-zinc-900 transition-colors",
          isOver && "border-white/20 bg-zinc-800",
        )}>
          <ImageUp className="h-6 w-6 text-zinc-400" />
        </div>

        <div>
          <p className="text-sm font-medium text-zinc-200">
            Drop images here, or choose files below
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            PNG · JPG · WEBP · BMP · GIF · TIFF · HEIC · AVIF
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="default" size="sm" onClick={() => inputRef.current?.click()}>
            <ImageUp className="h-3.5 w-3.5" />
            Choose files
          </Button>
          <Button variant="secondary" size="sm" onClick={() => folderRef.current?.click()}>
            <FolderOpen className="h-3.5 w-3.5" />
            Choose folder
          </Button>
          <Button variant="secondary" size="sm" onClick={onPaste}>
            <ClipboardPaste className="h-3.5 w-3.5" />
            Paste image
          </Button>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept="image/png,image/jpeg,image/jpg,image/webp,image/bmp,image/gif,image/tiff,image/heic,image/heif,image/avif"
        onChange={(e) => fromFileList(e.target.files)}
      />
      <input
        ref={folderRef}
        type="file"
        className="hidden"
        // @ts-expect-error webkitdirectory is valid in chromium
        webkitdirectory="true"
        onChange={(e) => fromFileList(e.target.files)}
      />
    </div>
  );
}
