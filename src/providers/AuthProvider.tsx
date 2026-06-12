// ============================================================
// Auth Provider - MSAL + Demo Mode Authentication
// ============================================================

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useMsal, useIsAuthenticated } from '@azure/msal-react';
import { InteractionRequiredAuthError, type AccountInfo } from '@azure/msal-browser';
import { loginRequest, azureTokenRequest, isDemoMode } from '../config/authConfig';
import type { User, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isDemoMode: boolean;
  login: (demoRole?: UserRole) => Promise<void>;
  logout: () => void;
  getAzureToken: () => Promise<string | null>;
  switchDemoRole: (role: UserRole) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Demo user profiles
const demoUsers: Record<UserRole, User> = {
  OWNER: {
    id: 'demo-owner-001',
    email: 'owner@cloudops-demo.com',
    displayName: 'Alex Thompson',
    role: 'OWNER',
    organizationId: 'demo-org-001',
    entraObjectId: 'demo-oid-owner',
    lastLogin: new Date().toISOString(),
  },
  ADMIN: {
    id: 'demo-admin-001',
    email: 'admin@cloudops-demo.com',
    displayName: 'Sarah Mitchell',
    role: 'ADMIN',
    organizationId: 'demo-org-001',
    entraObjectId: 'demo-oid-admin',
    lastLogin: new Date().toISOString(),
  },
  OPERATOR: {
    id: 'demo-operator-001',
    email: 'ops@cloudops-demo.com',
    displayName: 'David Chen',
    role: 'OPERATOR',
    organizationId: 'demo-org-001',
    entraObjectId: 'demo-oid-operator',
    lastLogin: new Date().toISOString(),
  },
  VIEWER: {
    id: 'demo-viewer-001',
    email: 'viewer@cloudops-demo.com',
    displayName: 'Emily Rivera',
    role: 'VIEWER',
    organizationId: 'demo-org-001',
    entraObjectId: 'demo-oid-viewer',
    lastLogin: new Date().toISOString(),
  },
  AUDITOR: {
    id: 'demo-auditor-001',
    email: 'auditor@cloudops-demo.com',
    displayName: 'Michael Park',
    role: 'AUDITOR',
    organizationId: 'demo-org-001',
    entraObjectId: 'demo-oid-auditor',
    lastLogin: new Date().toISOString(),
  },
};

function mapAccountToUser(account: AccountInfo): User {
  const roles = (account.idTokenClaims?.roles as string[] | undefined) || [];
  let role: UserRole = 'VIEWER';
  if (roles.includes('Platform.Owner')) role = 'OWNER';
  else if (roles.includes('Platform.Admin')) role = 'ADMIN';
  else if (roles.includes('Platform.Operator')) role = 'OPERATOR';
  else if (roles.includes('Platform.Auditor')) role = 'AUDITOR';

  return {
    id: account.localAccountId || account.homeAccountId,
    email: account.username,
    displayName: account.name || account.username,
    role,
    organizationId: account.tenantId || '',
    entraObjectId: account.localAccountId || '',
    lastLogin: new Date().toISOString(),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { instance, accounts } = useMsal();
  const msalAuthenticated = useIsAuthenticated();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [demoAuthenticated, setDemoAuthenticated] = useState(false);

  const isAuthenticated = isDemoMode ? demoAuthenticated : msalAuthenticated;

  // Restore session on mount
  useEffect(() => {
    if (isDemoMode) {
      const savedRole = sessionStorage.getItem('cloudops-demo-role') as UserRole | null;
      if (savedRole && demoUsers[savedRole]) {
        setUser(demoUsers[savedRole]);
        setDemoAuthenticated(true);
      }
      setIsLoading(false);
    } else if (accounts.length > 0) {
      setUser(mapAccountToUser(accounts[0]));
      setIsLoading(false);
    } else {
      setIsLoading(false);
    }
  }, [accounts]);

  const login = useCallback(async (demoRole?: UserRole) => {
    setIsLoading(true);
    try {
      if (isDemoMode) {
        const role = demoRole || 'ADMIN';
        setUser(demoUsers[role]);
        setDemoAuthenticated(true);
        sessionStorage.setItem('cloudops-demo-role', role);
      } else {
        const result = await instance.loginPopup(loginRequest);
        if (result.account) {
          instance.setActiveAccount(result.account);
          setUser(mapAccountToUser(result.account));
        }
      }
    } catch (error) {
      console.error('Login failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [instance]);

  const logout = useCallback(() => {
    if (isDemoMode) {
      setUser(null);
      setDemoAuthenticated(false);
      sessionStorage.removeItem('cloudops-demo-role');
    } else {
      instance.logoutPopup();
      setUser(null);
    }
  }, [instance]);

  const switchDemoRole = useCallback((role: UserRole) => {
    if (isDemoMode) {
      setUser(demoUsers[role]);
      sessionStorage.setItem('cloudops-demo-role', role);
    }
  }, []);

  const getAzureToken = useCallback(async (): Promise<string | null> => {
    if (isDemoMode) return 'demo-token-' + (user?.role?.toLowerCase() || 'admin');

    try {
      const account = instance.getActiveAccount();
      if (!account) return null;

      const response = await instance.acquireTokenSilent({
        ...azureTokenRequest,
        account,
      });
      return response.accessToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        try {
          const response = await instance.acquireTokenPopup(azureTokenRequest);
          return response.accessToken;
        } catch (popupError) {
          console.error('Token acquisition failed:', popupError);
          return null;
        }
      }
      console.error('Silent token acquisition failed:', error);
      return null;
    }
  }, [instance, user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        isDemoMode,
        login,
        logout,
        getAzureToken,
        switchDemoRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
