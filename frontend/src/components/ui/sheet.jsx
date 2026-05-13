import { X } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Sheet({ children, ...props }) {
	return <Dialog.Root {...props}>{children}</Dialog.Root>;
}

export function SheetContent({ children, className, title, description }) {
	return (
		<Dialog.Portal>
			<Dialog.Overlay className="fixed inset-0 z-40 bg-background/45 backdrop-blur-[1px]" />
			<Dialog.Content
				className={cn(
					"fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col border-l border-border bg-card text-card-foreground shadow-xl outline-none sm:max-w-2xl",
					className,
				)}
			>
				<div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
					<div className="min-w-0">
						<Dialog.Title className="text-sm font-semibold text-foreground">
							{title}
						</Dialog.Title>
						{description && (
							<Dialog.Description className="mt-1 text-xs text-muted-foreground">
								{description}
							</Dialog.Description>
						)}
					</div>
					<Dialog.Close asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label="Close log details"
						>
							<X className="size-4" aria-hidden="true" />
						</Button>
					</Dialog.Close>
				</div>
				<div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
			</Dialog.Content>
		</Dialog.Portal>
	);
}
