import { createContext, useContext, useEffect, useMemo, useState } from "react";

const THEME_STORAGE_KEY = "os-logexplorer-theme";
const ThemeProviderContext = createContext(null);

function getSystemTheme() {
	if (typeof window === "undefined") {
		return "light";
	}

	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

function applyTheme(theme) {
	const resolvedTheme = theme === "system" ? getSystemTheme() : theme;
	const root = document.documentElement;

	root.classList.remove("light", "dark");
	root.classList.add(resolvedTheme);
	root.style.colorScheme = resolvedTheme;
}

export function ThemeProvider({ children, defaultTheme = "system" }) {
	const [theme, setThemeState] = useState(() => {
		if (typeof window === "undefined") {
			return defaultTheme;
		}

		return localStorage.getItem(THEME_STORAGE_KEY) || defaultTheme;
	});

	useEffect(() => {
		applyTheme(theme);
	}, [theme]);

	useEffect(() => {
		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
		const handleSystemThemeChange = () => {
			if (theme === "system") {
				applyTheme("system");
			}
		};

		mediaQuery.addEventListener("change", handleSystemThemeChange);

		return () =>
			mediaQuery.removeEventListener("change", handleSystemThemeChange);
	}, [theme]);

	const value = useMemo(
		() => ({
			theme,
			resolvedTheme: theme === "system" ? getSystemTheme() : theme,
			setTheme: (nextTheme) => {
				localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
				setThemeState(nextTheme);
			},
		}),
		[theme],
	);

	return (
		<ThemeProviderContext.Provider value={value}>
			{children}
		</ThemeProviderContext.Provider>
	);
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
	const context = useContext(ThemeProviderContext);

	if (!context) {
		throw new Error("useTheme must be used within ThemeProvider");
	}

	return context;
}
