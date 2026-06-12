// ============================================================
// Enterprise Login Page — Azure Portal Style
// ============================================================

import { useState } from 'react';
import { useAuth } from '../providers/AuthProvider';
import { Lock, Shield, CheckCircle } from 'lucide-react';

export default function Login() {
  const { login, isLoading } = useAuth();
  const [isSigningIn, setIsSigningIn] = useState(false);

  const handleMicrosoftLogin = async () => {
    setIsSigningIn(true);
    try {
      await login();
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="login-page">
      {/* Background decoration */}
      <div className="login-bg-decor" />

      {/* Left panel — Branding */}
      <div className="login-left">
        <div className="login-logo">
          <div className="login-logo-icon">
            <span className="b1" /><span className="b2" />
            <span className="b3" /><span className="b4" />
          </div>
          <div>
            <div className="login-logo-text">Azure CloudOps</div>
            <div className="login-logo-sub">ENTERPRISE PORTAL</div>
          </div>
        </div>

        <h1 className="login-tagline">
          Intelligent Cloud<br />
          Operations for<br />
          <span>Azure Enterprises</span>
        </h1>

        <p className="login-desc">
          Unified governance, real-time monitoring, and security management
          across all your Azure subscriptions — powered by Microsoft Entra ID.
        </p>

        <div className="login-features">
          {[
            'Real-time Azure resource discovery',
            'Microsoft Defender for Cloud integration',
            'Cost optimization & budget tracking',
            'Compliance & governance dashboards',
            'Azure Monitor & Sentinel alerts',
            'Multi-subscription management',
          ].map(feature => (
            <div key={feature} className="login-feature">
              <div className="login-feature-dot" />
              <span>{feature}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel — Sign in card */}
      <div className="login-right">
        <div className="login-card">
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #0078d4, #00B7C3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              boxShadow: '0 8px 24px rgba(0,120,212,0.35)',
            }}>
              <Shield size={26} color="white" strokeWidth={1.8} />
            </div>
            <div className="login-card-title">Secure Sign In</div>
            <div className="login-card-subtitle">
              Sign in with your Microsoft account to access<br />
              your Azure CloudOps enterprise dashboard.
            </div>
          </div>

          {/* Microsoft Sign in Button */}
          <button
            id="btn-microsoft-signin"
            className="login-microsoft-btn"
            onClick={handleMicrosoftLogin}
            disabled={isLoading || isSigningIn}
            aria-label="Sign in with Microsoft"
          >
            {isLoading || isSigningIn ? (
              <>
                <div className="spinner spinner-sm" style={{ borderColor: 'rgba(255,255,255,.3)', borderTopColor: 'white' }} />
                <span>Authenticating…</span>
              </>
            ) : (
              <>
                <div className="login-microsoft-icon">
                  <span className="q1" /><span className="q2" />
                  <span className="q3" /><span className="q4" />
                </div>
                <span>Sign in with Microsoft</span>
              </>
            )}
          </button>

          {/* Trust & compliance badges */}
          <div className="login-trust-badges">
            {[
              { icon: <Lock size={12} />, label: 'Entra ID' },
              { icon: <Shield size={12} />, label: 'Zero Trust' },
              { icon: <CheckCircle size={12} />, label: 'MFA Ready' },
            ].map(badge => (
              <div key={badge.label} className="login-trust-badge">
                {badge.icon}
                <span>{badge.label}</span>
              </div>
            ))}
          </div>

          <p style={{
            fontSize: 11.5,
            color: 'var(--text-tertiary)',
            textAlign: 'center',
            marginTop: 20,
            lineHeight: 1.6,
          }}>
            By signing in you agree to your organization's<br />
            terms of service and acceptable use policy.
          </p>
        </div>
      </div>
    </div>
  );
}
