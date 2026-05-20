import { useState } from "react";
import {
	AlertCircle,
	CheckCircle2,
	Circle,
	LoaderCircle,
	Plus,
	RefreshCw,
	Server,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";

import { EmptyState, LoadingState } from "@/components/states";
import { ToolbarButton } from "@/components/layout/top-toolbar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function getConnectionStatusConfig(status) {
	const normalizedStatus = String(status || "").toLowerCase();

	if (
		["connected", "success", "online", "ok", "healthy"].includes(
			normalizedStatus,
		)
	) {
		return {
			Icon: CheckCircle2,
			label: "Connected",
			className:
				"bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300",
		};
	}

	if (["error", "failed", "offline", "unhealthy"].includes(normalizedStatus)) {
		return {
			Icon: AlertCircle,
			label: "Connection issue",
			className: "bg-red-500/10 text-red-700 ring-red-500/20 dark:text-red-300",
		};
	}

	if (["checking", "connecting", "pending"].includes(normalizedStatus)) {
		return {
			Icon: LoaderCircle,
			label: "Checking",
			className: "bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-300",
			iconClassName: "animate-spin",
		};
	}

	return {
		Icon: Circle,
		label: "Not checked",
		className: "bg-muted text-muted-foreground ring-border",
	};
}

function formatConnectionTime(value) {
	if (!value) {
		return "Never connected";
	}

	const date = new Date(value);

	if (Number.isNaN(date.getTime())) {
		return value;
	}

	return `Last connected ${date.toLocaleString()}`;
}

const initialClusterFormValues = {
	name: "",
	apiUrl: "",
	defaultNamespace: "",
	description: "",
};

function ClusterStatusBadge({ cluster }) {
	const statusConfig = getConnectionStatusConfig(cluster.lastConnectionStatus);
	const StatusIcon = statusConfig.Icon;
	const statusDetail =
		cluster.lastConnectionError ||
		formatConnectionTime(cluster.lastConnectedAt);

	return (
		<span
			className={cn(
				"inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1",
				statusConfig.className,
			)}
			title={statusDetail}
		>
			<StatusIcon
				className={cn("size-3", statusConfig.iconClassName)}
				aria-hidden="true"
			/>
			<span className="truncate">{statusConfig.label}</span>
		</span>
	);
}

function ClusterFormModal({ onCreateCluster }) {
	const [isOpen, setIsOpen] = useState(false);
	const [formValues, setFormValues] = useState(initialClusterFormValues);
	const [error, setError] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const updateField = (fieldName) => (event) => {
		setFormValues((currentValues) => ({
			...currentValues,
			[fieldName]: event.target.value,
		}));
		setError("");
	};

	const resetForm = () => {
		setFormValues(initialClusterFormValues);
		setError("");
		setIsSubmitting(false);
	};

	const handleOpenChange = (nextOpen) => {
		setIsOpen(nextOpen);

		if (!nextOpen) {
			resetForm();
		}
	};

	const handleSubmit = async (event) => {
		event.preventDefault();

		const payload = {
			name: formValues.name.trim(),
			apiUrl: formValues.apiUrl.trim(),
			defaultNamespace: formValues.defaultNamespace.trim() || null,
			description: formValues.description.trim() || null,
		};

		if (!payload.name || !payload.apiUrl) {
			setError("Name and API URL are required.");
			return;
		}

		setIsSubmitting(true);
		setError("");

		try {
			await onCreateCluster(payload);
			setIsOpen(false);
			resetForm();
		} catch (submitError) {
			setError(submitError.message || "Unable to create cluster.");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
			<Dialog.Trigger asChild>
				<ToolbarButton
					type="button"
					aria-label="Add cluster"
					title="Add cluster"
					className="w-7 px-0"
				>
					<Plus className="size-3.5" aria-hidden="true" />
				</ToolbarButton>
			</Dialog.Trigger>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-40 bg-background/55 backdrop-blur-sm" />
				<Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xl outline-none">
					<div className="mb-4">
						<Dialog.Title className="text-base font-semibold text-foreground">
							Create cluster
						</Dialog.Title>
						<Dialog.Description className="mt-1 text-sm text-muted-foreground">
							Add an OpenShift cluster endpoint to the cluster list.
						</Dialog.Description>
					</div>

					<form className="space-y-3" onSubmit={handleSubmit}>
						<label className="block space-y-1.5 text-sm font-medium text-foreground">
							<span>Name</span>
							<input
								value={formValues.name}
								onChange={updateField("name")}
								required
								placeholder="Production"
								className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring"
							/>
						</label>
						<label className="block space-y-1.5 text-sm font-medium text-foreground">
							<span>API URL</span>
							<input
								value={formValues.apiUrl}
								onChange={updateField("apiUrl")}
								required
								type="url"
								placeholder="https://api.example.com:6443"
								className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring"
							/>
						</label>
						<label className="block space-y-1.5 text-sm font-medium text-foreground">
							<span>Default namespace</span>
							<input
								value={formValues.defaultNamespace}
								onChange={updateField("defaultNamespace")}
								placeholder="Optional"
								className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring"
							/>
						</label>
						<label className="block space-y-1.5 text-sm font-medium text-foreground">
							<span>Description</span>
							<textarea
								value={formValues.description}
								onChange={updateField("description")}
								placeholder="Optional notes about this cluster"
								rows={3}
								className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring"
							/>
						</label>

						{error ? (
							<p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive ring-1 ring-destructive/20">
								{error}
							</p>
						) : null}

						<div className="flex justify-end gap-2 pt-2">
							<Dialog.Close asChild>
								<Button type="button" variant="outline" disabled={isSubmitting}>
									Cancel
								</Button>
							</Dialog.Close>
							<Button type="submit" disabled={isSubmitting}>
								{isSubmitting ? "Creating..." : "Create cluster"}
							</Button>
						</div>
					</form>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

export function ClustersSidebar({
	clusters,
	error,
	isLoading,
	onCreateCluster,
	onRefresh,
	onSelectCluster,
	selectedClusterId,
}) {
	const selectedCluster = clusters.find(
		(cluster) => String(cluster.id) === String(selectedClusterId),
	);

	return (
		<aside className="flex min-h-0 w-full flex-col rounded-lg border border-border/80 bg-card/80 text-card-foreground shadow-sm lg:w-80 lg:shrink-0">
			<div className="flex items-center justify-between gap-2 border-b border-border/60 p-3">
				<div className="min-w-0">
					<h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
						<Server className="size-4 text-primary" aria-hidden="true" />
						Clusters
					</h2>
					<p className="mt-0.5 truncate text-xs text-muted-foreground">
						{selectedCluster
							? `Selected: ${selectedCluster.name}`
							: "Choose a cluster"}
					</p>
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<ClusterFormModal onCreateCluster={onCreateCluster} />
					<ToolbarButton
						type="button"
						onClick={onRefresh}
						disabled={isLoading}
						aria-label="Refresh clusters"
						title="Refresh clusters"
						className="w-7 px-0"
					>
						<RefreshCw
							className={cn("size-3.5", isLoading && "animate-spin")}
							aria-hidden="true"
						/>
					</ToolbarButton>
				</div>
			</div>

			<div className="min-h-0 flex-1 overflow-auto p-2">
				{isLoading ? (
					<LoadingState label="Loading clusters..." className="p-3" />
				) : error ? (
					<EmptyState
						title="Unable to load clusters"
						description={error}
						className="m-1"
					/>
				) : clusters.length === 0 ? (
					<EmptyState
						title="No clusters yet"
						description="Create a cluster in the backend to see it here."
						className="m-1"
					/>
				) : (
					<div className="space-y-1" role="list" aria-label="Clusters">
						{clusters.map((cluster) => {
							const isSelected =
								String(cluster.id) === String(selectedClusterId);

							return (
								<button
									key={cluster.id}
									type="button"
									onClick={() => onSelectCluster(cluster.id)}
									aria-current={isSelected ? "true" : undefined}
									className={cn(
										"w-full rounded-md border p-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
										isSelected
											? "border-primary/45 bg-primary/10 shadow-sm"
											: "border-transparent hover:border-border hover:bg-muted/50",
									)}
								>
									<div className="flex items-start justify-between gap-2">
										<div className="min-w-0">
											<p className="truncate text-sm font-medium text-foreground">
												{cluster.name}
											</p>
											<p className="mt-0.5 truncate text-xs text-muted-foreground">
												{cluster.apiUrl}
											</p>
										</div>
										{isSelected ? (
											<span className="mt-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
												Selected
											</span>
										) : null}
									</div>
									<div className="mt-2 flex flex-wrap items-center gap-1.5">
										<ClusterStatusBadge cluster={cluster} />
										{cluster.defaultNamespace ? (
											<span className="truncate rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground ring-1 ring-border">
												{cluster.defaultNamespace}
											</span>
										) : null}
									</div>
									{cluster.description ? (
										<p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
											{cluster.description}
										</p>
									) : null}
								</button>
							);
						})}
					</div>
				)}
			</div>
		</aside>
	);
}
