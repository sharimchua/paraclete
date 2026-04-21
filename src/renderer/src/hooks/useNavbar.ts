import { useContext } from 'react'
import { NavbarContext, NavbarContextType } from '../contexts/NavbarContext'
export { type NavbarContextType, type Action } from '../contexts/NavbarContext'

export const useNavbar = (): NavbarContextType => {
  const context = useContext(NavbarContext)
  if (context === undefined) {
    throw new Error('useNavbar must be used within a NavbarProvider')
  }
  return context
}
