import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch, useAuth, useEmergency } from '../App'

/* ── Inline SVG icons ───────────────────────────────── */
const ShieldIcon = () => (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l7 4v5c0 4.97-3.13 9.28-7 11-3.87-1.72-7-6.03-7-11V6l7-4z" />
  </svg>
)
const MapIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
    <line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" />
  </svg>
)
const WalkIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="4" r="1.5" />
    <path d="M7 21l2-7-2-3h6l-2 3 2 7" />
    <path d="M10 11l1-3 3 2" />
  </svg>
)
const AlertIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)
const LogoutIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
)

/* ── Scroll reveal hook ─────────────────────────────── */
function useScrollReveal() {
  const refs = useRef([])
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible')
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -30px 0px' }
    )
    refs.current.forEach(el => { if (el) observer.observe(el) })
    return () => observer.disconnect()
  }, [])
  const addRef = (el) => {
    if (el && !refs.current.includes(el)) refs.current.push(el)
  }
  return addRef
}



/* ── Dashboard ───────────────────────────────────────── */
export default function Dashboard() {
  const { user, logout } = useAuth()
  const { triggerEmergency } = useEmergency()
  const navigate = useNavigate()
  const [incidents, setIncidents] = useState([])
  const [shieldActive] = useState(false)
  const addRef = useScrollReveal()

  useEffect(() => {
    loadIncidents()
  }, [])

  const loadIncidents = async () => {
    try {
      const data = await apiFetch('/api/audio/history')
      setIncidents(data.incidents || [])
    } catch (err) {
      console.log('Could not load incidents:', err)
    }
  }

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <>
      {/* Abstract background */}
      <div className="page-abstract-bg dashboard" aria-hidden="true">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <div className="dot-grid" />
      </div>

      <div className="page-content page-enter">
        {/* Header */}
        <header className="dashboard-header reveal" ref={addRef}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p className="greeting eyebrow" style={{ marginBottom: '6px' }}>
                {getGreeting()}
              </p>
              <h1>{user?.name?.split(' ')[0]}</h1>
            </div>
            <button
              className="btn btn-ghost btn-sm btn-icon"
              onClick={logout}
              title="Log out"
              aria-label="Log out"
            >
              <LogoutIcon />
            </button>
          </div>

          <div className={`status-badge ${shieldActive ? 'active-status' : 'safe'}`}>
            <span className="status-dot" aria-hidden="true" />
            {shieldActive ? 'Shield Active' : 'All Clear'}
          </div>
        </header>

        {/* Shield Button */}
        <div className="shield-btn-container reveal reveal-delay-1" ref={addRef}>
          <button
            className={`shield-btn ${shieldActive ? 'active' : ''}`}
            onClick={() => navigate('/shield')}
            aria-label="Open Shield Mode"
          >
            <ShieldIcon />
            <span style={{ marginTop: '4px' }}>{shieldActive ? 'ACTIVE' : 'SHIELD'}</span>
          </button>
        </div>

        <p className="text-secondary reveal reveal-delay-2" ref={addRef}
          style={{ textAlign: 'center', marginBottom: '28px', fontSize: '0.82rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
          Tap to activate AI-powered protection
        </p>

        {/* Quick Actions */}
        <section aria-label="Quick actions">
          <div className="quick-actions">
            {[
              { to: '/shield',   icon: <ShieldIcon />, title: 'Shield Mode', desc: 'AI audio monitoring',  id: 'action-shield', delay: 'reveal-delay-1' },
              { to: '/map',      icon: <MapIcon />,    title: 'Safety Map',  desc: 'Nearby safe zones',   id: 'action-map',    delay: 'reveal-delay-2' },
              { to: '/safewalk', icon: <WalkIcon />,   title: 'SafeWalk',    desc: 'Virtual companion',   id: 'action-safewalk',delay: 'reveal-delay-3'},
            ].map(({ to, icon, title, desc, id, delay }) => (
              <Link key={to} to={to} className={`action-card reveal ${delay}`} id={id} ref={addRef}>
                <span className="action-icon">{icon}</span>
                <span className="action-title">{title}</span>
                <span className="action-desc">{desc}</span>
              </Link>
            ))}

            <button
              id="action-sos"
              className="action-card reveal reveal-delay-4"
              ref={addRef}
              onClick={() => triggerEmergency('manual')}
              style={{ border: '1px solid var(--red-border)' }}
              aria-label="Trigger SOS emergency alert"
            >
              <span className="action-icon" style={{ color: 'var(--red-light)' }}><AlertIcon /></span>
              <span className="action-title" style={{ color: 'var(--red-light)' }}>SOS</span>
              <span className="action-desc">Emergency alert</span>
            </button>
          </div>
        </section>

        {/* Recent Activity */}
        <section className="recent-section" aria-label="Recent activity">
          <span className="eyebrow reveal reveal-delay-1" ref={addRef} style={{ marginBottom: '14px', display: 'block' }}>
            Recent Activity
          </span>

          {incidents.length === 0 ? (
            <div className="empty-state reveal reveal-delay-2" ref={addRef}>
              <div className="empty-icon" aria-hidden="true">✦</div>
              <p>No incidents — you&apos;re safe!</p>
            </div>
          ) : (
            incidents.slice(0, 5).map((incident, idx) => (
              <div
                key={incident.id}
                className={`incident-item reveal reveal-delay-${Math.min(idx + 1, 6)}`}
                ref={addRef}
              >
                <div className="incident-icon" aria-hidden="true">
                  {incident.type === 'audio' ? '🎙' : incident.type === 'shake' ? '📳' : '🚨'}
                </div>
                <div className="incident-info">
                  <div className="incident-type">
                    {incident.type === 'audio' ? 'Audio Alert'
                     : incident.type === 'shake' ? 'Motion Alert'
                     : 'Manual SOS'}
                  </div>
                  <div className="incident-time">{formatTime(incident.created_at)}</div>
                </div>
                <span className={`incident-level ${incident.threat_level?.toLowerCase()}`}>
                  {incident.threat_level}
                </span>
              </div>
            ))
          )}
        </section>
      </div>
    </>
  )
}
