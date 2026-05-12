import {
	Activity,
	AlertCircle,
	Boxes,
	CheckCircle2,
	Database,
	LoaderCircle,
	Search,
	ShieldAlert,
	Terminal,
} from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

function getAuthBadgeConfig(authStatus, authStatusMessage) {
	switch (authStatus) {
		case "connected":
			return {
				Icon: CheckCircle2,
				label: authStatusMessage || "OC logged in",
				className:
					"bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300",
			};
		case "not-logged-in":
			return {
				Icon: ShieldAlert,
				label: authStatusMessage || "OC login required",
				className:
					"bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300",
			};
		case "oc-not-installed":
			return {
				Icon: Terminal,
				label: authStatusMessage || "oc CLI missing",
				className:
					"bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-300",
			};
		case "error":
			return {
				Icon: AlertCircle,
				label: authStatusMessage || "OC status unavailable",
				className:
					"bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-300",
			};
		default:
			return {
				Icon: LoaderCircle,
				label: authStatusMessage || "Checking oc login...",
				className: "bg-muted text-muted-foreground ring-border",
				iconClassName: "animate-spin",
			};
	}
}

export function TopToolbar({
	authStatus,
	authStatusMessage,
	connectionLabel,
	isConnected,
	newLogsAvailable,
}) {
	const authBadge = getAuthBadgeConfig(authStatus, authStatusMessage);
	const AuthIcon = authBadge.Icon;

	return (
		<header className="sticky top-0 z-30 border-b border-toolbar-border/80 bg-toolbar/95 backdrop-blur supports-[backdrop-filter]:bg-toolbar/80">
			<div className="mx-auto flex h-12 w-full max-w-[96rem] items-center justify-between gap-2 px-3 sm:px-4 lg:px-6">
				<div className="flex min-w-0 items-center gap-2">
					<div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/15">
						<Activity className="size-4.5" aria-hidden="true" />
					</div>
					<h1 className="truncate text-sm font-semibold tracking-tight text-foreground">
						OS-LogPulse
					</h1>
				</div>

				<div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
					<span
						className={cn(
							"inline-flex items-center gap-1.5 rounded-full px-2 py-1 ring-1",
							authBadge.className,
						)}
						title={authBadge.label}
					>
						<AuthIcon
							className={cn("size-3.5", authBadge.iconClassName)}
							aria-hidden="true"
						/>
						<span className="whitespace-nowrap">{authBadge.label}</span>
					</span>
					<span
						className={cn(
							"inline-flex items-center gap-1.5 rounded-full px-2 py-1 ring-1",
							isConnected
								? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300"
								: "bg-muted text-muted-foreground ring-border",
						)}
					>
						<span
							className={cn(
								"size-1.5 rounded-full",
								isConnected ? "bg-emerald-500" : "bg-muted-foreground/60",
							)}
							aria-hidden="true"
						/>
						<span className="max-w-56 truncate">{connectionLabel}</span>
					</span>
					{newLogsAvailable && (
						<span className="rounded-full bg-sky-500/10 px-2 py-1 text-sky-700 ring-1 ring-sky-500/20 dark:text-sky-300">
							New logs
						</span>
					)}
					<ThemeToggle />
				</div>
			</div>
		</header>
	);
}

export function SecondaryFilterToolbar({
	namespaceSearchControl,
	podSearchControl,
	searchControl,
	severityFilterControls,
	utilityActions,
}) {
	return (
		<div className="sticky top-12 z-20 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
			<div className="mx-auto flex w-full max-w-[96rem] flex-col gap-1.5 px-3 py-1.5 sm:px-4 lg:px-6">
				<div className="flex flex-wrap items-center gap-2 border-b border-border/40 pb-1.5">
					<ToolbarField
						icon={Database}
						label="Namespace"
						className="min-w-64 flex-1 md:max-w-md"
					>
						{namespaceSearchControl}
					</ToolbarField>
					<ToolbarField
						icon={Boxes}
						label="Pod"
						className="min-w-64 flex-1 md:max-w-md"
					>
						{podSearchControl}
					</ToolbarField>
				</div>

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
