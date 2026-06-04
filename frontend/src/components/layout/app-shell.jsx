import { cn } from "@/lib/utils";

export function AppShell({ children, className }) {
	return (
		<div
			className={cn(
				"h-dvh overflow-hidden bg-background text-foreground",
				"bg-[radial-gradient(circle_at_top_left,var(--surface-glow),transparent_32rem)]",
				className,
			)}
		>
			<div className="flex h-dvh min-h-0 flex-col overflow-hidden">
				{children}
			</div>
		</div>
	);
}

export function PageContainer({ children, className }) {
	return (
		<div
			className={cn(
				"mx-auto flex min-h-0 w-full max-w-[96rem] flex-1 flex-col gap-3 overflow-hidden px-4 py-3 sm:px-6 lg:px-8",
				className,
			)}
		>
			{children}
		</div>
	);
}

export function ContentLayout({ children, className }) {
	return (
		<main className={cn("flex flex-1 flex-col gap-3", className)}>
			{children}
		</main>
	);
}

export function ToolbarContainer({ children, className, as: Comp = "div" }) {
	return (
		<Comp
			className={cn(
				"rounded-xl border border-toolbar-border bg-toolbar/85 p-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-toolbar/70",
				className,
			)}
		>
			{children}
		</Comp>
	);
}

export function Panel({ children, className, as: Comp = "section" }) {
	return (
		<Comp
			className={cn(
				"rounded-lg border border-border/80 bg-card/80 p-3 text-card-foreground shadow-sm sm:p-4",
				className,
			)}
		>
			{children}
		</Comp>
	);
}

export function SectionHeader({ title, description, actions, className }) {
	return (
		<div
			className={cn(
				"flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
				className,
			)}
		>
			<div className="min-w-0">
				<h2 className="text-base font-semibold tracking-tight text-foreground">
					{title}
				</h2>
				{description && (
					<p className="mt-1 text-sm text-muted-foreground">{description}</p>
				)}
			</div>
			{actions && (
				<div className="flex shrink-0 items-center gap-2">{actions}</div>
			)}
		</div>
	);
}
