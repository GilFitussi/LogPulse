import { useEffect, useMemo, useState } from "react";
import {
	CalendarDays,
	Check,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Columns3,
	Copy,
	FileJson2,
	Filter,
	Info,
	MoreHorizontal,
	Pause,
	Play,
	RefreshCw,
	Save,
	Search,
	Settings2,
	SquareChevronRight,
	X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { isClusterConnected } from "@/lib/viewerNavigation";
import {
	createDefaultClusterViewerState,
	getClusterViewerStateOrDefault,
	useViewerStore,
} from "@/stores/useViewerStore";

const MOCK_NAMESPACES = ["production", "staging", "dev"];
const MOCK_DEPLOYMENTS = [
	"payment-service",
	"checkout-service",
	"orders-service",
];
const MOCK_PODS = [
	"payment-service-api-7d4f6c7d89-lx2pm",
	"payment-service-worker-6b5dd7f5c8-9k2nt",
	"payment-service-web-5f6b8c9c7d-m7nq2",
];
const MOCK_TIME_RANGES = ["Last 15 minutes", "Last 1 hour", "Last 24 hours"];
const MOCK_COLUMN_PRESETS = ["Default", "Compact", "Debug"];
const MOCK_PAGE_SIZES = [25, 50, 100, 250];
const DETAIL_TABS = ["Document", "JSON", "Fields"];

const FIELD_ROWS = [
	{ name: "@timestamp", type: "date" },
	{ name: "message", type: "text" },
	{ name: "log.level", type: "keyword" },
	{ name: "service.name", type: "keyword" },
	{ name: "kubernetes.namespace_name", type: "keyword" },
	{ name: "kubernetes.pod.name", type: "keyword" },
	{ name: "kubernetes.container.name", type: "keyword" },
	{ name: "trace.id", type: "keyword" },
	{ name: "http.request.method", type: "keyword" },
	{ name: "http.response.status_code", type: "long" },
	{ name: "url.path", type: "keyword" },
	{ name: "user.id", type: "keyword" },
	{ name: "host.name", type: "keyword" },
	{ name: "request.id", type: "keyword" },
	{ name: "event.dataset", type: "keyword" },
	{ name: "cloud.region", type: "keyword" },
];

const MOCK_LOGS = [
	{
		id: "log-1",
		timestamp: "May 12, 10:29:59.123",
		level: "ERROR",
		pod: "payment-service-api-7d4f6c7d89-lx2pm",
		service: "payment-service",
		message: "Failed to charge customer: timeout calling Billing API",
		details: {
			"@timestamp": "May 12, 2024 @ 10:29:59.123",
			"log.level": "ERROR",
			"service.name": "payment-service",
			"kubernetes.namespace_name": "production",
			"kubernetes.pod.name": "payment-service-api-7d4f6c7d89-lx2pm",
			"kubernetes.container.name": "payment",
			"host.name": "ip-10-0-12-34",
			"trace.id": "fb83e1c2b9a74d6dbf5e9c1a2b3d4e5f",
			"request.id": "req_9f8e7d6c5b4a3c2d",
			"http.request.method": "POST",
			"url.path": "/api/v1/payments/charge",
			"http.response.status_code": "504",
			message: "Failed to charge customer: timeout calling Billing API",
		},
	},
	{
		id: "log-2",
		timestamp: "May 12, 10:29:58.982",
		level: "ERROR",
		pod: "payment-service-worker-6b5dd7f5c8-9k2nt",
		service: "payment-service",
		message: "HTTP 503 from upstream service",
		details: {
			"@timestamp": "May 12, 2024 @ 10:29:58.982",
			"log.level": "ERROR",
			"service.name": "payment-service",
			"kubernetes.namespace_name": "production",
			"kubernetes.pod.name": "payment-service-worker-6b5dd7f5c8-9k2nt",
			message: "HTTP 503 from upstream service",
		},
	},
	{
		id: "log-3",
		timestamp: "May 12, 10:29:58.123",
		level: "ERROR",
		pod: "payment-service-web-5f6b8c9c7d-m7nq2",
		service: "payment-service",
		message: "Unhandled exception in payment processing",
		details: {
			"@timestamp": "May 12, 2024 @ 10:29:58.123",
			"log.level": "ERROR",
			message: "Unhandled exception in payment processing",
		},
	},
	{
		id: "log-4",
		timestamp: "May 12, 10:29:57.982",
		level: "ERROR",
		pod: "payment-service-api-7d4f6c7d89-lx2pm",
		service: "payment-service",
		message: "Database connection failed",
		details: {
			message: "Database connection failed",
			"log.level": "ERROR",
		},
	},
	{
		id: "log-5",
		timestamp: "May 12, 10:29:56.456",
		level: "ERROR",
		pod: "payment-service-web-5f6b8c9c7d-m7nq2",
		service: "payment-service",
		message: "Payment gateway error: code=504",
		details: {
			message: "Payment gateway error: code=504",
			"http.response.status_code": "504",
			"log.level": "ERROR",
		},
	},
	{
		id: "log-6",
		timestamp: "May 12, 10:29:54.123",
		level: "ERROR",
		pod: "payment-service-worker-6b5dd7f5c8-9k2nt",
		service: "payment-service",
		message: "Failed to process refund",
		details: {
			message: "Failed to process refund",
			"log.level": "ERROR",
		},
	},
	{
		id: "log-7",
		timestamp: "May 12, 10:29:53.765",
		level: "ERROR",
		pod: "payment-service-api-7d4f6c7d89-lx2pm",
		service: "payment-service",
		message: "Timeout while connecting to billing service",
		details: {
			message: "Timeout while connecting to billing service",
			"log.level": "ERROR",
		},
	},
	{
		id: "log-8",
		timestamp: "May 12, 10:29:52.321",
		level: "ERROR",
		pod: "payment-service-worker-6b5dd7f5c8-9k2nt",
		service: "payment-service",
		message: "Upstream service returned 502",
		details: {
			message: "Upstream service returned 502",
			"http.response.status_code": "502",
			"log.level": "ERROR",
		},
	},
	{
		id: "log-9",
		timestamp: "May 12, 10:29:51.987",
		level: "ERROR",
		pod: "payment-service-api-7d4f6c7d89-lx2pm",
		service: "payment-service",
		message: "Failed to charge customer: invalid response",
		details: {
			message: "Failed to charge customer: invalid response",
			"log.level": "ERROR",
		},
	},
	{
		id: "log-10",
		timestamp: "May 12, 10:29:51.234",
		level: "ERROR",
		pod: "payment-service-web-5f6b8c9c7d-m7nq2",
		service: "payment-service",
		message: "Payment processing failed",
		details: {
			message: "Payment processing failed",
			"log.level": "ERROR",
		},
	},
	{
		id: "log-11",
		timestamp: "May 12, 10:29:50.500",
		level: "WARN",
		pod: "payment-service-api-7d4f6c7d89-lx2pm",
		service: "payment-service",
		message: "Retrying billing request after timeout",
		details: {
			message: "Retrying billing request after timeout",
			"log.level": "WARN",
		},
	},
	{
		id: "log-12",
		timestamp: "May 12, 10:29:49.100",
		level: "INFO",
		pod: "payment-service-worker-6b5dd7f5c8-9k2nt",
		service: "payment-service",
		message: "Received payment request",
		details: {
			message: "Received payment request",
			"log.level": "INFO",
		},
	},
	{
		id: "log-13",
		timestamp: "May 12, 10:29:48.100",
		level: "DEBUG",
		pod: "payment-service-web-5f6b8c9c7d-m7nq2",
		service: "payment-service",
		message: "Rendering payment confirmation component",
		details: {
			message: "Rendering payment confirmation component",
			"log.level": "DEBUG",
		},
	},
];

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

function matchesQuery(log, query) {
	const normalized = query.trim().toLowerCase();
	if (!normalized) {
		return true;
	}

	return [log.timestamp, log.level, log.pod, log.service, log.message]
		.join(" ")
		.toLowerCase()
		.includes(normalized.replaceAll('"', ""));
}

function ControlLabel({ children }) {
	return (
		<span className="text-[11px] font-medium text-foreground/85">
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
}) {
	return (
		<div className={cn("min-w-0 space-y-2", className)}>
			<ControlLabel>{label}</ControlLabel>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						className="h-10 w-full justify-between rounded-md border-border/70 bg-background/80 px-3 text-sm font-normal text-foreground hover:bg-muted dark:border-white/10 dark:bg-[#091523] dark:hover:bg-[#0d1a2a]"
					>
						<span className="flex min-w-0 items-center gap-2 overflow-hidden">
							{Icon ? (
								<Icon className="size-4 shrink-0 text-muted-foreground" />
							) : null}
							<span className="truncate">{value}</span>
						</span>
						<ChevronDown className="size-4 shrink-0 text-muted-foreground" />
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

function PodsDropdown({ selectedPods, onToggle, className }) {
	const label =
		selectedPods.length === 0
			? "Select pods"
			: `${selectedPods.length} selected`;

	return (
		<div className={cn("min-w-0 space-y-2", className)}>
			<ControlLabel>Pods</ControlLabel>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="outline"
						className="h-10 w-full justify-between rounded-md border-border/70 bg-background/80 px-3 text-sm font-normal text-foreground hover:bg-muted dark:border-white/10 dark:bg-[#091523] dark:hover:bg-[#0d1a2a]"
					>
						<span className="truncate">{label}</span>
						<ChevronDown className="size-4 shrink-0 text-muted-foreground" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent className="w-80 border-border/70 bg-popover text-foreground dark:border-white/10 dark:bg-[#0d1927]">
					{MOCK_PODS.map((pod) => {
						const checked = selectedPods.includes(pod);
						return (
							<DropdownMenuItem
								key={pod}
								onSelect={(event) => {
									event.preventDefault();
									onToggle(pod);
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
									<span className="truncate">{pod}</span>
								</div>
							</DropdownMenuItem>
						);
					})}
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

function IconButton({ children, className, ...props }) {
	return (
		<Button
			variant="outline"
			size="icon-sm"
			className={cn(
				"border-border/70 bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground dark:border-white/10 dark:bg-[#091523] dark:hover:bg-[#0d1a2a]",
				className,
			)}
			{...props}
		>
			{children}
		</Button>
	);
}

function FieldRow({ field, onAdd }) {
	return (
		<button
			type="button"
			onClick={() => onAdd(field.name)}
			className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm text-foreground/90 hover:bg-muted/60 dark:hover:bg-white/5"
		>
			<div className="flex min-w-0 items-center gap-2">
				<SquareChevronRight className="size-4 shrink-0 text-sky-400" />
				<span className="truncate">{field.name}</span>
			</div>
			<span className="shrink-0 text-xs text-muted-foreground">
				{field.type}
			</span>
		</button>
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

function LogDetailsPanel({ log, selectedDetailTab, onSelectTab, onClose }) {
	const detailEntries = Object.entries(log.details);

	return (
		<aside className="flex min-h-0 flex-1 flex-col rounded-xl border border-border/70 bg-card/90 dark:border-white/8 dark:bg-[#0b1622]">
			<div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3 dark:border-white/8">
				<div className="min-w-0">
					<h3 className="truncate text-[1.65rem] font-medium tracking-tight">
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

			<div className="flex items-center gap-6 border-b border-border/70 px-4 pt-2 dark:border-white/8">
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

			<div className="min-h-0 flex-1 overflow-auto px-4 py-4 text-sm">
				{selectedDetailTab === "Document" ? (
					<div className="space-y-4">
						{detailEntries.map(([label, value]) => (
							<div
								key={label}
								className="grid gap-1 border-b border-border/50 pb-3 last:border-b-0 dark:border-white/6"
							>
								<div className="text-muted-foreground">{label}</div>
								<div className="break-words text-foreground/90">{value}</div>
							</div>
						))}
					</div>
				) : null}

				{selectedDetailTab === "JSON" ? (
					<pre className="overflow-auto rounded-lg border border-border/70 bg-background/80 p-4 text-xs text-foreground/90 dark:border-white/8 dark:bg-[#091523]">
						{JSON.stringify(log.details, null, 2)}
					</pre>
				) : null}

				{selectedDetailTab === "Fields" ? (
					<ul className="space-y-2">
						{detailEntries.map(([label]) => (
							<li
								key={label}
								className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 dark:border-white/8 dark:bg-white/[0.03]"
							>
								{label}
							</li>
						))}
					</ul>
				) : null}
			</div>

			<div className="flex items-center gap-3 border-t border-border/70 px-4 py-3 dark:border-white/8">
				<Button
					variant="outline"
					className="h-10 flex-1 rounded-md border-border/70 bg-transparent hover:bg-muted dark:border-white/10 dark:hover:bg-white/6"
				>
					<Copy className="size-4" />
					Copy
				</Button>
				<Button
					variant="outline"
					className="h-10 flex-1 rounded-md border-border/70 bg-transparent hover:bg-muted dark:border-white/10 dark:hover:bg-white/6"
				>
					<FileJson2 className="size-4" />
					View raw
				</Button>
			</div>
		</aside>
	);
}

export function LogViewerScreen({ cluster }) {
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

	const initialQuery =
		'level:error AND service.name:"payment-service" AND http.response.status_code >= 500';
	const [queryDraft, setQueryDraft] = useState(initialQuery);
	const [appliedQuery, setAppliedQuery] = useState(initialQuery);
	const [fieldSearch, setFieldSearch] = useState("");
	const [selectedTimeRange, setSelectedTimeRange] = useState(
		MOCK_TIME_RANGES[0],
	);
	const [selectedColumnsPreset, setSelectedColumnsPreset] = useState(
		MOCK_COLUMN_PRESETS[0],
	);
	const [rowsPerPage, setRowsPerPage] = useState(100);
	const [selectedDetailTab, setSelectedDetailTab] = useState("Document");
	const [isDetailsOpen, setIsDetailsOpen] = useState(true);
	const [selectedLogId, setSelectedLogId] = useState(MOCK_LOGS[0].id);
	const [isStreaming, setIsStreaming] = useState(false);
	const [selectedPods, setSelectedPods] = useState(MOCK_PODS);

	const isConnected = isClusterConnected(cluster);
	const selectedNamespace =
		clusterViewerState.selectedNamespace ||
		cluster?.defaultNamespace ||
		MOCK_NAMESPACES[0];
	const selectedDeployment =
		clusterViewerState.selectedDeployment || MOCK_DEPLOYMENTS[0];
	const selectedLog =
		MOCK_LOGS.find((entry) => entry.id === selectedLogId) || MOCK_LOGS[0];

	const filteredFields = useMemo(() => {
		const normalizedSearch = fieldSearch.trim().toLowerCase();
		return FIELD_ROWS.filter((field) => {
			if (!normalizedSearch) {
				return true;
			}
			return `${field.name} ${field.type}`
				.toLowerCase()
				.includes(normalizedSearch);
		});
	}, [fieldSearch]);

	const filteredLogs = useMemo(() => {
		return MOCK_LOGS.filter((log) => selectedPods.includes(log.pod)).filter(
			(log) => matchesQuery(log, appliedQuery),
		);
	}, [appliedQuery, selectedPods]);

	const visibleLogs = filteredLogs.slice(0, rowsPerPage);

	const handleApplyQuery = (nextQuery = queryDraft) => {
		setAppliedQuery(nextQuery);
	};

	const appendToQuery = (token) => {
		setQueryDraft(
			(current) => `${current}${current.trim() ? " AND " : ""}${token}`,
		);
	};

	const handleSelectLog = (logId) => {
		setSelectedLogId(logId);
		setIsDetailsOpen(true);
	};

	const togglePod = (pod) => {
		setSelectedPods((current) => {
			if (current.includes(pod)) {
				if (current.length === 1) {
					return current;
				}
				return current.filter((entry) => entry !== pod);
			}
			return [...current, pod];
		});
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col bg-[radial-gradient(circle_at_top,_rgba(15,86,166,0.12),transparent_36rem)] text-foreground">
			<section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/70 bg-card/80 dark:border-white/8 dark:bg-[#08121d]">
				<div className="grid gap-4 border-b border-border/70 px-4 py-4 dark:border-white/8 xl:grid-cols-[14rem_13rem_14rem_minmax(0,1fr)_10.5rem_auto] xl:items-end">
					<DropdownControl
						label="Namespace"
						value={selectedNamespace}
						options={MOCK_NAMESPACES}
						onSelect={(value) =>
							clusterId && setSelectedNamespace(clusterId, value)
						}
					/>
					<DropdownControl
						label="Deployment"
						value={selectedDeployment}
						options={MOCK_DEPLOYMENTS}
						onSelect={(value) =>
							clusterId && setSelectedDeployment(clusterId, value)
						}
					/>
					<PodsDropdown selectedPods={selectedPods} onToggle={togglePod} />
					<DropdownControl
						label="Time Range"
						value={selectedTimeRange}
						options={MOCK_TIME_RANGES}
						onSelect={setSelectedTimeRange}
						icon={CalendarDays}
					/>
					<div className="flex items-end">
						<Button
							className="h-10 w-full rounded-md px-4"
							onClick={() => handleApplyQuery()}
						>
							<RefreshCw className="size-4" />
							Refresh
						</Button>
					</div>
					<div className="flex items-end gap-2">
						<Button
							variant="outline"
							className="h-10 rounded-md border-border/70 bg-background/80 px-4 hover:bg-muted dark:border-white/10 dark:bg-[#091523] dark:hover:bg-[#0d1a2a]"
						>
							<Save className="size-4" />
							Save search
						</Button>
						<IconButton className="size-10 rounded-md">
							<MoreHorizontal className="size-4" />
						</IconButton>
					</div>
				</div>

				<div className="grid min-h-0 flex-1 gap-3 p-3 xl:grid-cols-[15rem_minmax(0,1fr)_minmax(0,23rem)]">
					<aside className="flex min-h-0 flex-col rounded-xl border border-border/70 bg-card/90 p-4 dark:border-white/8 dark:bg-[#0b1622]">
						<div className="flex items-center justify-between gap-3">
							<div className="flex items-center gap-2 text-[1.35rem] font-medium">
								Fields
								<Info className="size-4 text-muted-foreground" />
							</div>
							<IconButton>
								<Settings2 className="size-4" />
							</IconButton>
						</div>

						<div className="relative mt-4">
							<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
							<input
								type="text"
								value={fieldSearch}
								onChange={(event) => setFieldSearch(event.target.value)}
								placeholder="Search fields..."
								className="h-10 w-full rounded-md border border-border/70 bg-background/80 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-white/10 dark:bg-[#091523]"
							/>
						</div>

						<div className="mt-4 min-h-0 flex-1 overflow-auto pr-1">
							{filteredFields.map((field) => (
								<FieldRow
									key={field.name}
									field={field}
									onAdd={appendToQuery}
								/>
							))}
						</div>

						<Button
							variant="outline"
							className="mt-4 h-10 justify-start rounded-md border-border/70 bg-transparent hover:bg-muted dark:border-white/10 dark:hover:bg-white/6"
							onClick={() => appendToQuery("service.name")}
						>
							<Filter className="size-4" />
							Add field filter
						</Button>
					</aside>

					<div className="flex min-h-0 min-w-0 flex-col gap-3 xl:col-span-2">
						<section className="shrink-0 rounded-xl border border-border/70 bg-card/90 p-5 dark:border-white/8 dark:bg-[#0b1622]">
							<div className="relative">
								<label htmlFor="log-query" className="sr-only">
									Search logs
								</label>
								<textarea
									id="log-query"
									value={queryDraft}
									onChange={(event) => setQueryDraft(event.target.value)}
									onKeyDown={(event) => {
										if (
											(event.metaKey || event.ctrlKey) &&
											event.key === "Enter"
										) {
											handleApplyQuery(event.currentTarget.value);
										}
									}}
									placeholder="Search (KQL)"
									rows={2}
									className="min-h-20 w-full resize-y rounded-lg border border-primary/60 bg-background/80 px-4 py-3 pr-24 text-sm leading-6 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 dark:bg-[#091523]"
								/>
								<div className="absolute right-3 top-3 flex items-center gap-2">
									<button
										type="button"
										onClick={() => handleApplyQuery()}
										className="inline-flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
										aria-label="Run search"
									>
										<Search className="size-4" />
									</button>
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
						</section>

						<div
							className={cn(
								"grid min-h-0 min-w-0 flex-1 gap-3",
								isDetailsOpen
									? "grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,23rem)]"
									: "grid-cols-1",
							)}
						>
							<section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-border/70 bg-card/90 dark:border-white/8 dark:bg-[#0b1622]">
								<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3 dark:border-white/8">
									<h2 className="text-[1.7rem] font-medium tracking-tight">
										12,345 results
									</h2>
									<div className="flex items-center gap-2">
										<DropdownControl
											label=""
											value={selectedColumnsPreset}
											options={MOCK_COLUMN_PRESETS}
											onSelect={setSelectedColumnsPreset}
											className="w-34 space-y-0"
										/>
										<IconButton>
											<Columns3 className="size-4" />
										</IconButton>
										<IconButton
											onClick={() => setIsStreaming((current) => !current)}
										>
											{isStreaming ? (
												<Pause className="size-4" />
											) : (
												<Play className="size-4" />
											)}
										</IconButton>
									</div>
								</div>

								<div className="min-h-0 overflow-auto">
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
											{visibleLogs.map((log) => (
												<tr
													key={log.id}
													onClick={() => handleSelectLog(log.id)}
													className={cn(
														"cursor-pointer text-foreground/90 hover:bg-muted/50 dark:hover:bg-white/[0.03]",
														selectedLogId === log.id && isDetailsOpen
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
										</tbody>
									</table>
								</div>

								<div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-muted-foreground">
									<DropdownControl
										label=""
										value={rowsPerPage}
										options={MOCK_PAGE_SIZES}
										onSelect={setRowsPerPage}
										className="w-36 space-y-0"
									/>
									<div className="flex items-center gap-3 text-foreground">
										<button
											type="button"
											className="text-muted-foreground hover:text-foreground"
										>
											<ChevronLeft className="size-4" />
										</button>
										<button
											type="button"
											className="rounded-md border border-primary/60 bg-primary/10 px-3 py-1 text-primary"
										>
											1
										</button>
										<button type="button">2</button>
										<button type="button">3</button>
										<button type="button">4</button>
										<button type="button">5</button>
										<span className="text-muted-foreground">…</span>
										<button type="button">124</button>
										<button
											type="button"
											className="text-muted-foreground hover:text-foreground"
										>
											<ChevronRight className="size-4" />
										</button>
									</div>
								</div>
							</section>

							{isDetailsOpen ? (
								<LogDetailsPanel
									log={selectedLog}
									selectedDetailTab={selectedDetailTab}
									onSelectTab={setSelectedDetailTab}
									onClose={() => setIsDetailsOpen(false)}
								/>
							) : null}
						</div>
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
							Last updated: 10:30:00
						</span>
					</div>

					<div className="flex items-center gap-6">
						<span>Showing: {filteredLogs.length} / 12,345 logs</span>
						<span>Scan completed in 1.2s</span>
						<button
							type="button"
							onClick={() => setIsStreaming((current) => !current)}
							className="inline-flex items-center gap-2 text-emerald-400 hover:text-emerald-300"
						>
							{isStreaming ? (
								<Pause className="size-4" />
							) : (
								<Play className="size-4" />
							)}
							{isStreaming ? "Pause stream" : "Start stream"}
						</button>
					</div>
				</footer>
			</section>
		</div>
	);
}
