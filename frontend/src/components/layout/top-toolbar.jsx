import {
	Activity,
	Check,
	ChevronDown,
	Plus,
	Search,
	X,
} from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { APP_VIEWS } from "@/lib/viewerNavigation";
import {
	createDefaultClusterViewerState,
	getClusterViewerStateOrDefault,
	useViewerStore,
} from "@/stores/useViewerStore";

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

function formatSessionUpdatedAt(updatedAt) {
	if (!updatedAt) {
		return "Not updated";
	}

	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(new Date(updatedAt));
}

function getSessionSummary(session) {
	if (session.activeSearch?.totalCount !== undefined) {
		return `${session.activeSearch.totalCount.toLocaleString()} logs`;
	}

	if (session.logs?.length) {
		return `${session.logs.length.toLocaleString()} logs`;
	}

	return "No snapshot";
}

function LogSessionSwitcher({ cluster, disabled = false }) {
	const clusterId = cluster?.id ?? null;
	const clusterViewerState = useViewerStore((state) => {
		if (!clusterId) {
			return createDefaultClusterViewerState();
		}

		return getClusterViewerStateOrDefault(
			state.viewerStateByCluster,
			clusterId,
		);
	});
	const createLogSession = useViewerStore((state) => state.createLogSession);
	const setActiveLogSession = useViewerStore(
		(state) => state.setActiveLogSession,
	);
	const closeLogSession = useViewerStore((state) => state.closeLogSession);

	const sessions = clusterViewerState.logSessionOrder
		.map((sessionId) => clusterViewerState.logSessionsById[sessionId])
		.filter(Boolean);
	const activeSession =
		clusterViewerState.logSessionsById[clusterViewerState.activeLogSessionId] ||
		sessions[0];

	const handleCreateSession = () => {
		if (!clusterId) {
			return;
		}

		createLogSession(clusterId, {
			title: "New log session",
			selectedNamespace: activeSession?.selectedNamespace ?? null,
		});
	};

	if (!clusterId) {
		return null;
	}

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild disabled={disabled}>
				<button
					type="button"
					className={cn(
						"flex h-10 min-w-0 max-w-72 items-center gap-1.5 rounded-none border-b-2 px-2.5 py-2 text-[0.8rem] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
						"border-primary text-foreground",
						disabled &&
							"cursor-not-allowed text-muted-foreground/50 hover:text-muted-foreground/50",
					)}
				>
					<span className="shrink-0">Log Viewer:</span>
					<span className="min-w-0 truncate">
						{activeSession?.title || "New log session"}
					</span>
					<span className="rounded-full border border-border/70 px-1.5 text-[10px] text-muted-foreground dark:border-white/10">
						{sessions.length}
					</span>
					<ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="w-[25rem] border-border/70 bg-popover p-2 text-foreground dark:border-white/10 dark:bg-[#0d1927]"
			>
				<div className="flex items-center justify-between gap-3 px-2 pb-2">
					<div className="min-w-0">
						<div className="text-xs font-semibold text-foreground">
							Log sessions
						</div>
						<div className="truncate text-[11px] text-muted-foreground">
							{cluster?.name || "Current workspace"}
						</div>
					</div>
					<Button
						type="button"
						variant="ghost"
						className="h-7 shrink-0 px-2 text-xs text-primary hover:bg-transparent hover:text-primary/80"
						onClick={handleCreateSession}
					>
						<Plus className="size-3.5" />
						New session
					</Button>
				</div>
				<div className="max-h-80 overflow-y-auto">
					{sessions.map((session) => {
						const isActive = session.id === activeSession?.id;
						const scope =
							[session.selectedNamespace, session.selectedDeployment]
								.filter(Boolean)
								.join(" / ") || "No scope selected";

						return (
							<DropdownMenuItem
								key={session.id}
								onSelect={() => setActiveLogSession(clusterId, session.id)}
								className="cursor-pointer rounded-md px-2 py-2 focus:bg-muted dark:focus:bg-white/8"
							>
								<div className="flex w-full min-w-0 items-start gap-2">
									<span
										className={cn(
											"mt-1.5 size-2 rounded-full",
											isActive ? "bg-primary" : "bg-muted-foreground/50",
										)}
									/>
									<div className="min-w-0 flex-1">
										<div className="flex min-w-0 items-center gap-2">
											<span className="truncate text-sm font-medium">
												{session.title}
											</span>
											{isActive ? (
												<Check className="size-3.5 shrink-0 text-primary" />
											) : null}
										</div>
										<div className="truncate text-[11px] text-muted-foreground">
											{scope}
										</div>
										<div className="mt-0.5 flex min-w-0 items-center gap-3 text-[11px] text-muted-foreground">
											<span>{formatSessionUpdatedAt(session.lastRefreshedAt)}</span>
											<span>{getSessionSummary(session)}</span>
										</div>
									</div>
									{sessions.length > 1 ? (
										<button
											type="button"
											className="mt-0.5 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
											aria-label={`Close ${session.title}`}
											onClick={(event) => {
												event.preventDefault();
												event.stopPropagation();
												closeLogSession(clusterId, session.id);
											}}
										>
											<X className="size-3.5" />
										</button>
									) : null}
								</div>
							</DropdownMenuItem>
						);
					})}
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export function TopToolbar({
	currentView = APP_VIEWS.WORKSPACES,
	onChangeView,
	canAccessViewer = false,
	selectedCluster = null,
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
						{currentView === APP_VIEWS.VIEWER ? (
							<LogSessionSwitcher
								cluster={selectedCluster}
								disabled={!canAccessViewer}
							/>
						) : (
							<ProductNavTab
								isActive={false}
								disabled={!canAccessViewer}
								onClick={() => onChangeView?.(APP_VIEWS.VIEWER)}
							>
								Log Viewer
							</ProductNavTab>
						)}
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
