// ============================================================
// MSAL Authentication Configuration
// Microsoft Entra ID OAuth 2.0 / OpenID Connect
// ============================================================

import { LogLevel } from '@azure/msal-browser';
import type { Configuration, PopupRequest } from '@azure/msal-browser';

/**
 * MSAL configuration for the Cloud Management Platform.
 * 
 * To configure for your tenant:
 * 1. Register an app in Microsoft Entra ID → App Registrations
 * 2. Set Redirect URI to http://localhost:5173 (dev) and your production URL
 * 3. Add API permissions: Azure Service Management → user_impersonation
 * 4. Set the environment variables below
 */

const clientId = import.meta.env.VITE_AZURE_CLIENT_ID || 'YOUR_CLIENT_ID';
const tenantId = import.meta.env.VITE_AZURE_TENANT_ID || 'common';
const redirectUri = import.meta.env.VITE_REDIRECT_URI || window.location.origin;

export const msalConfig: Configuration = {
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    redirectUri,
    postLogoutRedirectUri: redirectUri,
  },
  cache: {
    cacheLocation: 'localStorage',
  },
  system: {
    loggerOptions: {
      loggerCallback: (level: LogLevel, message: string, containsPii: boolean) => {
        if (containsPii) return;
        switch (level) {
          case LogLevel.Error:
            console.error('[MSAL]', message);
            break;
          case LogLevel.Warning:
            console.warn('[MSAL]', message);
            break;
          case LogLevel.Info:
            // console.info('[MSAL]', message);
            break;
          case LogLevel.Verbose:
            // console.debug('[MSAL]', message);
            break;
        }
      },
      logLevel: LogLevel.Warning,
      piiLoggingEnabled: false,
    },
  },
};

// Scopes for Azure Management API access
export const azureManagementScopes = [
  'https://management.azure.com/user_impersonation',
];

// Scopes for Microsoft Graph (user profile, photo)
export const graphScopes = [
  'User.Read',
  'openid',
  'profile',
  'email',
];

// Login request configuration
export const loginRequest: PopupRequest = {
  scopes: [...graphScopes],
  prompt: 'select_account',
};

// Token request for Azure Management API
export const azureTokenRequest = {
  scopes: azureManagementScopes,
};

// Token request for Microsoft Graph
export const graphTokenRequest = {
  scopes: graphScopes,
};

// App roles defined in the Entra ID App Registration manifest
export const appRoles = {
  OWNER: 'Platform.Owner',
  ADMIN: 'Platform.Admin',
  OPERATOR: 'Platform.Operator',
  VIEWER: 'Platform.Viewer',
  AUDITOR: 'Platform.Auditor',
} as const;

// Check if running in demo mode (no real Azure client ID configured)
export const isDemoMode = !import.meta.env.VITE_AZURE_CLIENT_ID || clientId === 'YOUR_CLIENT_ID';
