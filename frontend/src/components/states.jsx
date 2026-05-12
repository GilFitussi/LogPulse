import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export function EmptyState({ title = "No data", description, className }) {
	return (
		<div
			className={cn(
				"rounded-lg border border-dashed border-border bg-muted/40 p-6 text-center",
				className,
			)}
		>
			<p className="text-sm font-medium text-foreground">{title}</p>
			{description && (
				<p className="mt-1 text-sm text-muted-foreground">{description}</p>
			)}
		</div>
	);
}

export function LoadingState({ label = "Loading", className }) {
	return (
		<div
			className={cn(
				"flex items-center gap-2 text-sm text-muted-foreground",
				className,
			)}
			role="status"
		>
			<Loader2 className="size-4 animate-spin" aria-hidden="true" />
			<span>{label}</span>
		</div>
	);
}
