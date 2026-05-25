import { useCallback, useMemo, useState } from "react";
import { ArrowRight, Copy, LogOut, RefreshCw, Server } from "lucide-react";

import { ClustersSidebar } from "@/components/clusters-sidebar";
import { EmptyState } from "@/components/states";
import { ContentLayout, Panel } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
	getOpenViewerActionState,
	isClusterConnected,
} from "@/lib/viewerNavigation";

function getWorkspaceStatusConfig(cluster) {
	const normalizedStatus = String(
		cluster?.lastConnectionStatus || "",
	).toLowerCase();

	if (isClusterConnected(cluster)) {
		return {
			label: "Connected",
			className: "text-emerald-500 dark:text-emerald-300",
			dotClassName: "bg-emerald-500",
		};
	}

	if (["error", "failed", "offline", "unhealthy"].includes(normalizedStatus)) {
		return {
			label: "Connection issue",
			className: "text-red-500 dark:text-red-300",
			dotClassName: "bg-red-500",
		};
	}

	if (["checking", "connecting", "pending"].includes(normalizedStatus)) {
		return {
			label: "Checking",
			className: "text-sky-500 dark:text-sky-300",
			dotClassName: "bg-sky-500",
		};
	}

	return {
		label: normalizedStatus ? "Logged out" : "Not checked",
		className: "text-muted-foreground",
		dotClassName: "bg-muted-foreground/70",
	};
}

function formatLastConnected(value) {
	if (!value) {
		return null;
	}

	const date = new Date(value);

	if (Number.isNaN(date.getTime())) {
		return String(value);
	}

	return date.toLocaleString();
}

function getClusterMetadata(cluster) {
	return [
		cluster.defaultNamespace
			? {
					label: "Default namespace",
					value: cluster.defaultNamespace,
				}
			: null,
		cluster.lastConnectedAt
			? {
					label: "Last connected",
					value: formatLastConnected(cluster.lastConnectedAt),
				}
			: null,
		cluster.description
			? {
					label: "Notes",
					value: cluster.description,
				}
			: null,
	].filter(Boolean);
}

function SelectedClusterPanel({
	cluster,
	onLogoutCluster,
	onOpenViewer,
	onRefresh,
}) {
	const [copied, setCopied] = useState(false);
	const [actionError, setActionError] = useState("");
	const [isActionRunning, setIsActionRunning] = useState(false);

	const handleCopyEndpoint = useCallback(async () => {
		if (!cluster?.apiUrl || !navigator?.clipboard?.writeText) {
			return;
		}

		try {
			await navigator.clipboard.writeText(cluster.apiUrl);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1200);
		} catch {
			setCopied(false);
		}
	}, [cluster]);

	const metadata = useMemo(
		() => (cluster ? getClusterMetadata(cluster) : []),
		[cluster],
	);

	const handleDisconnect = useCallback(async () => {
		if (!cluster || !onLogoutCluster) {
			return;
		}

		setIsActionRunning(true);
		setActionError("");

		try {
			await onLogoutCluster(cluster);
		} catch (error) {
			setActionError(error.message || "Unable to disconnect cluster.");
		} finally {
			setIsActionRunning(false);
		}
	}, [cluster, onLogoutCluster]);

	if (!cluster) {
		return (
			<EmptyState
				title="No cluster selected"
				description="Choose a cluster from the sidebar to view its workspace details."
				className="border-border/50 bg-background/40"
			/>
		);
	}

	const statusConfig = getWorkspaceStatusConfig(cluster);
	const viewerActionState = getOpenViewerActionState(cluster);
	const isConnected = isClusterConnected(cluster);

	return (
		<div className="rounded-xl border border-border/50 bg-background/35 p-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
						Selected cluster
					</p>
					<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
						<h2 className="truncate text-lg font-semibold tracking-tight text-foreground">
							{cluster.name}
						</h2>
						<span
							className={cn(
								"inline-flex items-center gap-1.5 text-sm font-medium",
								statusConfig.className,
							)}
						>
							<span
								className={cn(
									"size-1.5 rounded-full",
									statusConfig.dotClassName,
								)}
								aria-hidden="true"
							/>
							{statusConfig.label}
						</span>
					</div>
				</div>

				{isConnected ? (
					<Button
						type="button"
						onClick={onOpenViewer}
						disabled={viewerActionState.disabled}
						title={viewerActionState.reason}
						size="sm"
						className="h-7 px-2.5 text-xs"
					>
						Open Viewer
						<ArrowRight className="size-3.5" aria-hidden="true" />
					</Button>
				) : null}
			</div>

			<div className="mt-4">
				<p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
					Endpoint
				</p>
				<div className="mt-1.5 flex min-w-0 items-center gap-2 text-sm text-foreground">
					<span className="break-all">{cluster.apiUrl}</span>
					<button
						type="button"
						onClick={handleCopyEndpoint}
						className="inline-flex shrink-0 items-center text-muted-foreground transition-colors hover:text-foreground"
						title={copied ? "Copied" : "Copy endpoint"}
					>
						<Copy className="size-3.5" aria-hidden="true" />
					</button>
				</div>
			</div>

			{metadata.length > 0 ? (
				<div className="mt-4 grid gap-x-4 gap-y-2 border-t border-border/35 pt-4 sm:grid-cols-2 xl:grid-cols-3">
					{metadata.map((item) => (
						<div key={item.label} className="min-w-0">
							<p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
								{item.label}
							</p>
							<p className="mt-1 truncate text-sm text-foreground">
								{item.value}
							</p>
						</div>
					))}
				</div>
			) : null}

			{isConnected ? (
				<div className="mt-4 flex flex-wrap gap-2 border-t border-border/35 pt-4">
					<Button
						type="button"
						variant="outline"
						size="icon-sm"
						onClick={onRefresh}
						aria-label="Refresh status"
						title="Refresh status"
					>
						<RefreshCw className="size-3.5" aria-hidden="true" />
					</Button>
					{onLogoutCluster ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleDisconnect}
							disabled={isActionRunning}
						>
							<LogOut className="size-3.5" aria-hidden="true" />
							Disconnect
						</Button>
					) : null}
				</div>
			) : null}

			{actionError ? (
				<p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive ring-1 ring-destructive/20">
					{actionError}
				</p>
			) : null}
		</div>
	);
}

export function WorkspacesScreen({
	clusters,
	error,
	isClustersLoading,
	onCreateCluster,
	onDeleteCluster,
	onLoginCluster,
	onLogoutCluster,
	onOpenViewer,
	onRefresh,
	onSelectCluster,
	onUpdateCluster,
	selectedCluster,
	selectedClusterId,
}) {
	return (
		<ContentLayout className="min-h-0 flex-1 lg:flex-row">
			<ClustersSidebar
				clusters={clusters}
				error={error}
				isLoading={isClustersLoading}
				onCreateCluster={onCreateCluster}
				onDeleteCluster={onDeleteCluster}
				onLoginCluster={onLoginCluster}
				onLogoutCluster={onLogoutCluster}
				onRefresh={onRefresh}
				onSelectCluster={onSelectCluster}
				onUpdateCluster={onUpdateCluster}
				selectedClusterId={selectedClusterId}
			/>
			<Panel className="min-h-0 flex-1 border-border/40 bg-card/25 p-3">
				<div className="mb-3 flex items-center gap-2 border-b border-border/35 pb-3">
					<div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
						<Server className="size-4" aria-hidden="true" />
					</div>
					<div>
						<h1 className="text-base font-semibold tracking-tight text-foreground">
							Workspace
						</h1>
						<p className="text-xs text-muted-foreground">
							Cluster management only.
						</p>
					</div>
				</div>
				<SelectedClusterPanel
					cluster={selectedCluster}
					onDeleteCluster={onDeleteCluster}
					onLogoutCluster={onLogoutCluster}
					onOpenViewer={onOpenViewer}
					onRefresh={onRefresh}
				/>
			</Panel>
		</ContentLayout>
	);
}
