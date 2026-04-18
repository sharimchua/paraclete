import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Action } from './StandardNavbar';

interface NavbarContextType {
    navActions: Action[];
    setNavActions: (actions: Action[]) => void;
}

const NavbarContext = createContext<NavbarContextType | undefined>(undefined);

export const NavbarProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [navActions, setNavActions] = useState<Action[]>([]);

    return (
        <NavbarContext.Provider value={{ navActions, setNavActions }}>
            {children}
        </NavbarContext.Provider>
    );
};

export const useNavbar = () => {
    const context = useContext(NavbarContext);
    if (context === undefined) {
        throw new Error('useNavbar must be used within a NavbarProvider');
    }
    return context;
};
