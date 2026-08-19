"use client";

import type React from "react";
import { Boxes, ChevronLeft, Clock3, Download, FolderInput, Grid2x2, Scissors, Settings2, SlidersHorizontal, Sparkles, WandSparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type MainTab = "workspace" | "providers" | "models" | "settings" | "history";
type WorkspaceTab = "input" | "preprocess" | "cutout" | "postprocess" | "export";

type Props = {
  activeTab: MainTab;
  workspaceTab: WorkspaceTab;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onActiveTabChange: (tab: MainTab) => void;
  onWorkspaceTabChange: (tab: WorkspaceTab) => void;
};

type NavItemProps = {
  active: boolean;
  collapsed: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
};

function NavItem({ active, collapsed, icon: Icon, label, onClick }: NavItemProps) {
  return (
    <div className={cn("group relative", !collapsed && "w-full")}>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-2.5 overflow-hidden rounded-[9px] px-2.5 py-2 text-left text-[12px] text-zinc-400 transition-colors",
          "hover:bg-white/[0.04] hover:text-zinc-100",
          active && "bg-indigo-500/12 text-indigo-300",
          collapsed && "justify-center px-2",
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className={cn("truncate transition-all", collapsed && "max-w-0 opacity-0")}>{label}</span>
      </button>
      {collapsed ? (
        <div className="pointer-events-none absolute left-[calc(100%+9px)] top-1/2 z-40 w-max max-w-[180px] -translate-y-1/2 rounded-[8px] border border-white/[0.08] bg-[#17171d] px-2 py-1 text-[10px] text-zinc-300 opacity-0 shadow-[0_10px_28px_rgba(0,0,0,0.45)] transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
          <p className="font-medium text-zinc-100">{label}</p>
        </div>
      ) : null}
    </div>
  );
}

function GroupLabel({ collapsed, children }: { collapsed: boolean; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        "px-2.5 pb-1 font-mono text-[9px] uppercase tracking-[0.22em] text-zinc-600 transition-all",
        collapsed && "h-0 overflow-hidden p-0 opacity-0",
      )}
    >
      {children}
    </p>
  );
}

export function AppSidebar({
  activeTab,
  workspaceTab,
  collapsed,
  onToggleCollapsed,
  onActiveTabChange,
  onWorkspaceTabChange,
}: Props) {
  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      className={cn(
        "flex h-full shrink-0 flex-col overflow-hidden border-r border-white/[0.07] bg-[#111114] transition-[width] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]",
        collapsed ? "w-[52px]" : "w-[212px]",
      )}
    >
      <div className={cn("border-b border-white/[0.07] px-3.5 py-4", collapsed && "px-2.5 py-3")}>
        {collapsed ? (
          <div className="flex h-8 items-center justify-center rounded-[9px] border border-white/[0.07] bg-[#16161a]">
            <Grid2x2 className="h-4 w-4 text-zinc-300" />
          </div>
        ) : (
          <>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-zinc-100">CLEARCUT</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">Image processing</p>
          </>
        )}
      </div>

      <div className={cn("flex-1 space-y-4 overflow-y-auto px-2 py-3", collapsed && "px-1.5")}>
        <div className="space-y-1">
          <GroupLabel collapsed={collapsed}>Workspace</GroupLabel>
          <NavItem
            active={activeTab === "workspace" && workspaceTab === "input"}
            collapsed={collapsed}
            icon={FolderInput}
            label="Input"
            onClick={() => {
              onActiveTabChange("workspace");
              onWorkspaceTabChange("input");
            }}
          />
          <NavItem
            active={activeTab === "workspace" && workspaceTab === "preprocess"}
            collapsed={collapsed}
            icon={Sparkles}
            label="Preprocess"
            onClick={() => {
              onActiveTabChange("workspace");
              onWorkspaceTabChange("preprocess");
            }}
          />
          <NavItem
            active={activeTab === "workspace" && workspaceTab === "cutout"}
            collapsed={collapsed}
            icon={Scissors}
            label="Cutout"
            onClick={() => {
              onActiveTabChange("workspace");
              onWorkspaceTabChange("cutout");
            }}
          />
          <NavItem
            active={activeTab === "workspace" && workspaceTab === "postprocess"}
            collapsed={collapsed}
            icon={WandSparkles}
            label="Postprocess"
            onClick={() => {
              onActiveTabChange("workspace");
              onWorkspaceTabChange("postprocess");
            }}
          />
          <NavItem
            active={activeTab === "workspace" && workspaceTab === "export"}
            collapsed={collapsed}
            icon={Download}
            label="Export"
            onClick={() => {
              onActiveTabChange("workspace");
              onWorkspaceTabChange("export");
            }}
          />
        </div>

        <div className="space-y-1">
          <GroupLabel collapsed={collapsed}>System</GroupLabel>
          <NavItem
            active={activeTab === "providers"}
            collapsed={collapsed}
            icon={SlidersHorizontal}
            label="Providers"
            onClick={() => onActiveTabChange("providers")}
          />
          <NavItem
            active={activeTab === "models"}
            collapsed={collapsed}
            icon={Boxes}
            label="Models"
            onClick={() => onActiveTabChange("models")}
          />
          <NavItem
            active={activeTab === "settings"}
            collapsed={collapsed}
            icon={Settings2}
            label="Settings"
            onClick={() => onActiveTabChange("settings")}
          />
          <NavItem
            active={activeTab === "history"}
            collapsed={collapsed}
            icon={Clock3}
            label="History"
            onClick={() => onActiveTabChange("history")}
          />
        </div>
      </div>

      <div className={cn("border-t border-white/[0.07] px-2 py-3", collapsed && "px-1.5")}>
        <div className={cn("group relative", !collapsed && "w-full")}>
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[12px] text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-100",
              collapsed && "justify-center px-2",
            )}
          >
            <ChevronLeft className={cn("h-3.5 w-3.5 shrink-0 transition-transform", collapsed && "rotate-180")} />
            <span className={cn("truncate transition-all", collapsed && "max-w-0 opacity-0")}>Collapse</span>
          </button>
          {collapsed ? (
            <div className="pointer-events-none absolute left-[calc(100%+9px)] top-1/2 z-40 w-max max-w-[180px] -translate-y-1/2 rounded-[8px] border border-white/[0.08] bg-[#17171d] px-2 py-1 text-[10px] text-zinc-300 opacity-0 shadow-[0_10px_28px_rgba(0,0,0,0.45)] transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
              <p className="font-medium text-zinc-100">Expand</p>
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
