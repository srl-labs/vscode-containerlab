/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/topoViewer/**/*.{ts,tsx,html}",
    "./src/topoViewerEditor/**/*.{ts,tsx,html}"
  ],
  theme: {
    extend: {
      colors: {
        // VSCode theme colors
        'vscode': {
          'bg': 'var(--vscode-editor-background)',
          'fg': 'var(--vscode-editor-foreground)',
          'panel-bg': 'var(--vscode-panel-background)',
          'panel-fg': 'var(--vscode-panel-foreground)',
          'sidebar-bg': 'var(--vscode-sideBar-background)',
          'sidebar-fg': 'var(--vscode-sideBar-foreground)',
          'button-bg': 'var(--vscode-button-background)',
          'button-fg': 'var(--vscode-button-foreground)',
          'button-hover': 'var(--vscode-button-hoverBackground)',
          'input-bg': 'var(--vscode-input-background)',
          'input-fg': 'var(--vscode-input-foreground)',
          'input-border': 'var(--vscode-input-border)',
          'dropdown-bg': 'var(--vscode-dropdown-background)',
          'dropdown-fg': 'var(--vscode-dropdown-foreground)',
          'dropdown-border': 'var(--vscode-dropdown-border)',
          'link': 'var(--vscode-textLink-foreground)',
          'link-hover': 'var(--vscode-textLink-activeForeground)',
        },
        // Dark theme colors (matching VSCode dark theme)
        'dark': {
          'navbar': 'rgb(24, 24, 24)',
          'panel': 'rgb(40, 40, 40)',
          'border': '#363636',
          'text': '#ffffff',
          'text-muted': '#b5b5b5'
        },
        // Light theme colors (matching VSCode light theme)
        'light': {
          'navbar': 'rgb(70, 86, 246)',
          'panel': '#ffffff',
          'border': '#dbdbdb',
          'text': '#000000',
          'text-muted': '#4a4a4a'
        }
      },
      fontSize: {
        'xxs': '0.625rem', // 10px
        'xs': '0.75rem',   // 12px
        'sm': '0.875rem',  // 14px
        'base': '1rem',    // 16px
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      },
      boxShadow: {
        'panel': '0 8px 24px rgba(0, 0, 0, 0.15)',
        'panel-dark': '0 8px 24px rgba(0, 0, 0, 0.3)',
        'navbar': '0px 3px 6px rgba(0, 0, 0, 0.1)',
        'navbar-dark': '0px 3px 6px rgba(0, 0, 0, 0.4)',
      },
      zIndex: {
        '9': '9',
        '99': '99',
        '999': '999',
        '9999': '9999',
        '99999': '99999'
      }
    },
  },
  darkMode: ['class', '[data-theme="dark"]'],
  plugins: [],
}