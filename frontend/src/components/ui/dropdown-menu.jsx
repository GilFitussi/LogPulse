import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

// eslint-disable-next-line react-refresh/only-export-components
export const DropdownMenu = DropdownMenuPrimitive.Root;
// eslint-disable-next-line react-refresh/only-export-components
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export function DropdownMenuContent({ className, align = "end", ...props }) {
	return (
		<DropdownMenuPrimitive.Portal>
			<DropdownMenuPrimitive.Content
				align={align}
				sideOffset={6}
				className={cn(
					"z-50 min-w-40 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none",
					className,
				)}
				{...props}
			/>
		</DropdownMenuPrimitive.Portal>
	);
}

export function DropdownMenuItem({ className, ...props }) {
	return (
		<DropdownMenuPrimitive.Item
			className={cn(
				"flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none transition-colors focus:bg-muted disabled:pointer-events-none disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
}
