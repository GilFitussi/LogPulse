import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";

const themeOptions = [
	{ value: "light", label: "Light", icon: Sun },
	{ value: "dark", label: "Dark", icon: Moon },
	{ value: "system", label: "System", icon: Monitor },
];

export function ThemeToggle() {
	const { setTheme, theme } = useTheme();
	const activeTheme = themeOptions.find((option) => option.value === theme);
	const ActiveIcon = activeTheme?.icon || Monitor;

	const nextTheme =
		theme === "light" ? "dark" : theme === "dark" ? "system" : "light";

	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			onClick={() => setTheme(nextTheme)}
			aria-label={`Switch theme. Current theme: ${activeTheme?.label || "System"}`}
			className="gap-2"
		>
			<ActiveIcon aria-hidden="true" className="size-4" />
			<span className="hidden sm:inline">{activeTheme?.label || "System"}</span>
		</Button>
	);
}
