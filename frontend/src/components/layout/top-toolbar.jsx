import { Activity } from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function TopToolbar() {
	return (
		<header className="sticky top-0 z-30 border-b border-toolbar-border/80 bg-toolbar/95 backdrop-blur supports-[backdrop-filter]:bg-toolbar/80">
			<div className="mx-auto flex h-12 w-full max-w-[96rem] items-center justify-between gap-2 px-3 sm:px-4 lg:px-6">
				<div className="flex min-w-0 items-center gap-2">
					<div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/15">
						<Activity className="size-4.5" aria-hidden="true" />
					</div>
					<h1 className="truncate text-sm font-semibold tracking-tight text-foreground">
						OS-LogPulse
					</h1>
				</div>

				<div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
					<ThemeToggle />
				</div>
			</div>
		</header>
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
