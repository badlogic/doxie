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
                    50: "#fdf8ed",
                    100: "#f7ebce",
                    200: "#efd598",
                    300: "#e7bb62",
                    400: "#e1a43e",
                    500: "#cc7d24",
                    600: "#c0651f",
                    700: "#9f491e",
                    800: "#823a1e",
                    900: "#6b301c",
                    950: "#3d170b",
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
