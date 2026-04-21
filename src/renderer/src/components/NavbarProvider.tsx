import React, { useState, ReactNode } from 'react'
import { NavbarContext, Action } from '../contexts/NavbarContext'

export const NavbarProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [navActions, setNavActions] = useState<Action[]>([])
  const [title, setTitle] = useState<string | null>(null)
  const [customContent, setCustomContent] = useState<ReactNode | null>(null)

  return (
    <NavbarContext.Provider
      value={{ navActions, setNavActions, title, setTitle, customContent, setCustomContent }}
    >
      {children}
    </NavbarContext.Provider>
  )
}
