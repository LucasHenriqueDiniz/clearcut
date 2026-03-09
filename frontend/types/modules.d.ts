declare module "lucide-react";

declare module "@tauri-apps/api/core" {
  export function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  export function convertFileSrc(path: string, protocol?: string): string;
}

declare module "@tauri-apps/plugin-dialog" {
  type DialogFilter = {
    name: string;
    extensions: string[];
  };

  type OpenDialogOptions = {
    multiple?: boolean;
    directory?: boolean;
    filters?: DialogFilter[];
  };

  export function open(
    options?: OpenDialogOptions,
  ): Promise<string | string[] | null>;

  type SaveDialogOptions = {
    title?: string;
    filters?: DialogFilter[];
    defaultPath?: string;
    canCreateDirectories?: boolean;
  };

  export function save(options?: SaveDialogOptions): Promise<string | null>;
}

declare module "@tauri-apps/plugin-fs" {
  export function readFile(path: string): Promise<Uint8Array>;
  export function writeFile(path: string | URL, data: Uint8Array): Promise<void>;
}
