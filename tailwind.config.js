/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["src/**/*.{html,ts,css}", "html/**/*.{html,ts,css}"],
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                white: "rgb(221, 221, 221)",
                black: "rgb(34, 34, 34)",
                background: "var(--background)",
                accent: "var(--accent)",
                "accent-dark": "var(--accent-dark)",
                primary: "var(--primary)",
                "primary-dark": "var(--primary-dark)",
                "primary-fg": "var(--primary-fg)",
                secondary: "var(--secondary)",
                "secondary-fg": "var(--secondary-fg)",
                hinted: "var(--hinted)",
                "hinted-fg": "var(--hinted-fg)",
                muted: "var(--muted)",
                "muted-fg": "var(--muted-fg)",
                input: "var(--input)",
                divider: "var(--divider)",
                primarysw: {
                    50: "#eff5ff",
                    100: "#dbe8fe",
                    200: "#bfd7fe",
                    300: "#93bbfd",
                    400: "#609afa",
                    500: "#3b82f6",
                    600: "#2570eb",
                    700: "#1d64d8",
                    800: "#1e55af",
                    900: "#1e478a",
                    950: "#172e54",
                },
            },
            screens: {
                pwa: { raw: "(display-mode: standalone)" },
            },
            overflow: {
                "x-clip": "clip",
            },
            lineClamp: {
                8: "8",
                16: "16",
            },
        },
    },
    plugins: [require("tailwindcss-animated")],
};
