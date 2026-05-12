import { createContext, useContext, useEffect, useMemo, useState } from "react";

const THEME_STORAGE_KEY = "os-logexplorer-theme";
const ThemeProviderContext = createContext(null);

function normalizeTheme(theme) {
	return theme === "dark" ? "dark" : "light";
}

function applyTheme(theme) {
	const resolvedTheme = normalizeTheme(theme);
	const root = document.documentElement;

	root.classList.remove("light", "dark");
	root.classList.add(resolvedTheme);
	root.style.colorScheme = resolvedTheme;
}

export function ThemeProvider({ children, defaultTheme = "light" }) {
	const [theme, setThemeState] = useState(() => {
		if (typeof window === "undefined") {
			return normalizeTheme(defaultTheme);
		}

		return normalizeTheme(
			localStorage.getItem(THEME_STORAGE_KEY) || defaultTheme,
		);
	});

	useEffect(() => {
		applyTheme(theme);
	}, [theme]);

	const value = useMemo(
		() => ({
			theme,
			resolvedTheme: theme,
			setTheme: (nextTheme) => {
				const normalizedTheme = normalizeTheme(nextTheme);

				localStorage.setItem(THEME_STORAGE_KEY, normalizedTheme);
				setThemeState(normalizedTheme);
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
