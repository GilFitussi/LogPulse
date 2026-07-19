import {
	memo,
	useCallback,
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	CalendarDays,
	Check,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Copy,
	FileJson2,
	HelpCircle,
	Loader2,
	Search,
	X,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";

import { Button } from "@/components/ui/button";
import { DatasetFieldService } from "@/lib/datasetFieldService";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fetchClusterDeployments } from "@/lib/deployments";
import { evaluateKqlQuery } from "@/lib/kqlEvaluator";
import { fetchClusterNamespaces } from "@/lib/namespaceWorkspace";
import {
	MAX_LOG_DATASET_SIZE,
	createPodLogSearch,
	fetchPodLogSearchResults,
	trimLogDataset,
} from "@/lib/logs";
import { fetchDeploymentPods } from "@/lib/pods";
import { cn } from "@/lib/utils";
import { isClusterConnected } from "@/lib/viewerNavigation";
import {
	createDefaultClusterViewerState,
	getClusterViewerStateOrDefault,
	useViewerStore,
} from "@/stores/useViewerStore";

const MOCK_TIME_RANGES = [
	"Last 5 minutes",
	"Last 15 minutes",
	"Last 1 hour",
	"Last 6 hours",
	"Last 24 hours",
];
const TIME_RANGE_TO_SINCE_SECONDS = {
	"Last 5 minutes": 300,
	"Last 15 minutes": 900,
	"Last 1 hour": 3600,
	"Last 6 hours": 21600,
	"Last 24 hours": 86400,
};
const DETAIL_TABS = ["Document", "JSON", "Fields"];
const FILTER_OPERATORS_BY_FIELD_TYPE = {
	date: [{ value: "at", label: "at" }],
	keyword: [{ value: "is", label: "is" }],
	text: [
		{ value: "is", label: "is" },
		{ value: "contains", label: "contains" },
	],
};
const DEFAULT_FILTER_OPERATORS = FILTER_OPERATORS_BY_FIELD_TYPE.text;
const LOG_ROW_HEIGHT = 53;
const LOG_ROW_OVERSCAN = 8;

function formatLastRefreshedAt(lastRefreshedAt) {
	if (!lastRefreshedAt) {
		return "Not refreshed yet";
	}

	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).format(lastRefreshedAt);
}

function getLevelBadgeClass(level) {
	return (
		{
			ERROR:
				"border-red-500/30 bg-red-500/12 text-red-700 dark:bg-red-500/18 dark:text-red-200",
			WARN: "border-amber-500/30 bg-amber-500/12 text-amber-700 dark:bg-amber-500/18 dark:text-amber-200",
			INFO: "border-sky-500/30 bg-sky-500/12 text-sky-700 dark:bg-sky-500/18 dark:text-sky-200",
			DEBUG:
				"border-emerald-500/30 bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/18 dark:text-emerald-200",
		}[level] || "border-white/8 bg-white/5 text-foreground"
	);
}

function ControlLabel({ children }) {
	return (
		<span className="text-[10px] font-medium text-foreground/80">
			{children}
		</span>
	);
}

function DropdownControl({
	label,
	value,
	options,
	onSelect,
	icon: Icon,
	className,
	disabled = false,
	placeholder,
	isLoading = false,
}) {
	const displayValue = value || placeholder;

	return (
		<div className={cn("min-w-0 space-y-2", className)}>
			<ControlLabel>{label}</ControlLabel>
			<DropdownMenu>
				<DropdownMenuTrigger asChild disabled={disabled}>
					<Button
						variant="outline"
						disabled={disabled}
						className="h-8 w-full justify-between rounded-md border-border/70 bg-background/80 px-2.5 text-[0.8rem] font-normal text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-[#091523] dark:hover:bg-[#0d1a2a]"
					>
						<span className="flex min-w-0 items-center gap-2 overflow-hidden">
							{Icon ? (
								<Icon className="size-4 shrink-0 text-muted-foreground" />
							) : null}
							<span className="truncate">{displayValue}</span>
						</span>
						{isLoading ? (
							<Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
						) : (
							<ChevronDown className="size-4 shrink-0 text-muted-foreground" />
						)}
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent className="w-64 border-border/70 bg-popover text-foreground dark:border-white/10 dark:bg-[#0d1927]">
					{options.map((option) => (
						<DropdownMenuItem
							key={String(option)}
							onSelect={() => onSelect?.(option)}
							className="cursor-pointer rounded-md px-3 py-2 text-sm focus:bg-muted dark:focus:bg-white/8"
						>
							<div className="flex w-full items-center justify-between gap-3">
								<span>{option}</span>
								{String(option) === String(value) ? (
									<Check className="size-4 text-primary" />
								) : null}
							</div>
						</DropdownMenuItem>
					))}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

function FilterFieldDropdown({
	value,
	fields,
	selectedField,
	searchText,
	onSearchTextChange,
	onSelect,
	disabled = false,
}) {
	const displayValue = selectedField?.name || "Select field";

	return (
		<div className="min-w-0 space-y-1">
			<ControlLabel>Field</ControlLabel>
			<DropdownMenu>
				<DropdownMenuTrigger asChild disabled={disabled}>
					<Button
						variant="outline"
						disabled={disabled}
						className="h-8 w-full justify-between rounded-md border-border/70 bg-background/80 px-2.5 text-[0.8rem] font-normal text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-[#091523] dark:hover:bg-[#0d1a2a]"
					>
						<span className="flex min-w-0 items-center gap-2 overflow-hidden">
							<span className="truncate">{displayValue}</span>
							{selectedField ? (
								<span className="shrink-0 rounded border border-border/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground dark:border-white/10">
									{selectedField.type}
								</span>
							) : null}
						</span>
						<ChevronDown className="size-4 shrink-0 text-muted-foreground" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent className="max-h-72 w-72 overflow-y-auto border-border/70 bg-popover p-2 text-foreground dark:border-white/10 dark:bg-[#0d1927]">
					<div className="pb-2">
						<label htmlFor="filter-field-search" className="sr-only">
							Search fields
						</label>
						<input
							id="filter-field-search"
							type="text"
							value={searchText}
							onChange={(event) => onSearchTextChange(event.target.value)}
							onKeyDown={(event) => event.stopPropagation()}
							placeholder="Search fields"
							className="h-8 w-full rounded-md border border-border/70 bg-background/80 px-2.5 text-[0.8rem] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-white/10 dark:bg-[#091523]"
						/>
					</div>
					{fields.length > 0 ? (
						fields.map((field) => (
							<DropdownMenuItem
								key={field.name}
								onSelect={() => onSelect?.(field.name)}
								className="cursor-pointer rounded-md px-3 py-2 text-sm focus:bg-muted dark:focus:bg-white/8"
							>
								<div className="flex w-full items-center justify-between gap-3">
									<div className="min-w-0">
										<div className="truncate">{field.name}</div>
										<div className="text-[11px] text-muted-foreground">
											{formatFieldType(field.type)} field
										</div>
									</div>
									{field.name === value ? (
										<Check className="size-4 shrink-0 text-primary" />
									) : null}
								</div>
							</DropdownMenuItem>
						))
					) : (
						<div className="px-3 py-2 text-sm text-muted-foreground">
							No matching fields
						</div>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

function DeploymentDropdown({
	selectedDeployment,
	deployments,
	isDisabled,
	isLoading,
	error,
	onRetry,
	onSelect,
	className,
}) {
	const hasDeployments = deployments.length > 0;
	const displayValue = isDisabled
		? "Select namespace"
		: selectedDeployment || "Select deployment";

	return (
		<div className={cn("min-w-0 space-y-2", className)}>
			<ControlLabel>Deployment</ControlLabel>
			<DropdownMenu>
				<DropdownMenuTrigger asChild disabled={isDisabled}>
					<Button
						variant="outline"
						disabled={isDisabled}
						className="h-8 w-full justify-between rounded-md border-border/70 bg-background/80 px-2.5 text-[0.8rem] font-normal text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-[#091523] dark:hover:bg-[#0d1a2a]"
					>
						<span className="flex min-w-0 items-center gap-2 overflow-hidden">
							<span className="truncate">{displayValue}</span>
						</span>
						{isLoading ? (
							<Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
						) : (
							<ChevronDown className="size-4 shrink-0 text-muted-foreground" />
						)}
					</Button>
				</DropdownMenuTrigger>
				{!isDisabled && !isLoading ? (
					<DropdownMenuContent className="w-64 border-border/70 bg-popover text-foreground dark:border-white/10 dark:bg-[#0d1927]">
						{error ? (
							<>
								<div className="px-3 py-2 text-sm text-destructive">
									{error}
								</div>
								<DropdownMenuItem
									onSelect={() => onRetry?.()}
									className="cursor-pointer rounded-md px-3 py-2 text-sm focus:bg-muted dark:focus:bg-white/8"
								>
									Retry
								</DropdownMenuItem>
							</>
						) : hasDeployments ? (
							deployments.map((deployment) => (
								<DropdownMenuItem
									key={deployment.name}
									onSelect={() => onSelect?.(deployment.name)}
									className="cursor-pointer rounded-md px-3 py-2 text-sm focus:bg-muted dark:focus:bg-white/8"
								>
									<div className="flex w-full items-center justify-between gap-3">
										<span className="truncate">{deployment.name}</span>
										{deployment.name === selectedDeployment ? (
											<Check className="size-4 text-primary" />
										) : null}
									</div>
								</DropdownMenuItem>
							))
						) : null}
					</DropdownMenuContent>
				) : null}
			</DropdownMenu>
			{null}
		</div>
	);
}

function PodsDropdown({
	selectedPods,
	pods,
	isDisabled,
	isLoading,
	error,
	onRetry,
	onToggle,
	className,
}) {
	const label = isDisabled
		? "Select deployment"
		: selectedPods.length === 0
			? "Select pods"
			: `${selectedPods.length} selected`;
	const hasPods = pods.length > 0;

	return (
		<div className={cn("min-w-0 space-y-2", className)}>
			<ControlLabel>Pods</ControlLabel>
			<DropdownMenu>
				<DropdownMenuTrigger asChild disabled={isDisabled}>
					<Button
						variant="outline"
						disabled={isDisabled}
						className="h-8 w-full justify-between rounded-md border-border/70 bg-background/80 px-2.5 text-[0.8rem] font-normal text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-[#091523] dark:hover:bg-[#0d1a2a]"
					>
						<span className="truncate">{label}</span>
						{isLoading ? (
							<Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
						) : (
							<ChevronDown className="size-4 shrink-0 text-muted-foreground" />
						)}
					</Button>
				</DropdownMenuTrigger>
				{!isDisabled ? (
					<DropdownMenuContent className="w-80 border-border/70 bg-popover text-foreground dark:border-white/10 dark:bg-[#0d1927]">
						{isLoading ? (
							<div className="px-3 py-2 text-sm text-muted-foreground">
								Loading pods...
							</div>
						) : error ? (
							<>
								<div className="px-3 py-2 text-sm text-destructive">
									{error}
								</div>
								<DropdownMenuItem
									onSelect={() => onRetry?.()}
									className="cursor-pointer rounded-md px-3 py-2 text-sm focus:bg-muted dark:focus:bg-white/8"
								>
									Retry
								</DropdownMenuItem>
							</>
						) : hasPods ? (
							pods.map((pod) => {
								const checked = selectedPods.includes(pod.name);
								return (
									<DropdownMenuItem
										key={pod.name}
										onSelect={(event) => {
											event.preventDefault();
											onToggle(pod.name);
										}}
										className="cursor-pointer rounded-md px-3 py-2 text-sm focus:bg-muted dark:focus:bg-white/8"
									>
										<div className="flex w-full items-center gap-3">
											<span
												className={cn(
													"flex size-4 items-center justify-center rounded-sm border",
													checked
														? "border-primary bg-primary/20 text-primary"
														: "border-white/20 text-transparent",
												)}
											>
												<Check className="size-3" />
											</span>
											<span className="truncate">{pod.name}</span>
										</div>
									</DropdownMenuItem>
								);
							})
						) : (
							<div className="px-3 py-2 text-sm text-muted-foreground">
								No pods found for this deployment
							</div>
						)}
					</DropdownMenuContent>
				) : null}
			</DropdownMenu>
		</div>
	);
}

function getFilterOperatorsForField(field) {
	return (
		FILTER_OPERATORS_BY_FIELD_TYPE[field?.type] ?? DEFAULT_FILTER_OPERATORS
	);
}

function getFilterValuePlaceholder(field) {
	return field?.type === "date" ? "Enter timestamp" : "Enter value";
}

function formatFieldType(type) {
	return type ? type.charAt(0).toUpperCase() + type.slice(1) : "Unknown";
}

function formatKqlFieldValue(value) {
	const trimmedValue = String(value || "").trim();

	if (!trimmedValue) {
		return "";
	}

	if (/[\s()":]/.test(trimmedValue)) {
		return `"${trimmedValue.replaceAll('"', '\\"')}"`;
	}

	return trimmedValue;
}

function appendKqlFieldFilter(query, fieldName, value) {
	const clauseValue = formatKqlFieldValue(value);

	if (!fieldName || !clauseValue) {
		return query;
	}

	const clause = `${fieldName}:${clauseValue}`;
	const trimmedQuery = String(query || "").trim();

	return trimmedQuery ? `${trimmedQuery} AND ${clause}` : clause;
}

function KqlHelpDialog() {
	const examples = [
		{
			label: "Free text",
			query: "connection failed",
			description: "Searches the main log message text.",
		},
		{
			label: "Field match",
			query: "level:error",
			description: "Matches a normalized field value.",
		},
		{
			label: "Quoted value",
			query: 'message:"connection failed"',
			description: "Use quotes when the value contains spaces.",
		},
		{
			label: "AND",
			query: "level:error AND statusCode:500",
			description: "Requires both conditions.",
		},
		{
			label: "OR",
			query: "level:error OR level:warn",
			description: "Matches either condition.",
		},
		{
			label: "NOT",
			query: "level:error AND NOT service.name:cache",
			description: "Excludes matching entries.",
		},
		{
			label: "Grouping",
			query: "(level:error OR level:warn) AND statusCode:500",
			description: "Controls boolean precedence.",
		},
		{
			label: "Timestamp",
			query: "@timestamp:2026-07-19",
			description: "Matches timestamp text such as date or ISO values.",
		},
	];

	return (
		<Dialog.Root>
			<Dialog.Trigger asChild>
				<button
					type="button"
					className="text-muted-foreground hover:text-foreground"
					aria-label="Open KQL help"
					title="KQL help"
				>
					<HelpCircle className="size-4" />
				</button>
			</Dialog.Trigger>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 z-40 bg-background/55 backdrop-blur-sm" />
				<Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(42rem,calc(100vh-2rem))] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-card text-card-foreground shadow-xl outline-none">
					<div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
						<div className="min-w-0">
							<Dialog.Title className="text-base font-semibold text-foreground">
								KQL query guide
							</Dialog.Title>
							<Dialog.Description className="mt-1 text-sm text-muted-foreground">
								Use text, field filters, and boolean operators to narrow the
								loaded log snapshot.
							</Dialog.Description>
						</div>
						<Dialog.Close asChild>
							<Button variant="ghost" size="icon-sm" aria-label="Close KQL help">
								<X className="size-4" />
							</Button>
						</Dialog.Close>
					</div>
					<div className="min-h-0 overflow-auto px-4 py-3">
						<div className="grid gap-2 sm:grid-cols-2">
							{examples.map((example) => (
								<div
									key={example.label}
									className="rounded-lg border border-border/70 bg-background/70 p-3 dark:border-white/8 dark:bg-[#091523]"
								>
									<div className="text-xs font-medium text-muted-foreground">
										{example.label}
									</div>
									<code className="mt-1 block break-words rounded-md bg-muted px-2 py-1.5 text-xs text-foreground dark:bg-white/[0.04]">
										{example.query}
									</code>
									<div className="mt-2 text-xs leading-5 text-muted-foreground">
										{example.description}
									</div>
								</div>
							))}
						</div>
						<div className="mt-3 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground dark:border-white/8 dark:bg-white/[0.03]">
							Field names are matched case-insensitively. Empty queries show all
							loaded logs. While a query is incomplete, the table keeps showing
							the previous loaded snapshot.
						</div>
					</div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}

function DetailsTabButton({ active, children, onClick }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"border-b-2 pb-3 text-sm transition-colors",
				active
					? "border-primary text-primary"
					: "border-transparent text-muted-foreground hover:text-foreground",
			)}
		>
			{children}
		</button>
	);
}

const LogDetailsPanel = memo(function LogDetailsPanel({
	log,
	selectedDetailTab,
	onSelectTab,
	onClose,
	className,
}) {
	const detailEntries = useMemo(() => Object.entries(log.details), [log]);

	return (
		<aside
			className={cn(
				"flex min-h-0 flex-1 flex-col rounded-xl border border-border/70 bg-card/90 dark:border-white/8 dark:bg-[#0b1622]",
				className,
			)}
		>
			<div className="flex items-center justify-between gap-3 border-b border-border/70 px-3 py-2 dark:border-white/8">
				<div className="min-w-0">
					<h3 className="truncate text-lg font-medium tracking-tight">
						{log.timestamp}
					</h3>
				</div>
				<div className="flex items-center gap-2">
					<span
						className={cn(
							"inline-flex rounded-md border px-2 py-1 text-xs font-medium",
							getLevelBadgeClass(log.level),
						)}
					>
						{log.level}
					</span>
					<button
						type="button"
						className="text-muted-foreground hover:text-foreground"
					>
						<ChevronLeft className="size-4" />
					</button>
					<button
						type="button"
						className="text-muted-foreground hover:text-foreground"
					>
						<ChevronRight className="size-4" />
					</button>
					<button
						type="button"
						onClick={onClose}
						className="text-muted-foreground hover:text-foreground"
					>
						<X className="size-4" />
					</button>
				</div>
			</div>

			<div className="flex items-center gap-4 border-b border-border/70 px-3 pt-1.5 dark:border-white/8">
				{DETAIL_TABS.map((tab) => (
					<DetailsTabButton
						key={tab}
						active={selectedDetailTab === tab}
						onClick={() => onSelectTab(tab)}
					>
						{tab}
					</DetailsTabButton>
				))}
			</div>

			<div className="min-h-0 flex-1 overflow-auto px-3 py-2 text-xs">
				{selectedDetailTab === "Document" ? (
					<div className="space-y-2">
						{detailEntries.map(([label, value]) => (
							<div
								key={label}
								className="grid gap-0.5 border-b border-border/50 pb-1.5 last:border-b-0 dark:border-white/6"
							>
								<div className="text-[11px] leading-4 text-muted-foreground">
									{label}
								</div>
								<div className="break-words text-[12px] leading-4 text-foreground/90">
									{String(value)}
								</div>
							</div>
						))}
					</div>
				) : null}

				{selectedDetailTab === "JSON" ? (
					<pre className="overflow-auto rounded-lg border border-border/70 bg-background/80 p-3 text-[11px] leading-4 text-foreground/90 dark:border-white/8 dark:bg-[#091523]">
						{JSON.stringify(log.details, null, 2)}
					</pre>
				) : null}

				{selectedDetailTab === "Fields" ? (
					<ul className="space-y-1.5">
						{detailEntries.map(([label]) => (
							<li
								key={label}
								className="rounded-md border border-border/70 bg-muted/40 px-2.5 py-1.5 text-[11px] leading-4 dark:border-white/8 dark:bg-white/[0.03]"
							>
								{label}
							</li>
						))}
					</ul>
				) : null}
			</div>

			<div className="flex items-center gap-2 border-t border-border/70 px-3 py-2 dark:border-white/8">
				<Button
					variant="outline"
					className="h-8 flex-1 rounded-md border-border/70 bg-transparent text-xs hover:bg-muted dark:border-white/10 dark:hover:bg-white/6"
				>
					<Copy className="size-4" />
					Copy
				</Button>
				<Button
					variant="outline"
					className="h-8 flex-1 rounded-md border-border/70 bg-transparent text-xs hover:bg-muted dark:border-white/10 dark:hover:bg-white/6"
				>
					<FileJson2 className="size-4" />
					View raw
				</Button>
			</div>
		</aside>
	);
});

export function LogViewerScreen({
	cluster,
	apiBaseUrl = "http://localhost:3000",
}) {
	const clusterId = cluster?.id ?? null;
	const ensureClusterState = useViewerStore(
		(state) => state.getOrCreateClusterState,
	);
	const setSelectedNamespace = useViewerStore(
		(state) => state.setSelectedNamespace,
	);
	const setSelectedDeployment = useViewerStore(
		(state) => state.setSelectedDeployment,
	);
	const setSelectedPods = useViewerStore((state) => state.setSelectedPods);
	const setQuery = useViewerStore((state) => state.setQuery);
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

	const [isFilterPopoverOpen, setIsFilterPopoverOpen] = useState(false);
	const [filterDraftField, setFilterDraftField] = useState("");
	const [filterDraftOperator, setFilterDraftOperator] = useState(
		DEFAULT_FILTER_OPERATORS[0].value,
	);
	const [filterDraftValue, setFilterDraftValue] = useState("");
	const [filterFieldSearchText, setFilterFieldSearchText] = useState("");
	const [selectedTimeRange, setSelectedTimeRange] = useState(
		MOCK_TIME_RANGES[0],
	);
	const [selectedDetailTab, setSelectedDetailTab] = useState("Document");
	const [isDetailsOpen, setIsDetailsOpen] = useState(false);
	const [selectedLogId, setSelectedLogId] = useState(null);
	const [logs, setLogs] = useState([]);
	const [isLogsLoading, setIsLogsLoading] = useState(false);
	const [isLoadingMoreLogs, setIsLoadingMoreLogs] = useState(false);
	const [logsError, setLogsError] = useState("");
	const [hasLoadedLogs, setHasLoadedLogs] = useState(false);
	const [lastRefreshedAt, setLastRefreshedAt] = useState(null);
	const [lastRefreshDurationMs, setLastRefreshDurationMs] = useState(null);
	const [activeSearch, setActiveSearch] = useState(null);
	const [namespaces, setNamespaces] = useState([]);
	const [isNamespacesLoading, setIsNamespacesLoading] = useState(false);
	const [, setNamespacesError] = useState("");
	const [deployments, setDeployments] = useState([]);
	const [isDeploymentsLoading, setIsDeploymentsLoading] = useState(false);
	const [deploymentsError, setDeploymentsError] = useState("");
	const [pods, setPods] = useState([]);
	const [isPodsLoading, setIsPodsLoading] = useState(false);
	const [podsError, setPodsError] = useState("");
	const [trimmedLogCount, setTrimmedLogCount] = useState(0);
	const [logTableScrollTop, setLogTableScrollTop] = useState(0);
	const [logTableViewportHeight, setLogTableViewportHeight] = useState(0);
	const logTableContainerRef = useRef(null);
	const logTableScrollFrameRef = useRef(null);

	const isConnected = isClusterConnected(cluster);
	const selectedNamespace = clusterViewerState.selectedNamespace;
	const selectedDeployment = clusterViewerState.selectedDeployment;
	const selectedPods = clusterViewerState.selectedPods;
	const queryDraft = clusterViewerState.query ?? "";
	const setQueryDraft = useCallback(
		(nextQuery) => {
			if (!clusterId) {
				return;
			}

			const resolvedQuery =
				typeof nextQuery === "function" ? nextQuery(queryDraft) : nextQuery;

			setQuery(clusterId, resolvedQuery);
		},
		[clusterId, queryDraft, setQuery],
	);
	const deferredQueryDraft = useDeferredValue(queryDraft);
	const queryEvaluation = useMemo(
		() => evaluateKqlQuery(logs, deferredQueryDraft),
		[logs, deferredQueryDraft],
	);
	const queryResults = queryEvaluation.ok ? queryEvaluation.logs : logs;
	const queryErrorMessage = queryEvaluation.error
		? `Invalid query: ${queryEvaluation.error.message}`
		: "";
	const selectedLog = useMemo(
		() => queryResults.find((entry) => entry.id === selectedLogId) || null,
		[queryResults, selectedLogId],
	);
	const namespaceOptions = useMemo(
		() => namespaces.map((namespace) => namespace.name),
		[namespaces],
	);
	const datasetFields = useMemo(
		() =>
			DatasetFieldService.discoverFields(logs.map((log) => log.details ?? log)),
		[logs],
	);
	const searchableFilterFields = datasetFields;
	const filteredFilterFields = useMemo(() => {
		const normalizedSearch = filterFieldSearchText.trim().toLowerCase();

		if (!normalizedSearch) {
			return searchableFilterFields;
		}

		return searchableFilterFields.filter(
			(field) =>
				field.name.toLowerCase().includes(normalizedSearch) ||
				field.type.toLowerCase().includes(normalizedSearch),
		);
	}, [filterFieldSearchText, searchableFilterFields]);
	const selectedFilterField = useMemo(() => {
		if (!hasLoadedLogs || searchableFilterFields.length === 0) {
			return null;
		}

		return (
			searchableFilterFields.find((field) => field.name === filterDraftField) ??
			searchableFilterFields[0]
		);
	}, [filterDraftField, hasLoadedLogs, searchableFilterFields]);
	const selectedFilterFieldName = selectedFilterField?.name ?? "";
	const filterOperatorOptions = useMemo(
		() => getFilterOperatorsForField(selectedFilterField),
		[selectedFilterField],
	);
	const selectedFilterOperator = filterOperatorOptions.some(
		(operator) => operator.value === filterDraftOperator,
	)
		? filterDraftOperator
		: filterOperatorOptions[0].value;
	const selectedFilterOperatorLabel =
		filterOperatorOptions.find(
			(operator) => operator.value === selectedFilterOperator,
		)?.label ?? filterOperatorOptions[0].label;
	const canSearch =
		Boolean(clusterId) &&
		Boolean(selectedNamespace) &&
		Boolean(selectedDeployment) &&
		selectedPods.length > 0 &&
		!isLogsLoading &&
		!isLoadingMoreLogs;
	const canOpenFilterDialog = hasLoadedLogs;
	const selectedSinceSeconds =
		TIME_RANGE_TO_SINCE_SECONDS[selectedTimeRange] ?? null;
	const canLoadMore =
		Boolean(activeSearch?.searchSessionId) &&
		Boolean(activeSearch?.hasMore) &&
		logs.length < MAX_LOG_DATASET_SIZE &&
		!isLogsLoading &&
		!isLoadingMoreLogs;
	const activeTimeRangeLabel =
		activeSearch?.timeRangeLabel ?? selectedTimeRange;
	const totalAvailableLogCount = activeSearch?.totalCount ?? logs.length;
	const loadedLogsSummary = useMemo(() => {
		if (!hasLoadedLogs) {
			return `Showing logs from ${activeTimeRangeLabel.toLowerCase()}`;
		}

		const capSummary =
			trimmedLogCount > 0
				? ` (capped at ${MAX_LOG_DATASET_SIZE.toLocaleString()})`
				: "";

		return `Loaded ${logs.length.toLocaleString()} of ${totalAvailableLogCount.toLocaleString()} logs${capSummary}`;
	}, [
		activeTimeRangeLabel,
		hasLoadedLogs,
		logs.length,
		totalAvailableLogCount,
		trimmedLogCount,
	]);

	useEffect(() => {
		if (!clusterId) {
			return undefined;
		}

		const abortController = new AbortController();

		const loadNamespaces = async () => {
			setIsNamespacesLoading(true);
			setNamespacesError("");
			setNamespaces([]);

			try {
				const nextNamespaces = await fetchClusterNamespaces(
					fetch,
					clusterId,
					apiBaseUrl,
				);

				if (abortController.signal.aborted) {
					return;
				}

				setNamespaces(nextNamespaces);
				setIsNamespacesLoading(false);

				if (
					selectedNamespace &&
					!nextNamespaces.some(
						(namespace) => namespace.name === selectedNamespace,
					)
				) {
					setDeployments([]);
					setDeploymentsError("");
					setIsDeploymentsLoading(false);
					setPods([]);
					setPodsError("");
					setIsPodsLoading(false);
					setSelectedNamespace(clusterId, null);
				}
			} catch (error) {
				if (abortController.signal.aborted) {
					return;
				}

				setNamespaces([]);
				setNamespacesError(error.message || "Unable to load namespaces");
				setIsNamespacesLoading(false);
			}
		};

		void loadNamespaces();

		return () => {
			abortController.abort();
		};
	}, [apiBaseUrl, clusterId, selectedNamespace, setSelectedNamespace]);

	useEffect(() => {
		if (!clusterId || !selectedNamespace) {
			return undefined;
		}

		const abortController = new AbortController();

		const loadDeployments = async () => {
			setIsDeploymentsLoading(true);
			setDeploymentsError("");
			setDeployments([]);

			try {
				const nextDeployments = await fetchClusterDeployments(
					fetch,
					clusterId,
					selectedNamespace,
					apiBaseUrl,
				);

				if (abortController.signal.aborted) {
					return;
				}

				setDeployments(nextDeployments);
				setIsDeploymentsLoading(false);

				if (
					selectedDeployment &&
					!nextDeployments.some(
						(deployment) => deployment.name === selectedDeployment,
					)
				) {
					setSelectedDeployment(clusterId, null);
				}
			} catch (error) {
				if (abortController.signal.aborted) {
					return;
				}

				setDeployments([]);
				setDeploymentsError(error.message || "Unable to load deployments");
				setIsDeploymentsLoading(false);
			}
		};

		void loadDeployments();

		return () => {
			abortController.abort();
		};
	}, [
		apiBaseUrl,
		clusterId,
		selectedDeployment,
		selectedNamespace,
		setSelectedDeployment,
	]);

	const handleRetryDeployments = () => {
		if (!clusterId || !selectedNamespace) {
			return;
		}

		setIsDeploymentsLoading(true);
		setDeploymentsError("");
		setDeployments([]);

		void fetchClusterDeployments(
			fetch,
			clusterId,
			selectedNamespace,
			apiBaseUrl,
		)
			.then((nextDeployments) => {
				setDeployments(nextDeployments);
				setIsDeploymentsLoading(false);

				if (
					selectedDeployment &&
					!nextDeployments.some(
						(deployment) => deployment.name === selectedDeployment,
					)
				) {
					setSelectedDeployment(clusterId, null);
				}
			})
			.catch((error) => {
				setDeployments([]);
				setDeploymentsError(error.message || "Unable to load deployments");
				setIsDeploymentsLoading(false);
			});
	};

	useEffect(() => {
		if (!clusterId || !selectedNamespace || !selectedDeployment) {
			return undefined;
		}

		const abortController = new AbortController();

		const loadPods = async () => {
			setIsPodsLoading(true);
			setPodsError("");
			setPods([]);

			try {
				const nextPods = await fetchDeploymentPods(
					fetch,
					clusterId,
					selectedNamespace,
					selectedDeployment,
					apiBaseUrl,
				);

				if (abortController.signal.aborted) {
					return;
				}

				setPods(nextPods);
				setIsPodsLoading(false);
			} catch (error) {
				if (abortController.signal.aborted) {
					return;
				}

				setPods([]);
				setPodsError(error.message || "Unable to load pods");
				setIsPodsLoading(false);
			}
		};

		void loadPods();

		return () => {
			abortController.abort();
		};
	}, [apiBaseUrl, clusterId, selectedDeployment, selectedNamespace]);

	const handleRetryPods = () => {
		if (!clusterId || !selectedNamespace || !selectedDeployment) {
			return;
		}

		setIsPodsLoading(true);
		setPodsError("");
		setPods([]);

		void fetchDeploymentPods(
			fetch,
			clusterId,
			selectedNamespace,
			selectedDeployment,
			apiBaseUrl,
		)
			.then((nextPods) => {
				setPods(nextPods);
				setIsPodsLoading(false);
			})
			.catch((error) => {
				setPods([]);
				setPodsError(error.message || "Unable to load pods");
				setIsPodsLoading(false);
			});
	};

	const virtualWindow = useMemo(() => {
		const rowCount = queryResults.length;
		const viewportRowCount = Math.max(
			1,
			Math.ceil(logTableViewportHeight / LOG_ROW_HEIGHT),
		);
		const startIndex = Math.max(
			0,
			Math.floor(logTableScrollTop / LOG_ROW_HEIGHT) - LOG_ROW_OVERSCAN,
		);
		const endIndex = Math.min(
			rowCount,
			startIndex + viewportRowCount + LOG_ROW_OVERSCAN * 2,
		);

		return {
			startIndex,
			endIndex,
			topPadding: startIndex * LOG_ROW_HEIGHT,
			bottomPadding: Math.max(0, (rowCount - endIndex) * LOG_ROW_HEIGHT),
		};
	}, [logTableScrollTop, logTableViewportHeight, queryResults.length]);
	const visibleLogs = useMemo(
		() => queryResults.slice(virtualWindow.startIndex, virtualWindow.endIndex),
		[queryResults, virtualWindow.startIndex, virtualWindow.endIndex],
	);
	const activeSelectedLogId = selectedLog?.id ?? null;
	const isDetailsVisible = isDetailsOpen && selectedLog;
	const detailsPanelContainerRef = useRef(null);

	useEffect(() => {
		const tableContainer = logTableContainerRef.current;

		if (!tableContainer) {
			return undefined;
		}

		const updateViewportHeight = () => {
			setLogTableViewportHeight(tableContainer.clientHeight);
		};

		updateViewportHeight();
		const resizeObserver = new ResizeObserver(updateViewportHeight);
		resizeObserver.observe(tableContainer);

		return () => {
			resizeObserver.disconnect();
		};
	}, []);

	useEffect(() => {
		return () => {
			if (logTableScrollFrameRef.current) {
				cancelAnimationFrame(logTableScrollFrameRef.current);
			}
		};
	}, []);

	const handleSelectDeployment = (value) => {
		if (!clusterId) {
			return;
		}

		setPods([]);
		setPodsError("");
		setIsPodsLoading(false);
		setSelectedDeployment(clusterId, value);
	};

	const handleSelectNamespace = (value) => {
		if (!clusterId) {
			return;
		}

		setDeployments([]);
		setDeploymentsError("");
		setIsDeploymentsLoading(false);
		setPods([]);
		setPodsError("");
		setIsPodsLoading(false);
		setSelectedNamespace(clusterId, value);
	};

	const handleRefresh = async () => {
		if (!canSearch) {
			return;
		}

		const startedAt = performance.now();
		setIsLogsLoading(true);
		setLogsError("");
		setHasLoadedLogs(true);
		setActiveSearch(null);
		setTrimmedLogCount(0);

		try {
			const response = await createPodLogSearch(
				fetch,
				clusterId,
				selectedNamespace,
				apiBaseUrl,
				{
					podNames: selectedPods,
					sinceSeconds: selectedSinceSeconds,
					limit: 500,
					deployment: selectedDeployment,
				},
			);

			const trimmedDataset = trimLogDataset(response.logs);
			setLogs(trimmedDataset.logs);
			setTrimmedLogCount(trimmedDataset.trimmedCount);
			setLogTableScrollTop(0);
			logTableContainerRef.current?.scrollTo({ top: 0 });
			setActiveSearch({
				searchSessionId: response.searchSessionId,
				namespace: response.namespace,
				podNames: response.podNames,
				windowStartTimestamp: response.windowStartTimestamp,
				windowEndTimestamp: response.windowEndTimestamp,
				totalCount: response.totalCount,
				hasMore:
					response.hasMore && trimmedDataset.logs.length < MAX_LOG_DATASET_SIZE,
				nextOffset: response.nextOffset,
				timeRangeLabel: selectedTimeRange,
				query: queryDraft,
				deployment: selectedDeployment,
			});
			setSelectedLogId((currentSelectedLogId) =>
				trimmedDataset.logs.some((log) => log.id === currentSelectedLogId)
					? currentSelectedLogId
					: null,
			);
			setIsDetailsOpen(
				trimmedDataset.logs.some((log) => log.id === selectedLogId) &&
					isDetailsOpen,
			);
			setLastRefreshDurationMs(Math.round(performance.now() - startedAt));
		} catch (error) {
			setLogsError(error.message || "Unable to load logs");
			setLastRefreshDurationMs(Math.round(performance.now() - startedAt));
		} finally {
			setLastRefreshedAt(new Date());
			setIsLogsLoading(false);
		}
	};

	const handleLoadMoreLogs = async () => {
		if (!canLoadMore) {
			return;
		}

		setIsLoadingMoreLogs(true);
		setLogsError("");

		try {
			const response = await fetchPodLogSearchResults(
				fetch,
				clusterId,
				activeSearch.searchSessionId,
				apiBaseUrl,
				{
					offset: activeSearch.nextOffset,
					limit: 500,
					deployment: activeSearch.deployment,
				},
			);

			setLogs((currentLogs) => {
				const trimmedDataset = trimLogDataset([
					...currentLogs,
					...response.logs,
				]);
				setTrimmedLogCount(
					Math.max(
						trimmedDataset.trimmedCount,
						response.totalCount - trimmedDataset.logs.length,
					),
				);
				return trimmedDataset.logs;
			});
			setActiveSearch((currentSearch) =>
				currentSearch
					? {
							...currentSearch,
							totalCount: response.totalCount,
							hasMore:
								response.hasMore && response.nextOffset < MAX_LOG_DATASET_SIZE,
							nextOffset: response.nextOffset,
						}
					: currentSearch,
			);
		} catch (error) {
			setLogsError(error.message || "Unable to load more logs");
		} finally {
			setIsLoadingMoreLogs(false);
		}
	};

	const handleAddStructuredFilter = () => {
		if (!selectedFilterFieldName || !filterDraftValue.trim()) {
			return;
		}

		setQueryDraft((currentQuery) =>
			appendKqlFieldFilter(currentQuery, selectedFilterFieldName, filterDraftValue),
		);
		setFilterDraftValue("");
		setFilterFieldSearchText("");
		setIsFilterPopoverOpen(false);
	};

	const handleSelectLog = useCallback((logId) => {
		setSelectedLogId(logId);
		setIsDetailsOpen(true);
	}, []);
	const handleCloseDetails = useCallback(() => {
		setIsDetailsOpen(false);
	}, []);

	const handleLogTableScroll = useCallback((event) => {
		const nextScrollTop = event.currentTarget.scrollTop;

		if (logTableScrollFrameRef.current) {
			cancelAnimationFrame(logTableScrollFrameRef.current);
		}

		logTableScrollFrameRef.current = requestAnimationFrame(() => {
			setLogTableScrollTop(nextScrollTop);
		});
	}, []);

	const togglePod = (pod) => {
		if (!clusterId) {
			return;
		}

		setSelectedPods(
			clusterId,
			selectedPods.includes(pod)
				? selectedPods.filter((entry) => entry !== pod)
				: [...selectedPods, pod],
		);
	};

	return (
		<div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(15,86,166,0.12),transparent_36rem)] text-foreground">
			<section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/70 bg-card/80 dark:border-white/8 dark:bg-[#08121d]">
				<div className="grid gap-1.5 border-b border-border/70 px-2.5 py-1.5 dark:border-white/8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_10rem] xl:items-end">
					<DropdownControl
						label="Namespace"
						value={selectedNamespace}
						placeholder="Select namespace"
						options={namespaceOptions}
						disabled={!clusterId || namespaceOptions.length === 0}
						isLoading={isNamespacesLoading}
						onSelect={handleSelectNamespace}
					/>
					<DeploymentDropdown
						selectedDeployment={selectedDeployment}
						deployments={deployments}
						isDisabled={!selectedNamespace}
						isLoading={isDeploymentsLoading}
						error={deploymentsError}
						onRetry={handleRetryDeployments}
						onSelect={handleSelectDeployment}
					/>
					<PodsDropdown
						selectedPods={selectedPods}
						pods={pods}
						isDisabled={!selectedDeployment}
						isLoading={isPodsLoading}
						error={podsError}
						onRetry={handleRetryPods}
						onToggle={togglePod}
					/>
					<DropdownControl
						label="Time Range"
						value={selectedTimeRange}
						options={MOCK_TIME_RANGES}
						onSelect={setSelectedTimeRange}
						icon={CalendarDays}
					/>
				</div>

				<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2.5">
					<section className="shrink-0 rounded-xl border border-border/70 bg-card/90 p-2.5 dark:border-white/8 dark:bg-[#0b1622]">
						<div className="flex items-center gap-2">
							<div className="min-w-0 flex-1">
								<label htmlFor="log-query" className="sr-only">
									Search logs
								</label>
								<div className="relative">
									<input
										id="log-query"
										type="text"
										value={queryDraft}
										onChange={(event) => setQueryDraft(event.target.value)}
										placeholder="Search logs (KQL)"
										className="h-10 w-full rounded-lg border border-primary/60 bg-background/80 pl-3 pr-20 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 dark:bg-[#091523]"
									/>
									<div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
										<KqlHelpDialog />
										<button
											type="button"
											onClick={() => setQueryDraft("")}
											className="text-muted-foreground hover:text-foreground"
											aria-label="Clear search"
										>
											<X className="size-4" />
										</button>
									</div>
								</div>
								{queryErrorMessage ? (
									<div className="mt-1 text-xs text-destructive">
										{queryErrorMessage}
									</div>
								) : null}
							</div>
							<div className="relative shrink-0">
								<Button
									variant="ghost"
									className="h-8 px-2 text-xs text-primary hover:bg-transparent hover:text-primary/80"
									disabled={!canOpenFilterDialog}
									onClick={() => setIsFilterPopoverOpen((current) => !current)}
								>
									+ Add Filter
								</Button>
								{isFilterPopoverOpen ? (
									<div className="absolute right-0 top-[calc(100%+0.5rem)] z-20 w-80 rounded-lg border border-border/70 bg-popover p-3 text-popover-foreground shadow-lg dark:border-white/10 dark:bg-[#0d1927]">
										{searchableFilterFields.length === 0 ? (
											<div className="rounded-md border border-border/70 bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground dark:border-white/8 dark:bg-white/[0.03]">
												No searchable fields found in this dataset.
											</div>
										) : (
											<div className="grid gap-2">
												<FilterFieldDropdown
													value={selectedFilterFieldName}
													fields={filteredFilterFields}
													selectedField={selectedFilterField}
													searchText={filterFieldSearchText}
													onSearchTextChange={setFilterFieldSearchText}
													onSelect={setFilterDraftField}
												/>
												<DropdownControl
													label="Operator"
													value={selectedFilterOperatorLabel}
													options={filterOperatorOptions.map(
														(operator) => operator.label,
													)}
													onSelect={(nextLabel) => {
														const nextOperator = filterOperatorOptions.find(
															(operator) => operator.label === nextLabel,
														);
														if (nextOperator) {
															setFilterDraftOperator(nextOperator.value);
														}
													}}
													className="space-y-1"
												/>
												<div className="space-y-1">
													<ControlLabel>Value</ControlLabel>
													<input
														type="text"
														value={filterDraftValue}
														onChange={(event) =>
															setFilterDraftValue(event.target.value)
														}
														placeholder={getFilterValuePlaceholder(selectedFilterField)}
														className="h-8 w-full rounded-md border border-border/70 bg-background/80 px-2.5 text-[0.8rem] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-white/10 dark:bg-[#091523]"
													/>
												</div>
												<div className="flex justify-end gap-2 pt-1">
													<Button
														variant="ghost"
														className="h-8 px-2 text-xs"
														onClick={() => setIsFilterPopoverOpen(false)}
													>
														Cancel
													</Button>
													<Button
														className="h-8 px-3 text-xs"
														disabled={
															!selectedFilterFieldName ||
															!filterDraftValue.trim()
														}
														onClick={handleAddStructuredFilter}
													>
														Apply
													</Button>
												</div>
											</div>
										)}
									</div>
								) : null}
							</div>
							<Button
								className="h-8 shrink-0 rounded-md px-3"
								disabled={!canSearch}
								onClick={() => {
									void handleRefresh();
								}}
							>
								<Search
									className={cn("size-4", isLogsLoading ? "animate-spin" : "")}
								/>
								Search
							</Button>
						</div>
					</section>

					<div
						className={cn(
							"grid min-h-0 min-w-0 flex-1 gap-2 overflow-hidden",
							isDetailsVisible
								? "grid-cols-1 xl:grid-cols-[minmax(0,1fr)_23rem]"
								: "grid-cols-1",
						)}
					>
						<section
							className={cn(
								"min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-border/70 bg-card/90 dark:border-white/8 dark:bg-[#0b1622]",
								isDetailsVisible ? "hidden xl:flex" : "flex",
							)}
						>
							<div
								ref={logTableContainerRef}
								onScroll={handleLogTableScroll}
								className="min-h-0 flex-1 overflow-auto"
							>
								<table className="min-w-full border-separate border-spacing-0 text-sm">
									<thead className="sticky top-0 bg-card/95 dark:bg-[#0b1622]">
										<tr className="text-left text-xs uppercase tracking-[0.02em] text-muted-foreground">
											<th className="border-b border-white/8 px-3 py-3" />
											<th className="border-b border-white/8 px-3 py-3 font-medium">
												@timestamp
											</th>
											<th className="border-b border-white/8 px-3 py-3 font-medium">
												log.level
											</th>
											<th className="border-b border-white/8 px-3 py-3 font-medium">
												kubernetes.pod.name
											</th>
											<th className="border-b border-white/8 px-3 py-3 font-medium">
												service.name
											</th>
											<th className="border-b border-white/8 px-3 py-3 font-medium">
												message
											</th>
										</tr>
									</thead>
									<tbody>
										{isLogsLoading ? (
											<tr>
												<td
													colSpan={6}
													className="px-3 py-10 text-center text-muted-foreground"
												>
													<div className="inline-flex items-center gap-2">
														<Loader2 className="size-4 animate-spin" />
														Loading logs snapshot...
													</div>
												</td>
											</tr>
										) : logsError ? (
											<tr>
												<td
													colSpan={6}
													className="px-3 py-10 text-center text-destructive"
												>
													{logsError}
												</td>
											</tr>
										) : queryResults.length === 0 ? (
											<tr>
												<td
													colSpan={6}
													className="px-3 py-10 text-center text-muted-foreground"
												>
													{hasLoadedLogs
														? "No logs found for the selected dataset scope"
														: "Select cluster scope and click Search to load a log snapshot"}
												</td>
											</tr>
										) : (
											<>
												{virtualWindow.topPadding > 0 ? (
													<tr aria-hidden="true">
														<td
															colSpan={6}
															style={{ height: virtualWindow.topPadding }}
														/>
													</tr>
												) : null}
												{visibleLogs.map((log) => (
													<tr
														key={log.id}
														onClick={() => handleSelectLog(log.id)}
														className={cn(
															"cursor-pointer text-foreground/90 hover:bg-muted/50 dark:hover:bg-white/[0.03]",
															activeSelectedLogId === log.id && isDetailsOpen
																? "bg-muted/60 dark:bg-white/[0.04]"
																: "",
														)}
													>
														<td className="border-b border-white/6 px-3 py-3">
															<ChevronRight className="size-4" />
														</td>
														<td className="border-b border-white/6 px-3 py-3 whitespace-nowrap">
															{log.timestamp}
														</td>
														<td className="border-b border-white/6 px-3 py-3">
															<span
																className={cn(
																	"inline-flex rounded-md border px-2 py-1 text-xs font-medium",
																	getLevelBadgeClass(log.level),
																)}
															>
																{log.level}
															</span>
														</td>
														<td className="border-b border-white/6 px-3 py-3 max-w-60 truncate">
															{log.pod}
														</td>
														<td className="border-b border-white/6 px-3 py-3 whitespace-nowrap">
															{log.service}
														</td>
														<td className="border-b border-white/6 px-3 py-3 max-w-[26rem] truncate">
															{log.message}
														</td>
													</tr>
												))}
												{virtualWindow.bottomPadding > 0 ? (
													<tr aria-hidden="true">
														<td
															colSpan={6}
															style={{ height: virtualWindow.bottomPadding }}
														/>
													</tr>
												) : null}
											</>
										)}
									</tbody>
								</table>
							</div>

							<div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 text-xs text-muted-foreground">
								<span>{loadedLogsSummary}</span>
								{activeSearch?.hasMore ? (
									<Button
										variant="outline"
										className="h-8 rounded-md border-border/70 bg-transparent px-3 text-xs dark:border-white/10"
										disabled={!canLoadMore}
										onClick={() => {
											void handleLoadMoreLogs();
										}}
									>
										{isLoadingMoreLogs ? (
											<Loader2 className="size-4 animate-spin" />
										) : null}
										Show More
									</Button>
								) : null}
							</div>
						</section>

						{isDetailsVisible ? (
							<div
								ref={detailsPanelContainerRef}
								className="min-h-0 xl:sticky xl:top-0 xl:flex xl:h-full"
							>
								<LogDetailsPanel
									log={selectedLog}
									selectedDetailTab={selectedDetailTab}
									onSelectTab={setSelectedDetailTab}
									onClose={handleCloseDetails}
									className="xl:h-full"
								/>
							</div>
						) : null}
					</div>
				</div>

				<footer className="flex flex-wrap items-center justify-between gap-4 border-t border-border/70 px-5 py-4 text-sm text-muted-foreground dark:border-white/8">
					<div className="flex items-center gap-3">
						<span
							className={cn(
								"inline-flex items-center gap-2",
								isConnected ? "text-foreground" : "text-muted-foreground",
							)}
						>
							<span
								className={cn(
									"size-2.5 rounded-full",
									isConnected ? "bg-emerald-400" : "bg-muted-foreground",
								)}
							/>
							Last updated: {formatLastRefreshedAt(lastRefreshedAt)}
						</span>
					</div>

					<div className="flex items-center gap-6">
						<span>
							Showing {queryResults.length.toLocaleString()} of{" "}
							{logs.length.toLocaleString()} logs
						</span>
						<span>
							{lastRefreshDurationMs === null
								? "Snapshot not loaded yet"
								: `Snapshot loaded in ${lastRefreshDurationMs}ms`}
						</span>
					</div>
				</footer>
			</section>
		</div>
	);
}
