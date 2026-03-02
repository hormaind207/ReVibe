'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

export const COLOR_THEMES = [
  { id: 'purple', label: '보라', color: '#b19cd9', emoji: '💜' },
  { id: 'blue', label: '파랑', color: '#6b9de8', emoji: '💙' },
  { id: 'green', label: '초록', color: '#5db87a', emoji: '💚' },
  { id: 'pink', label: '분홍', color: '#e87aaa', emoji: '🩷' },
  { id: 'orange', label: '주황', color: '#e87a3a', emoji: '🧡' },
  { id: 'carat', label: '캐럿', color: '#F7CAC9', emoji: '💗', gradient: ['#F7CAC9', '#92A9D1'] as const },
] as const

export type ColorThemeId = typeof COLOR_THEMES[number]['id']

const COLOR_THEME_KEY = 'color-theme'

interface ColorThemeContextType {
  colorTheme: ColorThemeId
  setColorTheme: (theme: ColorThemeId) => void
}

const ColorThemeContext = createContext<ColorThemeContextType>({
  colorTheme: 'purple',
  setColorTheme: () => {},
})

export function ColorThemeProvider({ children }: { children: ReactNode }) {
  const [colorTheme, setColorThemeState] = useState<ColorThemeId>('purple')

  useEffect(() => {
    const saved = localStorage.getItem(COLOR_THEME_KEY) as ColorThemeId | null
    if (saved && COLOR_THEMES.some(t => t.id === saved)) {
      applyColorTheme(saved)
      setColorThemeState(saved)
    }
  }, [])

  const setColorTheme = useCallback((theme: ColorThemeId) => {
    localStorage.setItem(COLOR_THEME_KEY, theme)
    applyColorTheme(theme)
    setColorThemeState(theme)
  }, [])

  return (
    <ColorThemeContext.Provider value={{ colorTheme, setColorTheme }}>
      {children}
    </ColorThemeContext.Provider>
  )
}

function applyColorTheme(theme: ColorThemeId) {
  const html = document.documentElement
  // Remove all existing theme classes
  COLOR_THEMES.forEach(t => {
    if (t.id !== 'purple') html.classList.remove(`theme-${t.id}`)
  })
  // Apply new theme (purple is default, no class needed)
  if (theme !== 'purple') {
    html.classList.add(`theme-${theme}`)
  }
}

export function useColorTheme() {
  return useContext(ColorThemeContext)
}
