// ============================================================
// MSAL PublicClientApplication Singleton
// ============================================================

import { PublicClientApplication, EventType } from '@azure/msal-browser';
import { msalConfig } from './authConfig';

/**
 * MSAL instance must be created before the app renders.
 * It is passed to MsalProvider in main.tsx.
 */
export const msalInstance = new PublicClientApplication(msalConfig);

// Set the first account as active if one exists (returning user)
const accounts = msalInstance.getAllAccounts();
if (accounts.length > 0) {
  msalInstance.setActiveAccount(accounts[0]);
}

// Listen for sign-in events and set the active account
msalInstance.addEventCallback((event) => {
  if (
    event.eventType === EventType.LOGIN_SUCCESS &&
    event.payload &&
    'account' in event.payload &&
    event.payload.account
  ) {
    msalInstance.setActiveAccount(event.payload.account);
  }
});
