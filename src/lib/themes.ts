// Feishin rebuild — theme engine.
// Faithful port of feishin's default dark palette (mantine darkColors) + built-in themes.
export interface ThemeVars {
  bg: string; // --mantine-color-body (dark9)
  bgAlt: string; // sidebar background
  elevated: string; // dark8 — cards, inputs
  hover: string; // dark6
  border: string;
  fg: string; // text
  fgDim: string; // muted text
  primary: string;
  primaryContrast: string;
  star: string;
}

export interface AppThemeDef {
  id: string;
  label: string;
  mode: "dark" | "light";
  vars: ThemeVars;
}

// feishin default dark palette: ['#C9C9C9','#b8b8b8','#828282','#696969','#424242','#3b3b3b','#242424','#181818','#1f1f21','#141414']
// primary: rgb(53, 116, 252), primaryShade dark: 5
export const THEMES: AppThemeDef[] = [
  {
    id: "defaultDark",
    label: "Default Dark",
    mode: "dark",
    vars: {
      bg: "#141414",
      bgAlt: "#181818",
      elevated: "#1f1f21",
      hover: "#242424",
      border: "rgba(255,255,255,0.10)",
      fg: "#C9C9C9",
      fgDim: "#828282",
      primary: "#3774fc",
      primaryContrast: "#ffffff",
      star: "#F08C00",
    },
  },
  {
    id: "defaultLight",
    label: "Default Light",
    mode: "light",
    vars: {
      bg: "#ffffff",
      bgAlt: "#f7f7f7",
      elevated: "#f1f1f1",
      hover: "#e9e9e9",
      border: "rgba(0,0,0,0.08)",
      fg: "#313131",
      fgDim: "#828282",
      primary: "#3774fc",
      primaryContrast: "#ffffff",
      star: "#F08C00",
    },
  },
  {
    id: "nord",
    label: "Nord",
    mode: "dark",
    vars: {
      bg: "#2E3440",
      bgAlt: "#292E39",
      elevated: "#3B4252",
      hover: "#434C5E",
      border: "rgba(255,255,255,0.10)",
      fg: "#ECEFF4",
      fgDim: "#7b88a1",
      primary: "#88C0D0",
      primaryContrast: "#2E3440",
      star: "#EBCB8B",
    },
  },
  {
    id: "dracula",
    label: "Dracula",
    mode: "dark",
    vars: {
      bg: "#282A36",
      bgAlt: "#24252f",
      elevated: "#343746",
      hover: "#3d4052",
      border: "rgba(255,255,255,0.10)",
      fg: "#F8F8F2",
      fgDim: "#6272a4",
      primary: "#BD93F9",
      primaryContrast: "#282A36",
      star: "#F1FA8C",
    },
  },
  {
    id: "oneDark",
    label: "One Dark",
    mode: "dark",
    vars: {
      bg: "#282C34",
      bgAlt: "#242933",
      elevated: "#2F343E",
      hover: "#3A3F4B",
      border: "rgba(255,255,255,0.10)",
      fg: "#DCDFE4",
      fgDim: "#7f8798",
      primary: "#61AFEF",
      primaryContrast: "#282C34",
      star: "#E5C07B",
    },
  },
  {
    id: "catppuccinMocha",
    label: "Catppuccin Mocha",
    mode: "dark",
    vars: {
      bg: "#1E1E2E",
      bgAlt: "#181825",
      elevated: "#313244",
      hover: "#3a3b4e",
      border: "rgba(255,255,255,0.09)",
      fg: "#CDD6F4",
      fgDim: "#7f849c",
      primary: "#89B4FA",
      primaryContrast: "#1E1E2E",
      star: "#F9E2AF",
    },
  },
  {
    id: "gruvboxDark",
    label: "Gruvbox Dark",
    mode: "dark",
    vars: {
      bg: "#282828",
      bgAlt: "#222222",
      elevated: "#3C3836",
      hover: "#45403d",
      border: "rgba(255,255,255,0.10)",
      fg: "#EBDBB2",
      fgDim: "#928374",
      primary: "#FE8019",
      primaryContrast: "#282828",
      star: "#FABD2F",
    },
  },
  {
    id: "tokyoNight",
    label: "Tokyo Night",
    mode: "dark",
    vars: {
      bg: "#1A1B26",
      bgAlt: "#16161E",
      elevated: "#24283B",
      hover: "#2f334d",
      border: "rgba(255,255,255,0.09)",
      fg: "#A9B1D6",
      fgDim: "#565f89",
      primary: "#7AA2F7",
      primaryContrast: "#1A1B26",
      star: "#E0AF68",
    },
  },
  {
    id: "monokai",
    label: "Monokai",
    mode: "dark",
    vars: {
      bg: "#272822",
      bgAlt: "#212219",
      elevated: "#33342c",
      hover: "#3e3f36",
      border: "rgba(255,255,255,0.10)",
      fg: "#F8F8F2",
      fgDim: "#90917f",
      primary: "#A6E22E",
      primaryContrast: "#272822",
      star: "#E6DB74",
    },
  },
  {
    id: "glassyDark",
    label: "Glassy Dark",
    mode: "dark",
    vars: {
      bg: "#0f0f10",
      bgAlt: "#0c0c0d",
      elevated: "#1a1a1c",
      hover: "#242426",
      border: "rgba(255,255,255,0.12)",
      fg: "#eaeaea",
      fgDim: "#7a7a7d",
      primary: "#7ee0c3",
      primaryContrast: "#0f0f10",
      star: "#F08C00",
    },
  },
];

export const DEFAULT_THEME = "defaultDark";

export function getTheme(id: string): AppThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function applyTheme(id: string, accent?: string | null) {
  const theme = getTheme(id);
  const root = document.documentElement;
  const v = theme.vars;
  root.style.setProperty("--bg", v.bg);
  root.style.setProperty("--bg-alt", v.bgAlt);
  root.style.setProperty("--elevated", v.elevated);
  root.style.setProperty("--hover", v.hover);
  root.style.setProperty("--border", v.border);
  root.style.setProperty("--fg", v.fg);
  root.style.setProperty("--fg-dim", v.fgDim);
  root.style.setProperty("--primary", accent || v.primary);
  root.style.setProperty("--primary-contrast", v.primaryContrast);
  root.style.setProperty("--star", v.star);
  root.setAttribute("data-theme", theme.id);
  root.setAttribute("data-mode", theme.mode);
  root.style.colorScheme = theme.mode;
}
