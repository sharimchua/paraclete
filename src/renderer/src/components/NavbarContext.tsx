import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Action } from './StandardNavbar';

interface NavbarContextType {
    navActions: Action[];
    setNavActions: (actions: Action[]) => void;
    title: string | null;
    setTitle: (title: string | null) => void;
    customContent: ReactNode | null;
    setCustomContent: (content: ReactNode | null) => void;
}

const NavbarContext = createContext<NavbarContextType | undefined>(undefined);

export const NavbarProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [navActions, setNavActions] = useState<Action[]>([]);
    const [title, setTitle] = useState<string | null>(null);
    const [customContent, setCustomContent] = useState<ReactNode | null>(null);

    return (
        <NavbarContext.Provider value={{ navActions, setNavActions, title, setTitle, customContent, setCustomContent }}>
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
