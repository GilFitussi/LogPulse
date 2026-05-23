import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";

import { EmptyState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
	closeNamespaceSelector,
	createNamespaceWorkspaceState,
	fetchClusterNamespaces,
	filterNamespacesBySearch,
	selectNamespace,
} from "@/lib/namespaceWorkspace";

function NamespaceSelectorDropdown({
	namespaces,
	selectedNamespaceName,
	searchText,
	isOpen,
	onOpenChange,
	onSearchTextChange,
	onSelectNamespace,
}) {
	const containerRef = useRef(null);
	const inputRef = useRef(null);

	useEffect(() => {
		if (!isOpen) {
			return undefined;
		}

		function handlePointerDown(event) {
			if (!containerRef.current?.contains(event.target)) {
				onOpenChange(false);
			}
		}

		function handleKeyDown(event) {
			if (event.key === "Escape") {
				onOpenChange(false);
			}
		}

		document.addEventListener("mousedown", handlePointerDown);
		document.addEventListener("keydown", handleKeyDown);

		return () => {
			document.removeEventListener("mousedown", handlePointerDown);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [isOpen, onOpenChange]);

	useEffect(() => {
		if (isOpen) {
			inputRef.current?.focus();
		}
	}, [isOpen]);

	const filteredNamespaces = useMemo(
		() => filterNamespacesBySearch(namespaces, searchText),
		[namespaces, searchText],
	);

	return (
		<div ref={containerRef} className="relative">
			<button
				type="button"
				onClick={() => onOpenChange(!isOpen)}
				aria-expanded={isOpen}
				className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
			>
				<div className="min-w-0">
					<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Namespace
					</p>
					<p className="truncate text-sm font-medium text-foreground">
						{selectedNamespaceName || "Select a namespace"}
					</p>
				</div>
				<ChevronDown
					className={cn(
						"size-4 text-muted-foreground transition-transform",
						isOpen && "rotate-180",
					)}
					aria-hidden="true"
				/>
			</button>

			{isOpen ? (
				<div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 rounded-lg border border-border bg-popover p-2 shadow-lg">
					<input
						ref={inputRef}
						type="text"
						value={searchText}
						onChange={(event) => onSearchTextChange(event.target.value)}
						placeholder="Search namespaces"
						className="h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring/50"
					/>
					<div className="mt-2 max-h-64 overflow-auto rounded-md border border-border/70 bg-background/60 p-1">
						{filteredNamespaces.length > 0 ? (
							<div className="space-y-1" role="listbox" aria-label="Namespaces">
								{filteredNamespaces.map((namespace) => {
									const isSelected = namespace.name === selectedNamespaceName;

									return (
										<button
											key={namespace.name}
											type="button"
											onClick={() => onSelectNamespace(namespace.name)}
											role="option"
											aria-selected={isSelected}
											className={cn(
												"flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
												isSelected
													? "bg-primary/12 font-medium text-primary"
													: "text-foreground hover:bg-muted",
											)}
										>
											{namespace.name}
										</button>
									);
								})}
							</div>
						) : (
							<p className="px-2.5 py-3 text-sm text-muted-foreground">
								No namespaces match your search.
							</p>
						)}
					</div>
				</div>
			) : null}
		</div>
	);
}

export function ClusterNamespaceWorkspace({ cluster, apiBaseUrl }) {
	const [namespaceState, setNamespaceState] = useState(() =>
		createNamespaceWorkspaceState(cluster?.id ?? null),
	);

	const loadNamespaces = useCallback(
		async (clusterId) => {
			setNamespaceState((currentState) =>
				createNamespaceWorkspaceState(clusterId, {
					selectedNamespaceName:
						currentState.clusterId === clusterId
							? currentState.selectedNamespaceName
							: "",
					isLoading: true,
				}),
			);

			try {
				const namespaces = await fetchClusterNamespaces(
					fetch,
					clusterId,
					apiBaseUrl,
				);

				setNamespaceState((currentState) => {
					if (currentState.clusterId !== clusterId) {
						return currentState;
					}

					const selectedNamespaceName = namespaces.some(
						(namespace) =>
							namespace.name === currentState.selectedNamespaceName,
					)
						? currentState.selectedNamespaceName
						: "";

					return createNamespaceWorkspaceState(clusterId, {
						namespaces,
						selectedNamespaceName,
					});
				});
			} catch (error) {
				setNamespaceState((currentState) => {
					if (currentState.clusterId !== clusterId) {
						return currentState;
					}

					return createNamespaceWorkspaceState(clusterId, {
						error: error.message || "Unable to load namespaces",
					});
				});
			}
		},
		[apiBaseUrl],
	);

	useEffect(() => {
		const clusterId = cluster?.id ?? null;

		if (!clusterId) {
			setNamespaceState(createNamespaceWorkspaceState(null));
			return;
		}

		void loadNamespaces(clusterId);
	}, [
		cluster?.id,
		cluster?.lastConnectedAt,
		cluster?.lastConnectionStatus,
		loadNamespaces,
	]);

	const handleRetry = useCallback(() => {
		if (cluster?.id) {
			void loadNamespaces(cluster.id);
		}
	}, [cluster?.id, loadNamespaces]);

	const handleOpenChange = useCallback((nextOpen) => {
		setNamespaceState((currentState) =>
			nextOpen
				? {
						...currentState,
						isDropdownOpen: true,
					}
				: closeNamespaceSelector(currentState),
		);
	}, []);

	const handleSearchTextChange = useCallback((nextSearchText) => {
		setNamespaceState((currentState) => ({
			...currentState,
			searchText: nextSearchText,
		}));
	}, []);

	const handleSelectNamespace = useCallback((namespaceName) => {
		setNamespaceState((currentState) =>
			selectNamespace(currentState, namespaceName),
		);
	}, []);

	if (!cluster) {
		return (
			<EmptyState
				title="No cluster workspace selected"
				description="Select a cluster from the sidebar to make it the current workspace."
				className="mt-2"
			/>
		);
	}

	return (
		<section className="mt-2 rounded-lg border border-border/70 bg-background/60 p-3">
			<div className="mb-3 flex flex-wrap items-start justify-between gap-2">
				<div>
					<h3 className="text-sm font-semibold text-foreground">
						Namespace selector
					</h3>
					<p className="mt-1 text-xs text-muted-foreground">
						Choose a namespace for the selected cluster workspace.
					</p>
				</div>
				{namespaceState.selectedNamespaceName ? (
					<span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary ring-1 ring-primary/20">
						Active: {namespaceState.selectedNamespaceName}
					</span>
				) : null}
			</div>

			{namespaceState.isLoading ? (
				<LoadingState label="Loading namespaces..." className="px-1 py-2" />
			) : namespaceState.error ? (
				<div className="rounded-lg border border-dashed border-destructive/40 bg-destructive/5 p-4">
					<p className="text-sm font-medium text-foreground">
						Unable to load namespaces
					</p>
					<p className="mt-1 text-sm text-muted-foreground">
						{namespaceState.error}
					</p>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={handleRetry}
						className="mt-3"
					>
						<RefreshCw className="size-3.5" aria-hidden="true" />
						Retry
					</Button>
				</div>
			) : namespaceState.namespaces.length === 0 ? (
				<EmptyState
					title="No namespaces found."
					description="This cluster did not return any namespaces yet."
				/>
			) : (
				<NamespaceSelectorDropdown
					namespaces={namespaceState.namespaces}
					selectedNamespaceName={namespaceState.selectedNamespaceName}
					searchText={namespaceState.searchText}
					isOpen={namespaceState.isDropdownOpen}
					onOpenChange={handleOpenChange}
					onSearchTextChange={handleSearchTextChange}
					onSelectNamespace={handleSelectNamespace}
				/>
			)}
		</section>
	);
}
