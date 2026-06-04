import { Activity, Search } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { APP_VIEWS } from "@/lib/viewerNavigation";

export function ToolbarSection({
	children,
	className,
	"aria-label": ariaLabel,
}) {
	return (
		<div
			className={cn("flex min-w-0 items-center gap-2", className)}
			aria-label={ariaLabel}
		>
			{children}
		</div>
	);
}

export function ToolbarField({ children, className, icon: Icon, label }) {
	return (
		<label className={cn("flex min-w-0 items-center gap-1.5", className)}>
			<span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
				{Icon && <Icon className="size-3.5" aria-hidden="true" />}
				{label}
			</span>
			{children}
		</label>
	);
}

export function ToolbarSearchContainer({ children, className }) {
	return (
		<div className={cn("relative min-w-48 flex-1", className)}>
			<Search
				className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
				aria-hidden="true"
			/>
			{children}
		</div>
	);
}

export function ToolbarActions({ children, className }) {
	return (
		<div
			className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}
		>
			{children}
		</div>
	);
}

function ProductNavTab({ isActive, disabled, onClick, children }) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			aria-pressed={isActive}
			className={cn(
				"rounded-none border-b-2 px-2.5 py-2 text-[0.8rem] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
				isActive
					? "border-primary text-foreground"
					: "border-transparent text-muted-foreground hover:text-foreground",
				disabled &&
					"cursor-not-allowed text-muted-foreground/50 hover:text-muted-foreground/50",
			)}
		>
			{children}
		</button>
	);
}

export function TopToolbar({
	currentView = APP_VIEWS.WORKSPACES,
	onChangeView,
	canAccessViewer = false,
}) {
	return (
		<header className="sticky top-0 z-30 border-b border-toolbar-border bg-toolbar text-foreground backdrop-blur">
			<div className="mx-auto flex h-10 w-full max-w-none items-center justify-between gap-2 px-3 lg:px-4">
				<div className="flex min-w-0 items-center gap-2.5">
					<div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/20">
						<Activity className="size-4" aria-hidden="true" />
					</div>
					<h1 className="truncate text-sm font-semibold tracking-tight text-foreground">
						OS-LogPulse
					</h1>
					<nav
						className="ml-2 flex h-10 items-center gap-2 border-l border-toolbar-border/40 pl-3"
						aria-label="Product navigation"
					>
						<ProductNavTab
							isActive={currentView === APP_VIEWS.WORKSPACES}
							onClick={() => onChangeView?.(APP_VIEWS.WORKSPACES)}
						>
							Workspaces
						</ProductNavTab>
						<ProductNavTab
							isActive={currentView === APP_VIEWS.VIEWER}
							disabled={!canAccessViewer}
							onClick={() => onChangeView?.(APP_VIEWS.VIEWER)}
						>
							Log Viewer
						</ProductNavTab>
					</nav>
				</div>

				<div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
					<ThemeToggle />
				</div>
			</div>
		</header>
	);
}

export function SecondaryFilterToolbar({
	searchControl,
	severityFilterControls,
	utilityActions,
}) {
	return (
		<div className="sticky top-12 z-20 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
			<div className="mx-auto flex w-full max-w-[96rem] flex-col gap-1.5 px-3 py-1.5 sm:px-4 lg:px-6">
				<div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
					<ToolbarSection aria-label="Log search" className="min-w-72 flex-1">
						{searchControl}
					</ToolbarSection>

					<ToolbarSection aria-label="Severity filters">
						{severityFilterControls}
					</ToolbarSection>

					<ToolbarActions className="ml-auto justify-end">
						{utilityActions}
					</ToolbarActions>
				</div>
			</div>
		</div>
	);
}

export function ToolbarButton({ children, className, ...props }) {
	return (
		<Button
			variant="outline"
			size="sm"
			className={cn(
				"h-6 rounded-md border-border/70 px-2 text-xs shadow-none",
				className,
			)}
			{...props}
		>
			{children}
		</Button>
	);
}
