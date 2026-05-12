import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";

const themeOptions = [
	{ value: "light", label: "Light", icon: Sun },
	{ value: "dark", label: "Dark", icon: Moon },
];

export function ThemeToggle() {
	const { setTheme, theme } = useTheme();
	const nextTheme = theme === "dark" ? "light" : "dark";
	const nextThemeOption = themeOptions.find(
		(option) => option.value === nextTheme,
	);
	const NextIcon = nextThemeOption?.icon || Sun;

	return (
		<Button
			type="button"
			variant="outline"
			size="sm"
			onClick={() => setTheme(nextTheme)}
			aria-label={`Switch to ${nextThemeOption?.label || "Light"} mode`}
			className="gap-2"
		>
			<NextIcon aria-hidden="true" className="size-4" />
			<span className="hidden sm:inline">
				{nextThemeOption?.label || "Light"}
			</span>
		</Button>
	);
}
