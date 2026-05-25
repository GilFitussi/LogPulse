import { useState } from "react";
import {
	AlertCircle,
	CheckCircle2,
	Circle,
	Edit3,
	KeyRound,
	LoaderCircle,
	LogOut,
	MoreHorizontal,
	Plus,
	RefreshCw,
	Server,
	Trash2,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";

import { EmptyState, LoadingState } from "@/components/states";
import { ToolbarButton } from "@/components/layout/top-toolbar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

	if (["disconnected", "logged-out", "logged out"].includes(normalizedStatus)) {
		return {
			Icon: LogOut,
			label: "Logged out",
			className: "bg-muted text-muted-foreground ring-border",
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

function getClusterFormValues(cluster) {
	return cluster
		? {
				name: cluster.name || "",
				apiUrl: cluster.apiUrl || "",
				defaultNamespace: cluster.defaultNamespace || "",
				description: cluster.description || "",
			}
		: initialClusterFormValues;
}

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

function ClusterFormModal({
	cluster,
	onSubmitCluster,
	onOpenModalChange,
	trigger,
	mode = "create",
}) {
	const [isOpen, setIsOpen] = useState(false);
	const [formValues, setFormValues] = useState(getClusterFormValues(cluster));
	const [error, setError] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const isEditing = mode === "edit";

	const updateField = (fieldName) => (event) => {
		setFormValues((currentValues) => ({
			...currentValues,
			[fieldName]: event.target.value,
		}));
		setError("");
	};

	const resetForm = () => {
		setFormValues(getClusterFormValues(cluster));
		setError("");
		setIsSubmitting(false);
	};

	const handleOpenChange = (nextOpen) => {
		setIsOpen(nextOpen);
		onOpenModalChange?.(nextOpen);

		if (nextOpen) {
			setFormValues(getClusterFormValues(cluster));
			setError("");
			return;
		}

		resetForm();
	};

	const handleSubmit = async (event) => {
		event.preventDefault();

		const payload = {
			name: formValues.name.trim(),
			defaultNamespace: formValues.defaultNamespace.trim() || null,
			description: formValues.description.trim() || null,
		};

		if (!isEditing) {
			payload.apiUrl = formValues.apiUrl.trim();
		}

		if (!payload.name || (!isEditing && !payload.apiUrl)) {
			setError(
				isEditing ? "Name is required." : "Name and API URL are required.",
			);
			return;
		}

		setIsSubmitting(true);
		setError("");

		try {
			await onSubmitCluster(payload);
			setIsOpen(false);
			resetForm();
		} catch (submitError) {
			setError(
				submitError.message ||
					(isEditing
						? "Unable to update cluster."
						: "Unable to create cluster."),
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
			<Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-40 bg-background/55 backdrop-blur-sm" />
				<Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xl outline-none">
					<div className="mb-4">
						<Dialog.Title className="text-base font-semibold text-foreground">
							{isEditing ? "Edit cluster" : "Create cluster"}
						</Dialog.Title>
						<Dialog.Description className="mt-1 text-sm text-muted-foreground">
							{isEditing
								? "Update this OpenShift cluster metadata. The API URL cannot be edited."
								: "Add an OpenShift cluster endpoint to the cluster list."}
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
								required={!isEditing}
								disabled={isEditing}
								type="url"
								placeholder="https://api.example.com:6443"
								className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
							/>
							{isEditing ? (
								<span className="text-xs font-normal text-muted-foreground">
									API URL changes are blocked after creation.
								</span>
							) : null}
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
								{isSubmitting
									? isEditing
										? "Saving..."
										: "Creating..."
									: isEditing
										? "Save changes"
										: "Create cluster"}
							</Button>
						</div>
					</form>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

function ClusterLoginModal({
	cluster,
	onLoginCluster,
	onOpenModalChange,
	trigger,
}) {
	const [isOpen, setIsOpen] = useState(false);
	const [loginMethod, setLoginMethod] = useState("credentials");
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [token, setToken] = useState("");
	const [error, setError] = useState("");
	const [successMessage, setSuccessMessage] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const isTokenLogin = loginMethod === "token";

	const resetForm = () => {
		setLoginMethod("credentials");
		setUsername("");
		setPassword("");
		setToken("");
		setError("");
		setSuccessMessage("");
		setIsSubmitting(false);
	};

	const clearMessages = () => {
		setError("");
		setSuccessMessage("");
	};

	const handleOpenChange = (nextOpen) => {
		setIsOpen(nextOpen);
		onOpenModalChange?.(nextOpen);

		if (!nextOpen) {
			resetForm();
		}
	};

	const handleSubmit = async (event) => {
		event.preventDefault();

		const trimmedUsername = username.trim();
		const trimmedToken = token.trim();

		if (isTokenLogin ? !trimmedToken : !trimmedUsername || !password) {
			setError(
				isTokenLogin
					? "OpenShift token is required."
					: "Username and password are required.",
			);
			setSuccessMessage("");
			return;
		}

		setIsSubmitting(true);
		setError("");
		setSuccessMessage("");

		try {
			const result = await onLoginCluster(
				cluster,
				isTokenLogin
					? { loginMethod: "token", token: trimmedToken }
					: {
							loginMethod: "credentials",
							username: trimmedUsername,
							password,
						},
			);
			const loggedInUser = result.username || trimmedUsername || "token user";

			setPassword("");
			setToken("");
			setSuccessMessage(
				`Logged in to ${cluster.name} as ${loggedInUser}. Connection status refreshed.`,
			);
		} catch (loginError) {
			setError(loginError.message || "Unable to login to cluster.");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
			<Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-40 bg-background/55 backdrop-blur-sm" />
				<Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xl outline-none">
					<div className="mb-4">
						<Dialog.Title className="text-base font-semibold text-foreground">
							Connect to cluster
						</Dialog.Title>
						<Dialog.Description className="mt-1 text-sm text-muted-foreground">
							Authenticate to {cluster.name} with username/password or an
							OpenShift token.
						</Dialog.Description>
					</div>

					<form className="space-y-3" onSubmit={handleSubmit}>
						<div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground ring-1 ring-border/60">
							<p className="font-medium text-foreground">{cluster.name}</p>
							<p className="mt-0.5 truncate">{cluster.apiUrl}</p>
						</div>
						<div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/40 p-1 text-sm ring-1 ring-border/60">
							{[
								["credentials", "Username/password"],
								["token", "Token"],
							].map(([value, label]) => (
								<label
									key={value}
									className={`flex cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2 font-medium transition-colors ${
										loginMethod === value
											? "bg-background text-foreground shadow-sm"
											: "text-muted-foreground hover:text-foreground"
									}`}
								>
									<input
										type="radio"
										name="cluster-login-method"
										value={value}
										checked={loginMethod === value}
										onChange={(event) => {
											setLoginMethod(event.target.value);
											clearMessages();
										}}
										disabled={isSubmitting}
										className="sr-only"
									/>
									{label}
								</label>
							))}
						</div>
						{isTokenLogin ? (
							<label className="block space-y-1.5 text-sm font-medium text-foreground">
								<span>OpenShift token</span>
								<textarea
									value={token}
									onChange={(event) => {
										setToken(event.target.value);
										clearMessages();
									}}
									autoComplete="off"
									disabled={isSubmitting}
									placeholder="sha256~..."
									rows={3}
									className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
								/>
								<span className="text-xs font-normal text-muted-foreground">
									Get this from OpenShift Console → Copy login command → Display
									Token.
								</span>
							</label>
						) : (
							<>
								<label className="block space-y-1.5 text-sm font-medium text-foreground">
									<span>Username</span>
									<input
										value={username}
										onChange={(event) => {
											setUsername(event.target.value);
											clearMessages();
										}}
										autoComplete="username"
										disabled={isSubmitting}
										placeholder="OpenShift username"
										className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
									/>
								</label>
								<label className="block space-y-1.5 text-sm font-medium text-foreground">
									<span>Password</span>
									<input
										value={password}
										onChange={(event) => {
											setPassword(event.target.value);
											clearMessages();
										}}
										autoComplete="current-password"
										disabled={isSubmitting}
										type="password"
										placeholder="OpenShift password"
										className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
									/>
								</label>
							</>
						)}

						{isSubmitting ? (
							<p className="flex items-center gap-2 rounded-md bg-sky-500/10 px-3 py-2 text-sm text-sky-700 ring-1 ring-sky-500/20 dark:text-sky-300">
								<LoaderCircle
									className="size-4 animate-spin"
									aria-hidden="true"
								/>
								Logging in and refreshing cluster status...
							</p>
						) : null}
						{error ? (
							<p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive ring-1 ring-destructive/20">
								{error}
							</p>
						) : null}
						{successMessage ? (
							<p className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300">
								{successMessage}
							</p>
						) : null}

						<div className="flex justify-end gap-2 pt-2">
							<Dialog.Close asChild>
								<Button type="button" variant="outline" disabled={isSubmitting}>
									{successMessage ? "Close" : "Cancel"}
								</Button>
							</Dialog.Close>
							<Button type="submit" disabled={isSubmitting}>
								{isSubmitting ? "Connecting..." : "Connect"}
							</Button>
						</div>
					</form>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

function DeleteClusterDialog({ cluster, onDeleteCluster, onOpenModalChange }) {
	const [isOpen, setIsOpen] = useState(false);
	const [error, setError] = useState("");
	const [isDeleting, setIsDeleting] = useState(false);

	const handleOpenChange = (nextOpen) => {
		setIsOpen(nextOpen);
		onOpenModalChange?.(nextOpen);

		if (!nextOpen) {
			setError("");
			setIsDeleting(false);
		}
	};

	const handleDelete = async () => {
		setIsDeleting(true);
		setError("");

		try {
			await onDeleteCluster(cluster);
			setIsOpen(false);
		} catch (deleteError) {
			setError(deleteError.message || "Unable to delete cluster.");
		} finally {
			setIsDeleting(false);
		}
	};

	return (
		<Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
			<Dialog.Trigger asChild>
				<DropdownMenuItem
					onSelect={(event) => event.preventDefault()}
					className="text-destructive focus:text-destructive"
				>
					<Trash2 className="size-3.5" aria-hidden="true" />
					Delete
				</DropdownMenuItem>
			</Dialog.Trigger>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-40 bg-background/55 backdrop-blur-sm" />
				<Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xl outline-none">
					<Dialog.Title className="text-base font-semibold text-foreground">
						Delete cluster?
					</Dialog.Title>
					<Dialog.Description className="mt-2 text-sm text-muted-foreground">
						This will permanently remove "{cluster.name}" from your cluster
						list. This action cannot be undone.
					</Dialog.Description>

					{error ? (
						<p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive ring-1 ring-destructive/20">
							{error}
						</p>
					) : null}

					<div className="mt-4 flex justify-end gap-2">
						<Dialog.Close asChild>
							<Button type="button" variant="outline" disabled={isDeleting}>
								Cancel
							</Button>
						</Dialog.Close>
						<Button
							type="button"
							variant="destructive"
							onClick={handleDelete}
							disabled={isDeleting}
						>
							{isDeleting ? "Deleting..." : "Delete cluster"}
						</Button>
					</div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

function ClusterListItem({
	cluster,
	isSelected,
	onDeleteCluster,
	onLoginCluster,
	onSelectCluster,
	onUpdateCluster,
}) {
	const [isActionsOpen, setIsActionsOpen] = useState(false);
	const isConnected =
		String(cluster.lastConnectionStatus || "").toLowerCase() === "connected";
	const handleModalOpenChange = (isOpen) => {
		if (!isOpen) {
			setIsActionsOpen(false);
		}
	};

	return (
		<div
			role="listitem"
			className={cn(
				"relative rounded-xl border transition-colors",
				isSelected
					? "border-primary/65 bg-primary/10 shadow-[0_0_0_1px_var(--primary)]"
					: "border-transparent hover:border-border/70 hover:bg-muted/30",
			)}
		>
			<button
				type="button"
				onClick={() => onSelectCluster(cluster.id)}
				aria-current={isSelected ? "true" : undefined}
				className="w-full rounded-xl p-4 pr-12 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
			>
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0">
						<p className="truncate text-base font-semibold text-foreground">
							{cluster.name}
						</p>
						<p className="mt-2 truncate text-sm text-muted-foreground">
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
					<p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
						{cluster.description}
					</p>
				) : null}
			</button>
			<div className="absolute right-2 top-3">
				<DropdownMenu open={isActionsOpen} onOpenChange={setIsActionsOpen}>
					<DropdownMenuTrigger asChild>
						<ToolbarButton
							type="button"
							aria-label={`Cluster actions for ${cluster.name}`}
							title="Cluster actions"
							className="h-8 w-8 rounded-xl bg-muted/40 px-0"
						>
							<MoreHorizontal className="size-3.5" aria-hidden="true" />
						</ToolbarButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent>
						{onLoginCluster && !isConnected ? (
							<ClusterLoginModal
								cluster={cluster}
								onLoginCluster={onLoginCluster}
								onOpenModalChange={handleModalOpenChange}
								trigger={
									<DropdownMenuItem
										onSelect={(event) => event.preventDefault()}
									>
										<KeyRound className="size-3.5" aria-hidden="true" />
										Connect
									</DropdownMenuItem>
								}
							/>
						) : null}
						<ClusterFormModal
							cluster={cluster}
							mode="edit"
							onSubmitCluster={(payload) => onUpdateCluster(cluster, payload)}
							onOpenModalChange={handleModalOpenChange}
							trigger={
								<DropdownMenuItem onSelect={(event) => event.preventDefault()}>
									<Edit3 className="size-3.5" aria-hidden="true" />
									Edit
								</DropdownMenuItem>
							}
						/>
						<DeleteClusterDialog
							cluster={cluster}
							onDeleteCluster={onDeleteCluster}
							onOpenModalChange={handleModalOpenChange}
						/>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}

export function ClustersSidebar({
	clusters,
	error,
	isLoading,
	onCreateCluster,
	onDeleteCluster,
	onLoginCluster,
	onRefresh,
	onSelectCluster,
	onUpdateCluster,
	selectedClusterId,
}) {
	return (
		<aside className="flex min-h-0 w-full flex-col rounded-xl border border-border/70 bg-card/45 text-card-foreground shadow-sm lg:w-[28rem] lg:shrink-0">
			<div className="flex items-center justify-between gap-3 border-b border-border/50 p-5">
				<div className="min-w-0">
					<h2 className="flex items-center gap-3 text-lg font-semibold text-foreground">
						<Server className="size-5 text-primary" aria-hidden="true" />
						Clusters
					</h2>
					<p className="mt-1 truncate text-sm text-muted-foreground">
						{clusters.length} cluster{clusters.length === 1 ? "" : "s"}
					</p>
				</div>
				<div className="flex shrink-0 items-center gap-1">
					<ClusterFormModal
						onSubmitCluster={onCreateCluster}
						trigger={
							<ToolbarButton
								type="button"
								aria-label="Add cluster"
								title="Add cluster"
								className="w-7 px-0"
							>
								<Plus className="size-3.5" aria-hidden="true" />
							</ToolbarButton>
						}
					/>
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

			<div className="min-h-0 flex-1 overflow-auto p-3">
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
					<div className="space-y-3" role="list" aria-label="Clusters">
						{clusters.map((cluster) => (
							<ClusterListItem
								key={cluster.id}
								cluster={cluster}
								isSelected={String(cluster.id) === String(selectedClusterId)}
								onDeleteCluster={onDeleteCluster}
								onLoginCluster={onLoginCluster}
								onSelectCluster={onSelectCluster}
								onUpdateCluster={onUpdateCluster}
							/>
						))}
					</div>
				)}
			</div>
		</aside>
	);
}
