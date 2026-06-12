import { useState, useEffect, useMemo } from 'react';
import {
  Play,
  CheckCircle,
  Activity,
  Database,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Shield,
  DollarSign,
  Server,
  Sliders,
  UserCheck,
  TrendingUp,
  Cpu,
  AlertTriangle,
  LogOut,
  Settings,
  Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import {
  costReportData,
  accessReviewLogs,
  supportRunbooks,
  presentationSlides
} from './data/readinessData';
import fallbackResources from './data/liveAzureResources.json';

// Framer Motion Animation Variants
const fadeIn = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } }
};

const scaleIn = {
  hidden: { scale: 0.98, opacity: 0 },
  visible: { scale: 1, opacity: 1, transition: { duration: 0.3, ease: "easeOut" as any } }
};


// Counter Component for score transitions
function AnimatedCounter({ value, duration = 1.0, isCurrency = false, suffix = "" }: { value: number; duration?: number; isCurrency?: boolean; suffix?: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = value;
    if (start === end) {
      setCount(end);
      return;
    }

    const totalMiliseconds = duration * 1000;
    const incrementTime = 20; // ms
    const totalSteps = totalMiliseconds / incrementTime;
    const increment = (end - start) / totalSteps;

    let currentStep = 0;
    const timer = setInterval(() => {
      currentStep++;
      if (currentStep >= totalSteps) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(prev => prev + increment);
      }
    }, incrementTime);

    return () => clearInterval(timer);
  }, [value, duration]);

  if (isCurrency) {
    return <span>${count.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
  }
  if (value % 1 === 0) {
    return <span>{Math.round(count)}{suffix}</span>;
  }
  return <span>{count.toFixed(2)}{suffix}</span>;
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [userRole, setUserRole] = useState<'EXECUTIVE' | 'OPERATIONS' | 'AUDITOR' | 'ADMIN'>('ADMIN');
  const [userName, setUserName] = useState<string>('System Administrator');
  const [userEmail, setUserEmail] = useState<string>('admin.dev@healthcorp.onmicrosoft.com');

  const [activeTab, setActiveTab] = useState<string>('executive');
  const [currentSlideIdx, setCurrentSlideIdx] = useState(0);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  // Live Telemetry States
  const [liveResources, setLiveResources] = useState<any[]>(fallbackResources);
  const [liveAlertCount, setLiveAlertCount] = useState<number>(0);
  const [liveCompliance, setLiveCompliance] = useState<number>(100);
  const [liveCosts, setLiveCosts] = useState<any[]>(costReportData);
  const [liveActivityLogs, setLiveActivityLogs] = useState<any[]>([]);
  const [liveMetrics, setLiveMetrics] = useState<any>({ cpuPercentage: 12.8, memoryUsageGB: 16.0, networkInKbps: 450, networkOutKbps: 380 });
  const [backupState, setBackupState] = useState<any>({ jobsCount: 1, protectedItemsCount: 1, jobs: [], protectedItems: [] });
  const [azureStatus, setAzureStatus] = useState<any>({
    subscriptionId: 'd10be971-c619-4887-8737-b8054407194e',
    tenantId: '808cc83e-a546-47e7-a03f-73a1ebba24f3',
    authenticationStatus: 'Verifying...',
    lastRefreshTimestamp: new Date().toISOString(),
    resourceCount: 0,
    azureRegion: 'southeastasia'
  });

  const [lastUpdated, setLastUpdated] = useState<string>(new Date().toLocaleTimeString());
  const [healthStatus, setHealthStatus] = useState<string>('Healthy');
  const [apiLatency, setApiLatency] = useState<number | null>(null);
  const [sslStatus, setSslStatus] = useState<'SECURE' | 'WARNING' | 'NONE'>('SECURE');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Backup Validation States
  const [isBackupRunning, setIsBackupRunning] = useState(false);
  const [backupConsoleLogs, setBackupConsoleLogs] = useState<string[]>([]);
  const [backupStatus, setBackupStatus] = useState<'idle' | 'running' | 'success' | 'failed'>('idle');
  const [dbName, setDbName] = useState('PatientRecordsDB');

  // Alarm Noise States
  const [activeIncidentMode, setActiveIncidentMode] = useState<'pre_tuning' | 'post_tuning'>('pre_tuning');
  const [transientAlarmsSimulating, setTransientAlarmsSimulating] = useState(false);
  const [alarmsList, setAlarmsList] = useState<{ id: string; time: string; msg: string; status: 'critical' | 'ignored' | 'clear' }[]>([
    { id: "AL-102", time: "02:04:10", msg: "VPN Gateway Tunnel Connection Drop (Transient)", status: "critical" },
    { id: "AL-103", time: "02:05:00", msg: "Backup job item state: Failed (1st try)", status: "critical" },
    { id: "AL-104", time: "02:05:10", msg: "VPN Gateway Tunnel Connected (Transient Auto-Recovery)", status: "clear" },
    { id: "AL-105", time: "03:12:00", msg: "Backup job item state: Failed (Transient Engine check)", status: "critical" },
    { id: "AL-106", time: "03:13:00", msg: "Backup state auto-healed", status: "clear" }
  ]);

  // Access Logs State & Filtering
  const [accessFilter, setAccessFilter] = useState<'ALL' | 'Activated' | 'Expired'>('ALL');
  const filteredAccessLogs = useMemo(() => {
    return accessReviewLogs.filter(log => {
      if (accessFilter === 'ALL') return true;
      return log.pimStatus === accessFilter;
    });
  }, [accessFilter]);

  // Table Search, Sort, Filtering
  const [tableSearch, setTableSearch] = useState('');
  const [tableTypeFilter, setTableTypeFilter] = useState('ALL');
  const [tableSortKey, setTableSortKey] = useState<'name' | 'type' | 'location' | 'state'>('name');
  const [tableSortAsc, setTableSortAsc] = useState(true);

  // Dynamic filter lists for Type filter selector
  const resourceTypes = useMemo(() => {
    const types = new Set<string>();
    liveResources.forEach((r: any) => {
      if (r.type) types.add(r.type);
    });
    return Array.from(types);
  }, [liveResources]);

  // Processed live resources
  const processedResources = useMemo(() => {
    let result = [...liveResources];

    if (tableSearch.trim() !== '') {
      result = result.filter(r => r.name?.toLowerCase().includes(tableSearch.toLowerCase()));
    }

    if (tableTypeFilter !== 'ALL') {
      result = result.filter(r => r.type === tableTypeFilter);
    }

    result.sort((a, b) => {
      let valA = a[tableSortKey] || '';
      let valB = b[tableSortKey] || '';
      if (tableSortKey === 'state') {
        valA = a.provisioningState || '';
        valB = b.provisioningState || '';
      }
      if (valA < valB) return tableSortAsc ? -1 : 1;
      if (valA > valB) return tableSortAsc ? 1 : -1;
      return 0;
    });

    return result;
  }, [liveResources, tableSearch, tableTypeFilter, tableSortKey, tableSortAsc]);

  const handleSort = (key: 'name' | 'type' | 'location' | 'state') => {
    if (tableSortKey === key) {
      setTableSortAsc(!tableSortAsc);
    } else {
      setTableSortKey(key);
      setTableSortAsc(true);
    }
  };

  // MSAL login simulation
  const handleLogin = (role: 'EXECUTIVE' | 'OPERATIONS' | 'AUDITOR' | 'ADMIN') => {
    setUserRole(role);
    setUserName(role.charAt(0).toUpperCase() + role.slice(1).toLowerCase() + ' Account');
    setUserEmail(`${role.toLowerCase()}.dev@healthcorp.onmicrosoft.com`);
    setIsAuthenticated(true);
    // Redirect to default tab depending on role
    if (role === 'EXECUTIVE') setActiveTab('executive');
    else if (role === 'OPERATIONS') setActiveTab('operations');
    else if (role === 'AUDITOR') setActiveTab('auditor');
    else setActiveTab('admin');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
  };

  // Fetch live state from Local HTTPS APIs with JWT Bearer Token
  const fetchLiveData = async () => {
    if (!isAuthenticated) return;
    setIsRefreshing(true);
    const start = Date.now();
    const token = `mock-token-${userRole.toLowerCase()}`;
    const headers = { Authorization: `Bearer ${token}` };
    const baseUrl = import.meta.env.VITE_API_URL || '';

    try {
      // Fetch status
      const resStatus = await fetch(`${baseUrl}/api/status`);
      if (resStatus.ok) {
        const statusData = await resStatus.json();
        setAzureStatus(statusData);
      }

      // Fetch resources
      const resResources = await fetch(`${baseUrl}/api/resources`, { headers });
      if (resResources.ok) {
        const data = await resResources.json();
        setLiveResources(data);
        const unhealthy = data.some((r: any) => r.provisioningState !== 'Succeeded');
        setHealthStatus(unhealthy ? 'Warning' : 'Healthy');
        setSslStatus('SECURE');
      }

      // Fetch alerts
      if (['ADMIN', 'AUDITOR', 'OPERATIONS'].includes(userRole)) {
        const resAlerts = await fetch(`${baseUrl}/api/alerts`, { headers });
        if (resAlerts.ok) {
          const alertsData = await resAlerts.json();
          setLiveAlertCount(alertsData.length);
        }
      }

      // Fetch costs
      if (['ADMIN', 'EXECUTIVE'].includes(userRole)) {
        const resCosts = await fetch(`${baseUrl}/api/costs`, { headers });
        if (resCosts.ok) {
          const costData = await resCosts.json();
          setLiveCosts(costData);
        }
      }

      // Fetch policies
      if (['ADMIN', 'AUDITOR', 'OPERATIONS'].includes(userRole)) {
        const resPolicies = await fetch(`${baseUrl}/api/policies`, { headers });
        if (resPolicies.ok) {
          const policyData = await resPolicies.json();
          setLiveCompliance(policyData.compliancePercentage);
        }
      }

      // Fetch activity logs
      if (['ADMIN', 'AUDITOR'].includes(userRole)) {
        const resLogs = await fetch(`${baseUrl}/api/activitylogs`, { headers });
        if (resLogs.ok) {
          const logsData = await resLogs.json();
          setLiveActivityLogs(logsData);
        }
      }

      // Fetch metrics
      if (['ADMIN', 'OPERATIONS'].includes(userRole)) {
        const resMetrics = await fetch(`${baseUrl}/api/metrics`, { headers });
        if (resMetrics.ok) {
          const metricsData = await resMetrics.json();
          setLiveMetrics(metricsData);
        }
      }

      // Fetch backups
      if (['ADMIN', 'OPERATIONS'].includes(userRole)) {
        const resBackup = await fetch(`${baseUrl}/api/backups`, { headers });
        if (resBackup.ok) {
          const backupData = await resBackup.json();
          setBackupState(backupData);
        }
      }

      setLastUpdated(new Date().toLocaleTimeString());
      setApiLatency(Date.now() - start);
    } catch (err) {
      console.warn('Live API connection failed. Using mock / fallback databases. (Ensure backend is running locally)', err);
      setSslStatus('WARNING');
      setApiLatency(Date.now() - start);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLiveData();
    const interval = setInterval(fetchLiveData, 60000);
    return () => clearInterval(interval);
  }, [isAuthenticated, userRole]);

  // Run validation script simulation
  const startBackupValidation = () => {
    if (isBackupRunning) return;
    setIsBackupRunning(true);
    setBackupStatus('running');
    setBackupConsoleLogs([]);

    const logSteps = [
      { text: "==========================================================", delay: 0 },
      { text: "  AZURE BACKUP AND RESTORE AUDIT VALIDATION RUNNER        ", delay: 200 },
      { text: "==========================================================", delay: 350 },
      { text: `Timestamp: ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`, delay: 500 },
      { text: "Vault Name: rsv-hc-prod-backup", delay: 650 },
      { text: "Resource Group: RG-Healthcare-Prod", delay: 800 },
      { text: `Target: ${dbName}`, delay: 950 },
      { text: "----------------------------------------------------------", delay: 1100 },
      { text: "[*] Authenticating Azure Management API...", delay: 1400 },
      { text: "    -> MSI Identity verified: vm-hc-prod-ops-agent [SUCCESS]", delay: 1800 },
      { text: "[*] Retrieving Recovery Services Vault metadata...", delay: 2200 },
      { text: "    - Location: southeastasia\n    - Backup redundancy: Geo-Redundant (GRS)\n    - Cross-Region Restore: ENABLED\n    - Encryption: Customer-Managed Key (CMK)", delay: 2600 },
      { text: `[*] Querying protection items for DB: ${dbName}...`, delay: 3000 },
      { text: "    - Found protection item: SQLDatabase;PatientRecordsDB\n    - Last Backup Status: Completed\n    - Last Backup Time: 6 hours ago\n    - Recovery Points Available: 14", delay: 3400 },
      { text: "[*] Initializing automated backup verification restore dry-run...", delay: 3800 },
      { text: "    - Target sandbox: vnet-hc-prod-secure/sub-hc-db-restore-test\n    - Allocating ephemeral restore container... [DONE]\n    - Downloading transaction log slices... [DONE]", delay: 4200 },
      { text: "    - Restoring database instance into container... [DONE]", delay: 4800 },
      { text: "[*] Executing Database Integrity Checks (DBCC CHECKDB equivalent)...", delay: 5400 },
      { text: "    - Database consistency check: 0 errors detected. [VALID]\n    - Verifying HIPAA patient records schema structure... [VALID]", delay: 6000 },
      { text: "    - Source Backup MD5 Hash  : 8f3e2b10a9cf47de8b7c0123ef65bb01\n    - Restored Database Hash  : 8f3e2b10a9cf47de8b7c0123ef65bb01\n    - Integrity validation matched successfully. [SUCCESS]", delay: 6600 },
      { text: "----------------------------------------------------------", delay: 7200 },
      { text: "[SUCCESS] Backup verification successfully completed!", delay: 7600 },
      { text: "Audit report exported to: C:\\Azure_project\\scripts\\backup-validation-audit.json", delay: 8000 },
      { text: "==========================================================", delay: 8400 }
    ];

    logSteps.forEach(step => {
      setTimeout(() => {
        setBackupConsoleLogs(prev => [...prev, step.text]);
        if (step.text.includes("[SUCCESS] Backup verification")) {
          setBackupStatus('success');
          setIsBackupRunning(false);
        }
      }, step.delay);
    });
  };

  const handleAlertTuningSimulate = () => {
    setTransientAlarmsSimulating(true);
    if (activeIncidentMode === 'pre_tuning') {
      setTimeout(() => {
        setAlarmsList([
          { id: "AL-201", time: "11:50:00", msg: "VPN Gateway transient latency drop", status: "critical" },
          { id: "AL-202", time: "11:51:00", msg: "CRITICAL: Backup failed (Transient blip - 1 attempt)", status: "critical" },
          { id: "AL-203", time: "11:51:45", msg: "VPN Gateway connection restored", status: "clear" },
          { id: "AL-204", time: "11:52:00", msg: "CRITICAL: Backup failed (Log file busy - transient)", status: "critical" },
          { id: "AL-205", time: "11:54:00", msg: "CRITICAL: SQL Server IO Read limit hit (5s duration)", status: "critical" },
          { id: "AL-FATAL", time: "11:55:00", msg: "ALERT MASKED: Continuous backup failure on main DB", status: "ignored" }
        ]);
        setTransientAlarmsSimulating(false);
      }, 1500);
    } else {
      setTimeout(() => {
        setAlarmsList([
          { id: "AL-301", time: "11:50:00", msg: "VPN transient blip ignored (Monitoring rule filters: Evaluating consecutive counts)", status: "clear" },
          { id: "AL-302", time: "11:52:00", msg: "Log file busy ignored (Evaluation window adjusted to 1 Hour)", status: "clear" },
          { id: "AL-REAL", time: "12:50:00", msg: "ALERT: Backup failure persistent for 1 hour (>2 consecutive failures) [REAL INCIDENT SURFACED]", status: "critical" }
        ]);
        setTransientAlarmsSimulating(false);
      }, 1500);
    }
  };

  const nextSlide = () => {
    if (currentSlideIdx < presentationSlides.length - 1) {
      setCurrentSlideIdx(currentSlideIdx + 1);
    }
  };
  const prevSlide = () => {
    if (currentSlideIdx > 0) {
      setCurrentSlideIdx(currentSlideIdx - 1);
    }
  };

  const totalCost = liveCosts.reduce((acc, curr) => acc + curr.monthlyCost, 0);
  const totalBudget = liveCosts.reduce((acc, curr) => acc + curr.budgetLimit, 0);

  // Dynamic cost aggregation
  const pieCostData = useMemo(() => {
    return liveCosts.map((c, i) => ({
      name: c.resourceName,
      value: c.monthlyCost,
      color: ['#0078D4', '#107c41', '#8b5cf6', '#ef4444', '#f59e0b', '#38bdf8'][i % 6]
    }));
  }, [liveCosts]);

  // Chart datasets
  const costTrendData = [
    { name: 'Jan', Spend: 720, Budget: 1200 },
    { name: 'Feb', Spend: 880, Budget: 1200 },
    { name: 'Mar', Spend: 1040, Budget: 1200 },
    { name: 'Apr', Spend: 990, Budget: 1200 },
    { name: 'May', Spend: 1145.70, Budget: 1200 },
    { name: 'Jun', Spend: totalCost || 1145.70, Budget: totalBudget || 1200 }
  ];



  const policyComplianceTrendData = [
    { name: '06/07', Compliance: 95 },
    { name: '06/08', Compliance: 98 },
    { name: '06/09', Compliance: 100 },
    { name: '06/10', Compliance: 100 },
    { name: '06/11', Compliance: liveCompliance }
  ];

  // MSAL Login Card Layout if not authenticated
  if (!isAuthenticated) {
    return (
      <div className={`landing-layout ${isDarkMode ? 'dark-theme' : ''}`} style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '2rem', background: 'var(--bg-gradient)', color: 'var(--text-primary)', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', width: '600px', height: '600px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(0, 120, 212, 0.12) 0%, transparent 65%)', top: '-10%', left: '-10%', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', width: '600px', height: '600px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(56, 189, 248, 0.12) 0%, transparent 65%)', bottom: '-15%', right: '-10%', pointerEvents: 'none' }} />

        <motion.div
          initial="hidden"
          animate="visible"
          variants={scaleIn}
          className="glass-panel"
          style={{ maxWidth: '480px', width: '100%', padding: '2.5rem', textAlign: 'center', zIndex: 1 }}
        >
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <div className="portal-brand-logo">
              <span className="logo-block blue"></span>
              <span className="logo-block green"></span>
              <span className="logo-block red"></span>
              <span className="logo-block yellow"></span>
            </div>
            <span style={{ fontWeight: 800, fontSize: '1.25rem', letterSpacing: '0.05em' }}>Microsoft Entra ID</span>
          </div>

          <h1 style={{ fontSize: '1.85rem', fontWeight: 800, marginBottom: '0.75rem', lineHeight: 1.2 }}>Azure Healthcare Platform</h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '2rem' }}>
            To access the Level 3 Enterprise Operations Center, please authenticate. Select your authorized Azure directory role below:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
            <button className="btn portal-btn" style={{ justifyContent: 'flex-start', padding: '0.75rem 1.25rem' }} onClick={() => handleLogin('EXECUTIVE')}>
              <DollarSign size={18} style={{ color: '#8b5cf6', marginRight: '0.75rem' }} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Log in as Executive Role</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>View financial trends and compliance reports</div>
              </div>
            </button>

            <button className="btn portal-btn" style={{ justifyContent: 'flex-start', padding: '0.75rem 1.25rem' }} onClick={() => handleLogin('OPERATIONS')}>
              <Activity size={18} style={{ color: 'var(--success)', marginRight: '0.75rem' }} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Log in as Operations Role</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>VM performance, alarms lab, and backup terminal</div>
              </div>
            </button>

            <button className="btn portal-btn" style={{ justifyContent: 'flex-start', padding: '0.75rem 1.25rem' }} onClick={() => handleLogin('AUDITOR')}>
              <Shield size={18} style={{ color: 'var(--azure-blue)', marginRight: '0.75rem' }} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Log in as Security Auditor</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Centralized policy compliance and PIM audit logs</div>
              </div>
            </button>

            <button className="btn portal-btn-primary" style={{ justifyContent: 'flex-start', padding: '0.75rem 1.25rem' }} onClick={() => handleLogin('ADMIN')}>
              <Sliders size={18} style={{ color: '#fff', marginRight: '0.75rem' }} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff' }}>Log in as global Administrator</div>
                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)' }}>Full access, rate-limiting, and TLS diagnostics</div>
              </div>
            </button>
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
            Compliant with HIPAA Security Standard § 164.312
          </div>
        </motion.div>
      </div>
    );
  }

  // LEVEL 3 ENTERPRISE OPERATIONS CENTER SHELL LAYOUT
  return (
    <div className={`portal-shell ${isDarkMode ? 'dark-theme' : ''}`}>
      {sslStatus === 'WARNING' && (
        <div style={{ background: 'var(--warning)', color: '#000', padding: '0.35rem 1rem', fontSize: '0.8rem', fontWeight: 700, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', zIndex: 1001 }}>
          <AlertTriangle size={14} />
          <span>Live API Connection Offline. Ensure the backend service is active.</span>
        </div>
      )}

      {/* Top Navigation Bar */}
      <header className="portal-top-bar">
        <div className="portal-brand">
          <div className="portal-brand-logo">
            <span className="logo-block blue"></span>
            <span className="logo-block green"></span>
            <span className="logo-block red"></span>
            <span className="logo-block yellow"></span>
          </div>
          <span>Microsoft Azure</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: '0 0.25rem' }}>/</span>
          <span style={{ fontWeight: 400 }}>Healthcare Operations Center</span>
          <span className="badge badge-info" style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>LEVEL 3</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', width: '400px' }}>
          <Search size={16} style={{ color: 'var(--text-secondary)', position: 'absolute', marginLeft: '0.75rem', pointerEvents: 'none' }} />
          <input
            type="text"
            className="portal-search-bar"
            style={{ paddingLeft: '2.25rem', width: '100%' }}
            placeholder="Search Azure active resources..."
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
          />
        </div>

        <div className="portal-top-actions">
          {isRefreshing ? (
            <RefreshCw className="animate-spin" size={16} style={{ color: 'var(--azure-blue)' }} />
          ) : (
            <button className="portal-btn" style={{ padding: '0.35rem 0.5rem', borderRadius: '8px' }} onClick={fetchLiveData}>
              <RefreshCw size={14} />
            </button>
          )}

          <button className="portal-btn" style={{ padding: '0.35rem 0.75rem', borderRadius: '8px' }} onClick={() => setIsDarkMode(!isDarkMode)}>
            {isDarkMode ? '☀️ Light' : '🌙 Dark'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="live-pulse-dot" />
            <span style={{ fontWeight: 600, fontSize: '0.8rem' }}>Live SDK Telemetry</span>
          </div>

          <div style={{ borderLeft: '1px solid var(--border-color)', height: '20px' }}></div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <UserCheck size={16} style={{ color: 'var(--azure-blue)' }} />
            <div style={{ textAlign: 'left', fontSize: '0.75rem' }}>
              <div style={{ fontWeight: 700 }}>{userName}</div>
              <div style={{ color: 'var(--text-secondary)' }}>{userRole}</div>
            </div>
          </div>

          <button className="portal-btn" style={{ padding: '0.35rem 0.75rem', borderRadius: '8px', color: 'var(--critical)' }} onClick={handleLogout}>
            <LogOut size={14} />
          </button>
        </div>
      </header>

      {/* Navigation & Content Grid */}
      <div className="portal-main-grid">
        {/* Navigation Sidebar */}
        <aside className="portal-navigation-pane">
          <div className="portal-nav-section-title">Workspaces</div>
          
          <button
            className={`portal-nav-item ${activeTab === 'executive' ? 'active' : ''}`}
            onClick={() => setActiveTab('executive')}
          >
            <DollarSign size={16} /> Executive Portal
          </button>

          <button
            className={`portal-nav-item ${activeTab === 'operations' ? 'active' : ''}`}
            onClick={() => setActiveTab('operations')}
          >
            <Activity size={16} /> Operations Portal
          </button>

          <button
            className={`portal-nav-item ${activeTab === 'auditor' ? 'active' : ''}`}
            onClick={() => setActiveTab('auditor')}
          >
            <Shield size={16} /> Auditor Portal
          </button>

          <button
            className={`portal-nav-item ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => setActiveTab('admin')}
          >
            <Settings size={16} /> Administrator Workspace
          </button>

          <button
            className={`portal-nav-item ${activeTab === 'azure-status' ? 'active' : ''}`}
            onClick={() => setActiveTab('azure-status')}
          >
            <Server size={16} /> Live Azure Status
          </button>


          <div className="portal-nav-section-title">Active Role Context</div>
          <div style={{ padding: '0.5rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Choose simulated login:</div>
            <select
              value={userRole}
              onChange={(e) => handleLogin(e.target.value as any)}
              style={{
                width: '100%',
                background: '#1e293b',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '0.35rem 0.5rem',
                borderRadius: '6px',
                color: 'white',
                fontSize: '0.8rem',
                outline: 'none',
                fontWeight: 600
              }}
            >
              <option value="EXECUTIVE">Executive</option>
              <option value="OPERATIONS">Operations Manager</option>
              <option value="AUDITOR">Security Auditor</option>
              <option value="ADMIN">Global Administrator</option>
            </select>
          </div>
        </aside>

        {/* Content Workspace */}
        <main className="portal-workspace">
          {/* Breadcrumbs */}
          <div className="portal-breadcrumbs">
            <span className="portal-breadcrumb-item" onClick={() => handleLogout()}>Home</span>
            <span>/</span>
            <span>Resource groups</span>
            <span>/</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>RG-Healthcare-Prod</span>
            <span>/</span>
            <span style={{ color: 'var(--azure-blue)', fontWeight: 600 }}>{activeTab.toUpperCase()} WORKSPACE</span>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={fadeIn}
              style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}
            >
              {/* TAB 1: EXECUTIVE WORKSPACE */}
              {activeTab === 'executive' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.25rem' }}>Executive Financial & Strategy Center</h1>
                      <p style={{ color: 'var(--text-secondary)' }}>Centralized oversight of subscription spending, compliance averages, and platform handover presentation.</p>
                    </div>
                    <div className="glass-panel" style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem' }}>
                      <div>Refresh: Every 60s</div>
                      <div>Updated: {lastUpdated}</div>
                    </div>
                  </header>

                  {/* Financial KPI Cards */}
                  <div className="portal-metric-grid">
                    <div className="portal-metric-card" style={{ borderLeftColor: '#8b5cf6' }}>
                      <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Current Month Spend</h3>
                      <div className="portal-metric-value" style={{ color: '#8b5cf6' }}>
                        <AnimatedCounter value={totalCost} isCurrency={true} />
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        Live budget: ${totalBudget.toLocaleString()}
                      </div>
                    </div>

                    <div className="portal-metric-card" style={{ borderLeftColor: 'var(--success)' }}>
                      <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Budget Remaining</h3>
                      <div className="portal-metric-value" style={{ color: 'var(--success)' }}>
                        <AnimatedCounter value={totalBudget - totalCost} isCurrency={true} />
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        Reconciliation status: <strong style={{ color: 'var(--success)' }}>Compliant</strong>
                      </div>
                    </div>

                    <div className="portal-metric-card" style={{ borderLeftColor: 'var(--azure-blue)' }}>
                      <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Governance Score</h3>
                      <div className="portal-metric-value" style={{ color: 'var(--azure-blue)' }}>
                        <AnimatedCounter value={liveCompliance} suffix="%" />
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        Target SLA compliance: 100%
                      </div>
                    </div>
                  </div>

                  {/* Costs Trend & Distribution */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem' }}>
                    <div className="glass-panel">
                      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <TrendingUp size={18} style={{ color: 'var(--azure-blue)' }} /> Dynamic Monthly Cost Trends
                      </h2>
                      <div style={{ width: '100%', height: '240px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={costTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                            <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={11} />
                            <YAxis stroke="var(--text-secondary)" fontSize={11} />
                            <Tooltip />
                            <Legend />
                            <Area type="monotone" dataKey="Spend" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorSpend)" />
                            <Line type="monotone" dataKey="Budget" stroke="var(--critical)" strokeDasharray="5 5" strokeWidth={2} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
                      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>Resource Spending Share</h2>
                      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieCostData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={80}
                              paddingAngle={5}
                              dataKey="value"
                            >
                              {pieCostData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip />
                            <Legend layout="vertical" verticalAlign="middle" align="right" />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Presentation Slides */}
                  <div className="glass-panel" style={{ minHeight: '350px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', marginBottom: '1.5rem' }}>
                        <div>
                          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--azure-blue)' }}>{presentationSlides[currentSlideIdx].title}</h2>
                          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{presentationSlides[currentSlideIdx].subtitle}</p>
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
                          Slide {currentSlideIdx + 1} of {presentationSlides.length}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem', alignItems: 'center' }}>
                        <div>
                          <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', listStyleType: 'none' }}>
                            {presentationSlides[currentSlideIdx].bullets.map((bullet, idx) => (
                              <li key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.95rem', lineHeight: '1.4' }}>
                                <CheckCircle size={16} style={{ color: 'var(--success)', marginTop: '0.15rem', flexShrink: 0 }} />
                                <span>{bullet}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="glass-card" style={{ padding: '1rem', minHeight: '180px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                          {presentationSlides[currentSlideIdx].diagramType === 'architecture' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', textAlign: 'center' }}>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Subnet Infrastructure Topology</span>
                              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                <div style={{ border: '1px solid var(--border-color)', padding: '0.5rem', borderRadius: '6px', flex: 1, background: 'rgba(0,120,212,0.05)', fontSize: '0.75rem' }}>
                                  <div style={{ color: 'var(--azure-blue)', fontWeight: 700 }}>DMZ AppGW</div>
                                </div>
                                <div style={{ border: '1px solid var(--border-color)', padding: '0.5rem', borderRadius: '6px', flex: 1, background: 'rgba(22,163,74,0.05)', fontSize: '0.75rem' }}>
                                  <div style={{ color: 'var(--success)', fontWeight: 700 }}>EMR VM Subnet</div>
                                </div>
                              </div>
                            </div>
                          )}
                          {presentationSlides[currentSlideIdx].diagramType === 'incident' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', textAlign: 'center' }}>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 700, textTransform: 'uppercase' }}>Alert Fatigue Impact</span>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.75rem' }}>
                                <div style={{ padding: '0.35rem', background: 'rgba(220,38,38,0.08)', borderRadius: '4px', color: 'var(--critical)', fontWeight: 700 }}>Before: 180 False Alarms/day</div>
                                <div style={{ padding: '0.35rem', background: 'rgba(22,163,74,0.08)', borderRadius: '4px', color: 'var(--success)', fontWeight: 700 }}>After: 0 False Alarms/day</div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                      <button className="btn btn-secondary" onClick={prevSlide} disabled={currentSlideIdx === 0} style={{ padding: '0.4rem 1rem' }}>
                        <ChevronLeft size={14} /> Prev
                      </button>
                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        {presentationSlides.map((_, idx) => (
                          <span
                            key={idx}
                            onClick={() => setCurrentSlideIdx(idx)}
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: currentSlideIdx === idx ? 'var(--azure-blue)' : 'var(--text-secondary)',
                              cursor: 'pointer'
                            }}
                          />
                        ))}
                      </div>
                      <button className="btn btn-secondary" onClick={nextSlide} disabled={currentSlideIdx === presentationSlides.length - 1} style={{ padding: '0.4rem 1rem' }}>
                        Next <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: OPERATIONS WORKSPACE */}
              {activeTab === 'operations' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.25rem' }}>Infrastructure Operations Center</h1>
                      <p style={{ color: 'var(--text-secondary)' }}>Track live resources, VM performance metrics, alert rules tuning, and interactive database backup validations.</p>
                    </div>
                    <div className="glass-panel" style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem' }}>
                      <div>Refresh: Every 60s</div>
                      <div>Updated: {lastUpdated}</div>
                    </div>
                  </header>

                  {/* Operations KPI Metrics */}
                  <div className="portal-metric-grid">
                    <div className="portal-metric-card" style={{ borderLeftColor: 'var(--azure-blue)' }}>
                      <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.25rem' }}>VM CPU Utilization</h3>
                      <div className="portal-metric-value" style={{ color: 'var(--azure-blue)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Cpu size={24} />
                        <AnimatedCounter value={liveMetrics.cpuPercentage} suffix="%" />
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        Allocated memory: {liveMetrics.memoryUsageGB} GB
                      </div>
                    </div>

                    <div className="portal-metric-card" style={{ borderLeftColor: 'var(--success)' }}>
                      <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Backup Protected Items</h3>
                      <div className="portal-metric-value" style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Database size={24} />
                        <AnimatedCounter value={backupState.protectedItemsCount || 1} />
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        Vault jobs run: {backupState.jobsCount || 1}
                      </div>
                    </div>

                    <div className="portal-metric-card" style={{ borderLeftColor: liveAlertCount > 0 ? 'var(--critical)' : 'var(--success)' }}>
                      <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Active Alert Rules</h3>
                      <div className="portal-metric-value" style={{ color: liveAlertCount > 0 ? 'var(--critical)' : 'var(--success)' }}>
                        <AnimatedCounter value={liveAlertCount} />
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        Health state: <strong>{healthStatus}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Deployed Resources Table */}
                  <div className="glass-panel">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Server size={18} style={{ color: 'var(--azure-blue)' }} /> Live Azure Resource Inventory
                      </h2>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <select
                          value={tableTypeFilter}
                          onChange={(e) => setTableTypeFilter(e.target.value)}
                          style={{
                            background: 'rgba(0,0,0,0.04)',
                            border: '1px solid var(--border-color)',
                            padding: '0.25rem 0.5rem',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            color: 'var(--text-primary)'
                          }}
                        >
                          <option value="ALL">All Types</option>
                          {resourceTypes.map(t => (
                            <option key={t} value={t}>{t.split('/').pop()}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="portal-table-wrapper">
                      <table className="portal-table">
                        <thead>
                          <tr>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>Resource Name {tableSortKey === 'name' ? (tableSortAsc ? '▲' : '▼') : ''}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('type')}>Type {tableSortKey === 'type' ? (tableSortAsc ? '▲' : '▼') : ''}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('location')}>Location {tableSortKey === 'location' ? (tableSortAsc ? '▲' : '▼') : ''}</th>
                            <th style={{ cursor: 'pointer' }} onClick={() => handleSort('state')}>Provisioning State {tableSortKey === 'state' ? (tableSortAsc ? '▲' : '▼') : ''}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {processedResources.map((r, i) => (
                            <tr key={i}>
                              <td style={{ fontWeight: 700 }}>{r.name}</td>
                              <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{r.type?.split('/').pop()}</td>
                              <td>{r.location}</td>
                              <td>
                                <span className={`badge ${r.provisioningState === 'Succeeded' || !r.provisioningState ? 'badge-success' : 'badge-warning'}`}>
                                  {r.provisioningState || 'Succeeded'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* VM Performance Telemetry & Alert suppression lab */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem' }}>
                    
                    {/* Alarms tuning lab */}
                    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Telemetry Suppression & Alert Tuning</h3>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button className={`btn ${activeIncidentMode === 'pre_tuning' ? 'btn-danger' : 'btn-secondary'}`} onClick={() => setActiveIncidentMode('pre_tuning')} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                            Noisy
                          </button>
                          <button className={`btn ${activeIncidentMode === 'post_tuning' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveIncidentMode('post_tuning')} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                            Tuned
                          </button>
                        </div>
                      </div>

                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {activeIncidentMode === 'pre_tuning'
                          ? 'Vulnerability: Immediate alerts on transient failures (e.g. log trims) trigger 180 false positive alarms daily, causing operator fatigue.'
                          : 'Solution: 1 Hour evaluation windows filters out brief blips, escalating only consecutive, persistent errors.'}
                      </p>

                      <button className="btn btn-primary" onClick={handleAlertTuningSimulate} disabled={transientAlarmsSimulating}>
                        {transientAlarmsSimulating ? <RefreshCw className="animate-spin" size={14} /> : <Play size={14} />} Run Alert Simulation
                      </button>

                      <div className="cli-terminal" style={{ minHeight: '150px' }}>
                        {alarmsList.map((a, i) => (
                          <div key={i} style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '0.2rem', fontSize: '0.75rem' }}>
                            <span style={{ color: '#64748b' }}>[{a.time}]</span>
                            <span style={{ color: a.status === 'critical' ? 'var(--critical)' : a.status === 'ignored' ? 'var(--warning)' : 'var(--success)', fontWeight: 'bold' }}>
                              {a.status === 'critical' ? '[CRITICAL]' : a.status === 'ignored' ? '[SUPPRESSED]' : '[RESOLVED]'}
                            </span>
                            <span style={{ color: '#ffffff' }}>{a.msg}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* VM metrics live stream */}
                    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Live VM Performance Metrics</h3>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                            <span style={{ fontWeight: 600 }}>CPU Percentage</span>
                            <span>{liveMetrics.cpuPercentage?.toFixed(1)}%</span>
                          </div>
                          <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${liveMetrics.cpuPercentage}%`, height: '100%', background: 'var(--azure-blue)' }}></div>
                          </div>
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                            <span style={{ fontWeight: 600 }}>Memory Usage (GB)</span>
                            <span>{((liveMetrics.memoryUsageGB / 32) * 100).toFixed(0)}% ({liveMetrics.memoryUsageGB} / 32 GB)</span>
                          </div>
                          <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${(liveMetrics.memoryUsageGB / 32) * 100}%`, height: '100%', background: 'var(--success)' }}></div>
                          </div>
                        </div>

                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                            <span style={{ fontWeight: 600 }}>Network In Telemetry</span>
                            <span>{liveMetrics.networkInKbps?.toFixed(0)} Kbps</span>
                          </div>
                          <div style={{ width: '100%', height: '8px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${(liveMetrics.networkInKbps / 2000) * 100}%`, height: '100%', background: 'var(--warning)' }}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* RSV Backup Validation emulator */}
                  <div className="glass-panel">
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Database size={18} style={{ color: 'var(--azure-blue)' }} /> Backup Validation Sandbox (RSV Emulator)
                    </h3>
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Target Database Item</label>
                        <input
                          type="text"
                          value={dbName}
                          onChange={(e) => setDbName(e.target.value)}
                          style={{
                            width: '100%',
                            background: '#020617',
                            border: '1px solid var(--border-color)',
                            padding: '0.5rem',
                            borderRadius: '6px',
                            color: '#fff',
                            fontSize: '0.85rem',
                            fontFamily: 'monospace'
                          }}
                        />
                      </div>
                      <div style={{ alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        {backupStatus !== 'idle' && (
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: backupStatus === 'running' ? 'var(--azure-blue)' : backupStatus === 'success' ? 'var(--success)' : 'var(--critical)' }}>
                            [{backupStatus.toUpperCase()}]
                          </span>
                        )}
                        <button className="btn btn-primary" onClick={startBackupValidation} disabled={isBackupRunning}>
                          {isBackupRunning ? <RefreshCw className="animate-spin" size={14} /> : <Play size={14} />} Run validate-backup.ps1
                        </button>
                      </div>
                    </div>

                    <div className="cli-terminal">
                      <div className="terminal-header">
                        <div className="terminal-dots">
                          <span className="dot dot-red"></span>
                          <span className="dot dot-yellow"></span>
                          <span className="dot dot-green"></span>
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>PowerShell - RSV Restoration Dry-Run</span>
                      </div>
                      <div style={{ minHeight: '150px', maxHeight: '250px', overflowY: 'auto' }}>
                        {backupConsoleLogs.length === 0 ? (
                          <div style={{ color: 'rgba(255,255,255,0.3)', fontStyle: 'italic', fontSize: '0.8rem' }}>Click "Run validate-backup.ps1" to execute restoration validation tests.</div>
                        ) : (
                          backupConsoleLogs.map((l, i) => (
                            <div key={i} style={{ paddingBottom: '0.15rem', fontSize: '0.8rem' }}>{l}</div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: AUDITOR WORKSPACE */}
              {activeTab === 'auditor' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.25rem' }}>Security & Governance Auditor Portal</h1>
                      <p style={{ color: 'var(--text-secondary)' }}>Review live policy compliant scopes, evaluate Entra ID PIM activations, and track compliance runbooks.</p>
                    </div>
                    <div className="glass-panel" style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem' }}>
                      <div>Refresh: Every 60s</div>
                      <div>Updated: {lastUpdated}</div>
                    </div>
                  </header>

                  {/* Auditor KPIs */}
                  <div className="portal-metric-grid">
                    <div className="portal-metric-card" style={{ borderLeftColor: 'var(--success)' }}>
                      <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Regulatory Compliance</h3>
                      <div className="portal-metric-value" style={{ color: 'var(--success)' }}>
                        <AnimatedCounter value={liveCompliance} suffix="%" />
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        Compliance: <strong>HIPAA Enforced</strong>
                      </div>
                    </div>

                    <div className="portal-metric-card" style={{ borderLeftColor: 'var(--azure-blue)' }}>
                      <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Active PIM Activations</h3>
                      <div className="portal-metric-value" style={{ color: 'var(--azure-blue)' }}>
                        <AnimatedCounter value={filteredAccessLogs.filter(l => l.pimStatus === 'Activated').length} />
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        Total audited logs: {accessReviewLogs.length}
                      </div>
                    </div>

                    <div className="portal-metric-card" style={{ borderLeftColor: '#8b5cf6' }}>
                      <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Audited Runbooks</h3>
                      <div className="portal-metric-value" style={{ color: '#8b5cf6' }}>
                        <AnimatedCounter value={supportRunbooks.length} />
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        Last review: 12 hours ago
                      </div>
                    </div>
                  </div>

                  {/* Centralized Policy Compliance Details & PIM Logs */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '2rem' }}>
                    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Compliance Compliance Trends</h3>
                      
                      <div style={{ width: '100%', height: '150px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={policyComplianceTrendData}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                            <XAxis dataKey="name" fontSize={10} stroke="var(--text-secondary)" />
                            <YAxis domain={[80, 100]} fontSize={10} stroke="var(--text-secondary)" />
                            <Tooltip />
                            <Line type="monotone" dataKey="Compliance" stroke="var(--success)" strokeWidth={3} dot={{ r: 4 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>

                      <div style={{ borderLeft: '4px solid var(--warning)', paddingLeft: '1rem', fontSize: '0.8rem' }}>
                        <div style={{ fontWeight: 700, color: 'var(--warning)', marginBottom: '0.25rem' }}>EX-092: Dev Sandbox Lock Exemption</div>
                        <p style={{ color: 'var(--text-secondary)' }}>Resource groups labeled `Environment: Development` are exempted from the automated `CanNotDelete` lock policy to permit sandbox destruction. Approved by Security Lead.</p>
                      </div>
                    </div>

                    {/* Policy schema JSON definition */}
                    <div className="glass-panel">
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem' }}>Azure Policy Schema Rule</h3>
                      <pre style={{ background: '#020617', padding: '1rem', borderRadius: '8px', fontSize: '0.75rem', overflowX: 'auto', border: '1px solid rgba(255, 255, 255, 0.08)', color: '#38bdf8', fontFamily: 'monospace' }}>
{`{
  "$schema": "https://schema.management.azure.com/.../policyDefinition.json",
  "name": "enforce-backup-for-vms",
  "properties": {
    "displayName": "Enforce Backup for VMs",
    "policyRule": {
      "if": {
        "allOf": [
          { "field": "type", "equals": "Microsoft.Compute/virtualMachines" },
          { "field": "tags[Environment]", "equals": "Production" }
        ]
      },
      "then": {
        "effect": "deployIfNotExists",
        "details": { "type": "Microsoft.RecoveryServices/backups" }
      }
    }
  }
}`}
                      </pre>
                    </div>
                  </div>

                  {/* PIM Activations Log Table */}
                  <div className="glass-panel">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Privileged Identity Management (PIM) Activations</h3>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button className={`btn ${accessFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setAccessFilter('ALL')} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>All</button>
                        <button className={`btn ${accessFilter === 'Activated' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setAccessFilter('Activated')} style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>Active</button>
                      </div>
                    </div>

                    <div className="portal-table-wrapper">
                      <table className="portal-table">
                        <thead>
                          <tr>
                            <th>Principal Name</th>
                            <th>Role Name</th>
                            <th>Justification</th>
                            <th>State</th>
                            <th>Approved By</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredAccessLogs.map((l, i) => (
                            <tr key={i}>
                              <td style={{ fontWeight: 700 }}>{l.principalName}</td>
                              <td style={{ color: 'var(--azure-blue)', fontWeight: 600 }}>{l.roleName}</td>
                              <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>"{l.justification}"</td>
                              <td><span className={`badge ${l.pimStatus === 'Activated' ? 'badge-success' : 'badge-warning'}`}>{l.pimStatus}</span></td>
                              <td>{l.approvedBy}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Live Activity Logs Table */}
                  <div className="glass-panel">
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>Live Azure Activity Logs</h3>
                    <div className="portal-table-wrapper">
                      <table className="portal-table">
                        <thead>
                          <tr>
                            <th>Timestamp</th>
                            <th>Caller</th>
                            <th>Operation</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {liveActivityLogs.length > 0 ? (
                            liveActivityLogs.map((log, i) => (
                              <tr key={i}>
                                <td style={{ fontSize: '0.8rem' }}>{new Date(log.timestamp).toLocaleTimeString()}</td>
                                <td style={{ fontWeight: 600 }}>{log.caller}</td>
                                <td style={{ fontSize: '0.8rem' }}>{log.operationName}</td>
                                <td><span className={`badge badge-success`}>{log.status}</span></td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>No live activity logs returned. Verify HTTPS backend connection.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Runbooks */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Audited Security Incident Runbooks</h3>
                    {supportRunbooks.map((run, i) => (
                      <div key={i} className="glass-panel" style={{ padding: '1.25rem' }}>
                        <h4 style={{ color: 'var(--azure-blue)', fontWeight: 700, borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem', marginBottom: '0.75rem' }}>{run.title}</h4>
                        <div className="portal-table-wrapper">
                          <table className="portal-table">
                            <thead>
                              <tr>
                                <th style={{ width: '60px' }}>Step</th>
                                <th>Assigned Role</th>
                                <th>Action</th>
                                <th>Azure CLI Validation Command</th>
                              </tr>
                            </thead>
                            <tbody>
                              {run.steps.map((st, si) => (
                                <tr key={si}>
                                  <td style={{ fontWeight: 700 }}>{st.step}</td>
                                  <td style={{ color: 'var(--success)', fontWeight: 600 }}>{st.assignedRole}</td>
                                  <td>{st.action}</td>
                                  <td><code style={{ background: '#020617', padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', color: '#38bdf8' }}>{st.validationCommand}</code></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 4: ADMINISTRATOR WORKSPACE */}
              {activeTab === 'admin' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.25rem' }}>Global Administrator Workspace</h1>
                      <p style={{ color: 'var(--text-secondary)' }}>Enterprise systems settings, backend TLS/HTTPS keys tracking, MSAL authorization contexts, and diagnostic rate limit monitors.</p>
                    </div>
                    <div className="glass-panel" style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem' }}>
                      <div>Refresh: Every 60s</div>
                      <div>Updated: {lastUpdated}</div>
                    </div>
                  </header>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem' }}>
                    {/* TLS & SDK Diagnostic details */}
                    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Secure SSL/TLS Certificate Diagnostic</h3>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                          <span>Connection Protocol:</span>
                          <span style={{ color: 'var(--success)', fontWeight: 700 }}>HTTPS (TLS 1.3 Secure Session)</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                          <span>Common Name (CN):</span>
                          <code style={{ background: 'rgba(0,0,0,0.04)', padding: '0.15rem 0.35rem', borderRadius: '4px' }}>{azureStatus.commonName || 'app-hc-prod-backend.azurewebsites.net'}</code>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                          <span>Certificate Validation:</span>
                          <span style={{ color: 'var(--success)', fontWeight: 700 }}>{azureStatus.certificateValidation || 'Valid (DigiCert Trusted CA)'}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                          <span>SDK Auth Provider:</span>
                          <span style={{ color: 'var(--azure-blue)', fontWeight: 700 }}>DefaultAzureCredential</span>
                        </div>
                      </div>
                    </div>

                    {/* JWT Claims monitor */}
                    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Authorized MSAL Bearer Token Claims</h3>
                      <div className="cli-terminal" style={{ fontSize: '0.75rem', minHeight: '150px' }}>
                        <div>{`{`}</div>
                        <div style={{ paddingLeft: '1rem' }}>{`"iss": "https://sts.windows.net/808cc83e-a546-47e7-a03f-73a1ebba24f3/",`}</div>
                        <div style={{ paddingLeft: '1rem' }}>{`"upn": "${userEmail}",`}</div>
                        <div style={{ paddingLeft: '1rem' }}>{`"name": "${userName}",`}</div>
                        <div style={{ paddingLeft: '1rem' }}>{`"roles": ["${userRole}"],`}</div>
                        <div style={{ paddingLeft: '1rem' }}>{`"aud": "https://management.core.windows.net/",`}</div>
                        <div style={{ paddingLeft: '1rem' }}>{`"exp": ${Math.round(Date.now() / 1000) + 3600}`}</div>
                        <div>{`}`}</div>
                      </div>
                    </div>
                  </div>

                  {/* API performance and rate limits */}
                  <div className="glass-panel">
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>API Telemetry & Gateway Rate Limiter</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
                      <div style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 700 }}>GATEWAY LATENCY</div>
                        <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--azure-blue)', marginTop: '0.25rem' }}>
                          {apiLatency !== null ? `${apiLatency}ms` : 'Offline'}
                        </div>
                      </div>

                      <div style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 700 }}>RATE LIMIT CAP</div>
                        <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--success)', marginTop: '0.25rem' }}>200 req / 15m</div>
                      </div>

                      <div style={{ padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 700 }}>GATEWAY PORT</div>
                        <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--azure-blue)', marginTop: '0.25rem' }}>{azureStatus.gatewayPort || '443'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 5: LIVE AZURE STATUS */}
              {activeTab === 'azure-status' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                  <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.25rem' }}>Live Azure Integration Status</h1>
                      <p style={{ color: 'var(--text-secondary)' }}>Real-time subscription information and credentials validation status using DefaultAzureCredential.</p>
                    </div>
                    <div className="glass-panel" style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.15rem' }}>
                      <div>Refresh: Every 60s</div>
                      <div>Updated: {lastUpdated}</div>
                    </div>
                  </header>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
                    <div className="portal-metric-card" style={{ borderLeftColor: 'var(--azure-blue)', minHeight: '120px' }}>
                      <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Subscription ID</h3>
                      <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 700, wordBreak: 'break-all' }}>
                        {azureStatus.subscriptionId}
                      </div>
                    </div>

                    <div className="portal-metric-card" style={{ borderLeftColor: '#8b5cf6', minHeight: '120px' }}>
                      <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Tenant ID</h3>
                      <div style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 700, wordBreak: 'break-all' }}>
                        {azureStatus.tenantId}
                      </div>
                    </div>

                    <div className="portal-metric-card" style={{ borderLeftColor: azureStatus.authenticationStatus.startsWith('Authenticated') ? 'var(--success)' : 'var(--critical)', minHeight: '120px' }}>
                      <h3 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Authentication Status</h3>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem', color: azureStatus.authenticationStatus.startsWith('Authenticated') ? 'var(--success)' : 'var(--critical)' }}>
                        <span className="live-pulse-dot" style={{ background: azureStatus.authenticationStatus.startsWith('Authenticated') ? 'var(--success)' : 'var(--critical)' }} />
                        {azureStatus.authenticationStatus}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
                    <div className="glass-panel" style={{ textAlign: 'center', padding: '2rem' }}>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Total Active Resources</div>
                      <div style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--azure-blue)' }}>
                        <AnimatedCounter value={azureStatus.resourceCount} />
                      </div>
                    </div>

                    <div className="glass-panel" style={{ textAlign: 'center', padding: '2rem' }}>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Azure Region</div>
                      <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--success)', textTransform: 'uppercase', marginTop: '0.5rem' }}>
                        {azureStatus.azureRegion}
                      </div>
                    </div>

                    <div className="glass-panel" style={{ textAlign: 'center', padding: '2rem' }}>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Last Successful Refresh</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, marginTop: '1rem', fontFamily: 'monospace' }}>
                        {new Date(azureStatus.lastRefreshTimestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
