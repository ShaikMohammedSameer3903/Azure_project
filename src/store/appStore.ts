// ============================================================
// Global State Management - Zustand Store
// ============================================================

import { create } from 'zustand';
import type {
  AzureSubscription,
  AzureResource,
  Incident,
  Notification,
  AiMessage,
  CostSummary,
  SecurityScore,
  BackupHealth,
  AdvisorRecommendation,
  ResourceMetrics,
  ResourceGroup,
  RiskScore,
  CloudHealthScore,
  DefenderStatus,
  ServiceHealthAlert,
} from '../types';

interface AppState {
  // ── Subscriptions ──
  subscriptions: AzureSubscription[];
  activeSubscriptionId: string | null;
  activeResourceGroupId: string | null;
  activeEnvironment: 'All' | 'Healthcare' | 'University';
  setSubscriptions: (subs: AzureSubscription[]) => void;
  setActiveSubscription: (id: string | null) => void;
  setActiveResourceGroup: (id: string | null) => void;
  setActiveEnvironment: (env: 'All' | 'Healthcare' | 'University') => void;

  // ── Resources ──
  resources: AzureResource[];
  resourceGroups: ResourceGroup[];
  resourcesLoading: boolean;
  lastResourceSync: string | null;
  setResources: (resources: AzureResource[]) => void;
  setResourceGroups: (groups: ResourceGroup[]) => void;
  setResourcesLoading: (loading: boolean) => void;
  setLastResourceSync: (timestamp: string) => void;

  // ── Monitoring ──
  metrics: Record<string, ResourceMetrics>;
  costSummary: CostSummary | null;
  securityScore: SecurityScore | null;
  backupHealth: BackupHealth[];
  advisorRecommendations: AdvisorRecommendation[];
  riskScore: RiskScore | null;
  cloudHealthScore: CloudHealthScore | null;
  defenderStatus: DefenderStatus | null;
  serviceHealthAlerts: ServiceHealthAlert[];
  setMetrics: (resourceId: string, metrics: ResourceMetrics) => void;
  setCostSummary: (summary: CostSummary | null) => void;
  setSecurityScore: (score: SecurityScore | null) => void;
  setBackupHealth: (health: BackupHealth[]) => void;
  setAdvisorRecommendations: (recs: AdvisorRecommendation[]) => void;
  setRiskScore: (score: RiskScore | null) => void;
  setCloudHealthScore: (score: CloudHealthScore | null) => void;
  setDefenderStatus: (status: DefenderStatus | null) => void;
  setServiceHealthAlerts: (alerts: ServiceHealthAlert[]) => void;

  // ── Incidents ──
  incidents: Incident[];
  setIncidents: (incidents: Incident[]) => void;
  addIncident: (incident: Incident) => void;
  updateIncident: (id: string, updates: Partial<Incident>) => void;

  // ── Notifications ──
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Notification) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;

  // ── AI Assistant ──
  aiMessages: AiMessage[];
  aiLoading: boolean;
  addAiMessage: (message: AiMessage) => void;
  setAiLoading: (loading: boolean) => void;
  clearAiMessages: () => void;

  // ── UI State ──
  sidebarCollapsed: boolean;
  commandPaletteOpen: boolean;
  globalSearchQuery: string;
  toggleSidebar: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setGlobalSearchQuery: (query: string) => void;

  // ── Refresh ──
  isRefreshing: boolean;
  lastUpdated: string | null;
  autoRefreshEnabled: boolean;
  refreshInterval: number;
  setIsRefreshing: (refreshing: boolean) => void;
  setLastUpdated: (timestamp: string) => void;
  setAutoRefreshEnabled: (enabled: boolean) => void;
  setRefreshInterval: (interval: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // ── Subscriptions ──
  subscriptions: [],
  activeSubscriptionId: null,
  activeResourceGroupId: null,
  activeEnvironment: 'All',
  setSubscriptions: (subscriptions) => set({ subscriptions }),
  setActiveSubscription: (activeSubscriptionId) => set({ activeSubscriptionId }),
  setActiveResourceGroup: (activeResourceGroupId) => set({ activeResourceGroupId }),
  setActiveEnvironment: (activeEnvironment) => set({ activeEnvironment }),

  // ── Resources ──
  resources: [],
  resourceGroups: [],
  resourcesLoading: false,
  lastResourceSync: null,
  setResources: (resources) => set({ resources }),
  setResourceGroups: (resourceGroups) => set({ resourceGroups }),
  setResourcesLoading: (resourcesLoading) => set({ resourcesLoading }),
  setLastResourceSync: (lastResourceSync) => set({ lastResourceSync }),

  // ── Monitoring ──
  metrics: {},
  costSummary: null,
  securityScore: null,
  backupHealth: [],
  advisorRecommendations: [],
  riskScore: null,
  cloudHealthScore: null,
  defenderStatus: null,
  serviceHealthAlerts: [],
  setMetrics: (resourceId, metrics) =>
    set((state) => ({ metrics: { ...state.metrics, [resourceId]: metrics } })),
  setCostSummary: (costSummary) => set({ costSummary }),
  setSecurityScore: (securityScore) => set({ securityScore }),
  setBackupHealth: (backupHealth) => set({ backupHealth }),
  setAdvisorRecommendations: (advisorRecommendations) => set({ advisorRecommendations }),
  setRiskScore: (riskScore) => set({ riskScore }),
  setCloudHealthScore: (cloudHealthScore) => set({ cloudHealthScore }),
  setDefenderStatus: (defenderStatus) => set({ defenderStatus }),
  setServiceHealthAlerts: (serviceHealthAlerts) => set({ serviceHealthAlerts }),

  // ── Incidents ──
  incidents: [],
  setIncidents: (incidents) => set({ incidents }),
  addIncident: (incident) =>
    set((state) => ({ incidents: [incident, ...state.incidents] })),
  updateIncident: (id, updates) =>
    set((state) => ({
      incidents: state.incidents.map((inc) =>
        inc.id === id ? { ...inc, ...updates } : inc
      ),
    })),

  // ── Notifications ──
  notifications: [],
  unreadCount: 0,
  addNotification: (notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications].slice(0, 100),
      unreadCount: state.unreadCount + 1,
    })),
  markAsRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    })),
  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),
  clearNotifications: () => set({ notifications: [], unreadCount: 0 }),

  // ── AI Assistant ──
  aiMessages: [],
  aiLoading: false,
  addAiMessage: (message) =>
    set((state) => ({ aiMessages: [...state.aiMessages, message] })),
  setAiLoading: (aiLoading) => set({ aiLoading }),
  clearAiMessages: () => set({ aiMessages: [] }),

  // ── UI State ──
  sidebarCollapsed: false,
  commandPaletteOpen: false,
  globalSearchQuery: '',
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  setGlobalSearchQuery: (globalSearchQuery) => set({ globalSearchQuery }),

  // ── Refresh ──
  isRefreshing: false,
  lastUpdated: null,
  autoRefreshEnabled: true,
  refreshInterval: 60,
  setIsRefreshing: (isRefreshing) => set({ isRefreshing }),
  setLastUpdated: (lastUpdated) => set({ lastUpdated }),
  setAutoRefreshEnabled: (autoRefreshEnabled) => set({ autoRefreshEnabled }),
  setRefreshInterval: (refreshInterval) => set({ refreshInterval }),
}));
