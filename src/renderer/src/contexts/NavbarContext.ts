import { ReactNode, createContext } from 'react'

export interface Action {
  label?: string
  icon?: string
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  disabled?: boolean
  isSeparator?: boolean
}

export interface NavbarContextType {
  navActions: Action[]
  setNavActions: (actions: Action[]) => void
  title: string | null
  setTitle: (title: string | null) => void
  customContent: ReactNode | null
  setCustomContent: (content: ReactNode | null) => void
}

export const NavbarContext = createContext<NavbarContextType | undefined>(undefined)
