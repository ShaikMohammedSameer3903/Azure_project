import { useCallback, useState } from 'react';
import { useAppStore } from '../store/appStore';

export function useAzureData() {
  const {
    activeSubscriptionId,
    activeResourceGroupId,
    setResources,
    setResourceGroups,
    setLastResourceSync,
    setCostSummary,
    setSecurityScore,
    setAdvisorRecommendations,
    setRiskScore,
    setCloudHealthScore,
    setDefenderStatus,
    setServiceHealthAlerts,
    setLastUpdated,
    setIsRefreshing,
    addNotification
  } = useAppStore();

  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async (isAutoRefresh = false) => {
    if (!activeSubscriptionId) return;

    if (!isAutoRefresh) {
      setIsRefreshing(true);
      setError(null);
    }

    try {
      // Build base params
      const params = new URLSearchParams({ subscriptionId: activeSubscriptionId });
      if (activeResourceGroupId) {
        params.append('resourceGroup', activeResourceGroupId);
      }
      const qs = `?${params.toString()}`;

      // Parallel data fetching for performance
      const [
        resourcesRes,
        groupsRes,
        costRes,
        riskRes,
        cloudHealthRes,
        defenderRes,
        advisorRes,
        healthRes
      ] = await Promise.allSettled([
        fetch(`/api/resources${qs}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
        fetch(`/api/resources/groups/${activeSubscriptionId}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
        fetch(`/api/monitoring/cost${qs}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
        fetch(`/api/monitoring/risk${qs}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
        fetch(`/api/monitoring/cloud-health${qs}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
        fetch(`/api/monitoring/defender${qs}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
        fetch(`/api/monitoring/advisor${qs}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }),
        fetch(`/api/monitoring/health${qs}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      ]);

      // Handle Resources
      if (resourcesRes.status === 'fulfilled' && resourcesRes.value.ok) {
        setResources(await resourcesRes.value.json());
      }
      
      // Handle Resource Groups
      if (groupsRes.status === 'fulfilled' && groupsRes.value.ok) {
        setResourceGroups(await groupsRes.value.json());
      }

      // Handle Cost
      if (costRes.status === 'fulfilled' && costRes.value.ok) {
        setCostSummary(await costRes.value.json());
      }

      // Handle Risk
      if (riskRes.status === 'fulfilled' && riskRes.value.ok) {
        setRiskScore(await riskRes.value.json());
      }

      // Handle Cloud Health
      if (cloudHealthRes.status === 'fulfilled' && cloudHealthRes.value.ok) {
        setCloudHealthScore(await cloudHealthRes.value.json());
      }

      // Handle Defender
      if (defenderRes.status === 'fulfilled' && defenderRes.value.ok) {
        const defenderData = await defenderRes.value.json();
        setDefenderStatus(defenderData);
        if (defenderData.score) setSecurityScore(defenderData.score);
      }

      // Handle Advisor
      if (advisorRes.status === 'fulfilled' && advisorRes.value.ok) {
        setAdvisorRecommendations(await advisorRes.value.json());
      }

      // Handle Service Health
      if (healthRes.status === 'fulfilled' && healthRes.value.ok) {
        setServiceHealthAlerts(await healthRes.value.json());
      }

      setLastUpdated(new Date().toISOString());
      setLastResourceSync(new Date().toISOString());
      
    } catch (err: any) {
      console.error('Failed to fetch Azure dashboard data:', err);
      setError(err.message || 'Failed to sync Azure data');
      addNotification({
        id: Date.now().toString(),
        type: 'system',
        title: 'Data Sync Failed',
        message: 'Could not fetch latest Azure data. Check your connection.',
        severity: 'warning',
        timestamp: new Date().toISOString(),
        read: false
      });
    } finally {
      if (!isAutoRefresh) {
        setIsRefreshing(false);
      }
    }
  }, [
    activeSubscriptionId,
    activeResourceGroupId,
    setResources,
    setResourceGroups,
    setCostSummary,
    setRiskScore,
    setCloudHealthScore,
    setDefenderStatus,
    setSecurityScore,
    setAdvisorRecommendations,
    setServiceHealthAlerts,
    setLastUpdated,
    setLastResourceSync,
    setIsRefreshing,
    addNotification
  ]);

  return {
    fetchDashboardData,
    error,
    isLoading: useAppStore((state) => state.isRefreshing)
  };
}
