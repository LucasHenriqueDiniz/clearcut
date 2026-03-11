"use client";

import * as React from "react";
import { PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const SIDEBAR_WIDTH = "17rem";
const SIDEBAR_WIDTH_MOBILE = "20rem";
const SIDEBAR_WIDTH_ICON = "4.25rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

type SidebarContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
  state: "expanded" | "collapsed";
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const ctx = React.useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}

export function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  style,
  className,
  children,
}: React.HTMLAttributes<HTMLDivElement> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const [openMobile,   setOpenMobile]   = React.useState(false);
  const [isMobile,     setIsMobile]     = React.useState(false);
  const open = openProp ?? internalOpen;

  React.useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const sync  = () => setIsMobile(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const setOpen = React.useCallback(
    (next: boolean) => (onOpenChange ? onOpenChange(next) : setInternalOpen(next)),
    [onOpenChange],
  );

  const toggleSidebar = React.useCallback(() => {
    isMobile ? setOpenMobile((v) => !v) : setOpen(!open);
  }, [isMobile, open, setOpen]);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === SIDEBAR_KEYBOARD_SHORTCUT) {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleSidebar]);

  return (
    <SidebarContext.Provider
      value={{ open, setOpen, openMobile, setOpenMobile, isMobile, toggleSidebar, state: open ? "expanded" : "collapsed" }}
    >
      <div
        data-sidebar-wrapper
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-mobile": SIDEBAR_WIDTH_MOBILE,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            ...style,
          } as React.CSSProperties
        }
        className={cn("flex h-full min-h-screen w-full min-w-0", className)}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  );
}

export function Sidebar({ side = "left", className, children, ...props }: React.HTMLAttributes<HTMLDivElement> & { side?: "left" | "right" }) {
  const { open, openMobile, setOpenMobile, isMobile } = useSidebar();

  return (
    <>
      {!isMobile && (
        <div
          aria-hidden="true"
          className={cn(
            "hidden shrink-0 transition-[width] duration-200 lg:block",
            open ? "w-[--sidebar-width]" : "w-[--sidebar-width-icon]",
          )}
        />
      )}
      {isMobile && openMobile && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[3px]" onClick={() => setOpenMobile(false)} />
      )}
      <aside
        data-side={side}
        data-state={open ? "expanded" : "collapsed"}
        className={cn(
          "group/sidebar fixed inset-y-0 left-0 z-50 flex h-screen flex-col",
          "w-[--sidebar-width-mobile] lg:data-[state=expanded]:w-[--sidebar-width] lg:data-[state=collapsed]:w-[--sidebar-width-icon]",
          "border-r border-white/[0.06] bg-zinc-950 text-zinc-100",
          "transition-[width,transform] duration-200 lg:z-30",
          isMobile
            ? (openMobile ? "translate-x-0" : "-translate-x-full")
            : "translate-x-0",
          side === "right" && "left-auto right-0 border-0",
          className,
        )}
        {...props}
      >
        {children}
      </aside>
    </>
  );
}

export function SidebarInset({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "min-h-screen min-w-0 flex-1",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarTrigger({ className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg",
        "border border-white/[0.08] bg-zinc-900 text-zinc-400",
        "transition hover:bg-zinc-800 hover:text-zinc-100",
        className,
      )}
      {...props}
    >
      <PanelLeft className="h-4 w-4" />
      <span className="sr-only">Toggle Sidebar</span>
    </button>
  );
}

export function SidebarHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b border-white/[0.06] px-4 py-5 group-data-[state=collapsed]/sidebar:px-3", className)} {...props} />;
}

export function SidebarFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-t border-white/[0.06] px-4 py-4 group-data-[state=collapsed]/sidebar:px-2", className)} {...props} />;
}

export function SidebarContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex-1 overflow-y-auto px-3 py-4 space-y-6 group-data-[state=collapsed]/sidebar:px-2", className)} {...props} />;
}

export function SidebarGroup({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <section className={cn("space-y-1", className)} {...props} />;
}

export function SidebarGroupLabel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500 group-data-[state=collapsed]/sidebar:hidden", className)} {...props} />
  );
}

export function SidebarGroupContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-0.5", className)} {...props} />;
}

export function SidebarMenu({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn("space-y-0.5", className)} {...props} />;
}

export function SidebarMenuItem({ className, ...props }: React.HTMLAttributes<HTMLLIElement>) {
  return <li className={cn("relative", className)} {...props} />;
}

export function SidebarMenuButton({
  className,
  isActive,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { isActive?: boolean }) {
  return (
    <button
      data-active={isActive}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
        "group-data-[state=collapsed]/sidebar:justify-center group-data-[state=collapsed]/sidebar:px-2",
        isActive
          ? "bg-white/10 text-white font-medium"
          : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function SidebarMenuBadge({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5",
        "bg-zinc-800 text-[10px] text-zinc-400 border border-white/[0.06]",
        "group-data-[state=collapsed]/sidebar:hidden",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarRail({ className, ...props }: React.HTMLAttributes<HTMLButtonElement>) {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      type="button"
      aria-label="Toggle sidebar"
      onClick={toggleSidebar}
      className={cn("absolute inset-y-0 -right-2 hidden w-4 lg:block", className)}
      {...props}
    />
  );
}
