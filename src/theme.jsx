import React, { createContext, useContext, useEffect, useState } from 'react'

// Theme tokens. Structural/chrome colors (backgrounds, borders, text) swap
// fully between light/dark. Semantic colors (road green/blue/orange, warning
// red, selection highlight) stay close to their original hue in both themes
// so they keep meaning what they mean, just tuned for legibility against a
// dark canvas (slightly brighter so they don't go muddy on near-black).
const LIGHT = {
  mode: 'light',
  bg: '#ffffff',
  bgAlt: '#fafafa',
  panelBg: '#ffffff',
  cardBg: '#f7f7f7',
  canvasBg: '#fafafa',
  viewerBg: '#1a1a22',   // 3D viewer stays dark in both themes (matches the grid/lighting)
  border: '#dddddd',
  borderSoft: '#eeeeee',
  borderStrong: '#cccccc',
  text: '#222222',
  textMuted: '#555555',
  textFaint: '#888888',
  textFainter: '#999999',
  hint: '#aaaaaa',

  accent: '#3366cc',
  accentBg: '#eaf1ff',
  accentText: '#3366cc',

  danger: '#cc3333',
  dangerBg: '#fff5f5',
  dangerBorder: '#ee9999',

  success: '#228866',

  // road / editor semantic colors
  roadGreen: '#4a4',
  roadBlue: '#39c',
  roadOrange: '#f90',
  roadYellow: '#fc0',
  roadYellowBorder: '#c80',
  junctionMagenta: '#e60cc8',
  junctionMagentaSoft: '#f06ee0',
  highwayHandle: '#e80',
  highwayHandleActive: '#d60',
  highwayText: '#c60',
  boardEdge: '#aaaaaa',
  boardEdgeLocked: '#93f',
  boardEdgeError: '#e33',
  wireColors: ['#e33', '#39c', '#2a7', '#b5a', '#f80', '#06b', '#a53', '#696'],
};

const DARK = {
  mode: 'dark',
  bg: '#14161a',
  bgAlt: '#1b1e23',
  panelBg: '#1b1e23',
  cardBg: '#23262c',
  canvasBg: '#1b1e23',
  viewerBg: '#111318',
  border: '#33373f',
  borderSoft: '#2a2d33',
  borderStrong: '#40444d',
  text: '#e8e8ea',
  textMuted: '#b7bac0',
  textFaint: '#9a9ea6',
  textFainter: '#82868d',
  hint: '#6b6f77',

  accent: '#6e9eff',
  accentBg: '#223154',
  accentText: '#a9c4ff',

  danger: '#ff6b6b',
  dangerBg: '#3a2222',
  dangerBorder: '#7a3a3a',

  success: '#4fd19a',

  roadGreen: '#5fcf5f',
  roadBlue: '#5bb6f7',
  roadOrange: '#ffb648',
  roadYellow: '#ffd84a',
  roadYellowBorder: '#e0a500',
  junctionMagenta: '#ff5fe0',
  junctionMagentaSoft: '#c050a8',
  highwayHandle: '#ffb648',
  highwayHandleActive: '#ffd080',
  highwayText: '#ffb648',
  boardEdge: '#777b84',
  boardEdgeLocked: '#b79aff',
  boardEdgeError: '#ff6b6b',
  wireColors: ['#ff6b6b', '#5bb6f7', '#5fcf8f', '#d98fe0', '#ffac5c', '#6fa8ff', '#d4a373', '#9fd98f'],
};

const ThemeContext = createContext(LIGHT);
const STORAGE_KEY = 'groove-theme';

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light' }
    catch { return 'light' }
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, mode) } catch {}
  }, [mode]);
  const theme = mode === 'dark' ? DARK : LIGHT;
  const toggle = () => setMode(m => m === 'dark' ? 'light' : 'dark');
  return (
    <ThemeContext.Provider value={{ ...theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
