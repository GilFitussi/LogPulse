import { useEffect } from "react";
import {
	ChevronDown,
	Clock3,
	Download,
	LayoutPanelTop,
	MoreVertical,
	Package2,
	Plus,
	Search,
	Trash2,
	Waypoints,
	X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isClusterConnected } from "@/lib/viewerNavigation";
import {
	createDefaultClusterViewerState,
	getClusterViewerStateOrDefault,
	useViewerStore,
} from "@/stores/useViewerStore";

function SelectControl({ label, value, icon: Icon }) {
	return (
		<label className="min-w-0 space-y-2">
			<span className="text-xs text-muted-foreground">{label}</span>
			<div className="flex h-10 min-w-0 items-center gap-2 rounded-md border border-border/50 bg-background/35 px-3 text-sm text-foreground">
				{Icon ? <Icon className="size-3.5 text-muted-foreground" /> : null}
				<span className="min-w-0 flex-1 truncate">{value}</span>
				<ChevronDown className="size-4 text-muted-foreground" />
			</div>
		</label>
	);
}

function SeverityBadge({ color, children }) {
	return (
		<span className="inline-flex items-center gap-1.5 text-sm text-foreground">
			<span className={cn("size-2.5 rounded-full", color)} />
			{children}
		</span>
	);
}

function Tab({ active, children }) {
	return (
		<button
			type="button"
			className={cn(
				"flex h-12 min-w-44 items-center justify-between gap-4 border-r border-border/60 px-5 text-sm transition-colors",
				active
					? "border-b-2 border-b-primary bg-background/45 text-foreground"
					: "text-muted-foreground hover:bg-background/35 hover:text-foreground",
			)}
		>
			<span className="inline-flex min-w-0 items-center gap-2">
				<Clock3 className="size-4 shrink-0 text-muted-foreground" />
				<span className="truncate">{children}</span>
			</span>
			<X className="size-4 shrink-0 text-muted-foreground" />
		</button>
	);
}

const sampleRows = [
	[
		"12:58:38.937",
		"ERROR",
		"api-7b6f4c9b7d-x2k9m",
		"api",
		"[log.iconpstration] Long log filename: applications for get error",
	],
	[
		"12:58:38.937",
		"ERROR",
		"api-7b6f4c9b7d-x2k9m",
		"api",
		"[log.iconpstration] Searching Java Jss: vind and visk agd message",
	],
	[
		"12:58:33.937",
		"INFO",
		"web-5f6d8c9b7c-pt9m2",
		"worker",
		"[internalInfo] [abl] Cresting dataBevnsSorilaeak",
	],
	[
		"12:58:33.937",
		"WARN",
		"worker-6c7d8f9f4c-lm2nx",
		"worker",
		"[searchInfo] [abl] Existing matcheSitintenciated",
	],
	[
		"12:58:35.937",
		"INFO",
		"web-5f6d8c9b7c-pt9m2",
		"web",
		"[internalInfo] [abl] Optianalionoptianaziatonnewbiiklin",
	],
	[
		"12:58:36.937",
		"DEBUG",
		"web-5f6d8c9b7c-pt9m2",
		"web",
		"[searchInfo] [abl] Watching new process info networks",
	],
	[
		"12:58:36.937",
		"ERROR",
		"web-5f6d8c9b7c-pt9m2",
		"web",
		"[internalInfo] [abl] Log underscating to laventIvichnwrecmsts no forever request",
	],
	[
		"12:58:36.937",
		"WARN",
		"web-5f6d8c9b7c-pt9m2",
		"web",
		"[internalInfo] [ab] Secutoring abSException",
	],
	[
		"12:58:36.937",
		"DEBUG",
		"web-5f6d8c9b7c-pt9m2",
		"web",
		"[snatching] [taw] optical:Error is real outcot, reautred",
	],
];

function getLevelClass(level) {
	return (
		{
			ERROR: "bg-red-500/15 text-red-500 dark:text-red-300",
			WARN: "bg-amber-500/15 text-amber-500 dark:text-amber-300",
			INFO: "bg-sky-500/15 text-sky-500 dark:text-sky-300",
			DEBUG: "bg-emerald-500/15 text-emerald-500 dark:text-emerald-300",
		}[level] || "bg-muted text-muted-foreground"
	);
}

export function LogViewerScreen({ cluster }) {
	const clusterId = cluster?.id ?? null;
	const ensureClusterState = useViewerStore(
		(state) => state.getOrCreateClusterState,
	);
	const clusterViewerState = useViewerStore((state) => {
		if (!clusterId) {
			return createDefaultClusterViewerState();
		}

		return getClusterViewerStateOrDefault(
			state.viewerStateByCluster,
			clusterId,
		);
	});

	useEffect(() => {
		if (clusterId) {
			ensureClusterState(clusterId);
		}
	}, [clusterId, ensureClusterState]);

	const isConnected = isClusterConnected(cluster);
	const namespace =
		clusterViewerState.selectedNamespace || cluster?.defaultNamespace || "test";

	return (
		<div className="flex min-h-0 flex-1 flex-col bg-card/25 p-3 text-foreground">
			<section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/50 bg-background/35">
				<header className="flex h-11 shrink-0 items-center justify-end gap-4 border-b border-border/35 px-5">
					<div className="flex items-center gap-5 text-sm">
						<span className="font-medium text-foreground">
							{cluster?.name || "Cluster"}
						</span>
						<div className="h-4 border-l border-border" />
						<span
							className={cn(
								"inline-flex items-center gap-2 font-medium",
								isConnected
									? "text-emerald-500 dark:text-emerald-300"
									: "text-muted-foreground",
							)}
						>
							<span
								className={cn(
									"size-2 rounded-full",
									isConnected ? "bg-emerald-500" : "bg-muted-foreground/70",
								)}
							/>
							{isConnected ? "Connected" : "Disconnected"}
						</span>
					</div>
				</header>

				<div className="grid shrink-0 grid-cols-1 gap-4 border-b border-border/35 px-5 py-5 xl:grid-cols-[11rem_13rem_12rem_minmax(14rem,1fr)_auto_auto_auto] xl:items-end">
					<SelectControl icon={Waypoints} label="Namespace" value={namespace} />
					<SelectControl
						icon={Package2}
						label="Deployment"
						value={clusterViewerState.selectedDeployment || "Select deployment"}
					/>
					<SelectControl
						icon={LayoutPanelTop}
						label="Pod"
						value={clusterViewerState.activeTabId || "Select pod"}
					/>

					<div className="relative min-w-0">
						<Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
						<input
							className="h-10 w-full rounded-md border border-border/50 bg-background/35 pl-10 pr-14 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/40"
							placeholder="Search logs..."
						/>
						<span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
							⌘K
						</span>
					</div>

					<div className="flex h-10 items-center gap-2 text-sm">
						<span>Regex</span>
						<span className="flex h-5 w-9 items-center rounded-full bg-muted p-0.5">
							<span className="size-4 rounded-full bg-muted-foreground/70" />
						</span>
					</div>

					<div className="flex h-10 items-center gap-4 rounded-md border border-border/50 bg-background/35 px-3">
						<SeverityBadge color="bg-red-500">Error</SeverityBadge>
						<SeverityBadge color="bg-amber-500">Warn</SeverityBadge>
						<SeverityBadge color="bg-sky-500">Info</SeverityBadge>
						<SeverityBadge color="bg-emerald-500">Debug</SeverityBadge>
					</div>

					<div className="flex h-10 items-center gap-1 rounded-md border border-border/50 bg-background/35 px-2">
						<Button variant="ghost" size="icon" className="size-8">
							<Trash2 className="size-4" />
						</Button>
						<Button variant="ghost" size="icon" className="size-8">
							<Download className="size-4" />
						</Button>
						<Button variant="ghost" size="icon" className="size-8">
							<MoreVertical className="size-4" />
						</Button>
					</div>
				</div>

				<div className="flex h-13 shrink-0 items-stretch border-b border-border/35 bg-background/10">
					<Tab active>Merged</Tab>
					<Tab>api-7b6f4c9b7d-x2k9m</Tab>
					<Tab>worker-6c7d8f9f4c-lm2nx</Tab>
					<Tab>web-5f6d8c9b7c-pt9m2</Tab>
					<button
						type="button"
						className="flex w-14 items-center justify-center border-r border-border/60 text-muted-foreground hover:bg-background/35 hover:text-foreground"
					>
						<Plus className="size-5" />
					</button>
				</div>

				<div className="min-h-0 flex-1 overflow-auto font-mono">
					<div className="grid min-w-[70rem] grid-cols-[9rem_7rem_18rem_8rem_minmax(24rem,1fr)] border-b border-border/50 px-5 py-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">
						<span>Time</span>
						<span>Level</span>
						<span>Pod</span>
						<span>Container</span>
						<span>Message</span>
					</div>
					{sampleRows
						.concat(sampleRows)
						.map(([time, level, pod, container, message], index) => (
							<div
								key={`${time}-${level}-${index}`}
								className="grid min-w-[70rem] grid-cols-[9rem_7rem_18rem_8rem_minmax(24rem,1fr)] px-5 py-2 text-sm text-foreground/85 hover:bg-background/35"
							>
								<span>{time}</span>
								<span>
									<span
										className={cn(
											"rounded px-1.5 py-0.5 text-xs",
											getLevelClass(level),
										)}
									>
										{level}
									</span>
								</span>
								<span>{pod}</span>
								<span>{container}</span>
								<span className="truncate">{message}</span>
							</div>
						))}
				</div>

				<footer className="flex h-16 shrink-0 items-center justify-between border-t border-border/35 bg-background/10 px-6 text-sm text-muted-foreground">
					<span className="inline-flex items-center gap-3 font-medium text-foreground">
						<span className="size-2.5 rounded-full bg-emerald-500" />
						Ready
					</span>
					<div className="flex items-center gap-8">
						<span>
							Auto-scroll: <span className="text-emerald-500">On</span>
						</span>
						<span>Lines: 12,345</span>
						<span>Buffer: 50% / 10,000</span>
					</div>
				</footer>
			</section>
		</div>
	);
}
