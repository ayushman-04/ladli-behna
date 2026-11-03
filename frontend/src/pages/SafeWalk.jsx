import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, useToast, useEmergency } from '../App'

const BackIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
)

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const ShieldIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
)

const ClockIcon = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)

const AlertTriangleIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
)

const UserCheckIcon = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="8.5" cy="7" r="4" />
    <polyline points="17 11 19 13 23 9" />
  </svg>
)

export default function SafeWalk() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { triggerEmergency } = useEmergency()

  // Active Journey State
  const [activeWalk, setActiveWalk] = useState(null)
  const [guardianTrail, setGuardianTrail] = useState([])
  const [trustedContacts, setTrustedContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  // Countdown Timers
  const [timeRemaining, setTimeRemaining] = useState(null)
  const [checkinRemaining, setCheckinRemaining] = useState(null)
  const [isCheckinDue, setIsCheckinDue] = useState(false)
  const [isGracePeriod, setIsGracePeriod] = useState(false)
  const [progressPercent, setProgressPercent] = useState(0)

  // Pre-Journey Configuration
  const [destName, setDestName] = useState('')
  const [etaMinutes, setEtaMinutes] = useState(20)
  const [journeyMode, setJourneyMode] = useState('protected') // 'relaxed' | 'protected' | 'high_support'
  const [checkinInterval, setCheckinInterval] = useState(15) // minutes
  const [gracePeriod, setGracePeriod] = useState(5) // minutes

  // Update interval defaults when mode changes
  const handleModeChange = (mode) => {
    setJourneyMode(mode)
    if (mode === 'relaxed') {
      setGracePeriod(10)
    } else if (mode === 'protected') {
      setCheckinInterval(15)
      setGracePeriod(5)
    } else if (mode === 'high_support') {
      setCheckinInterval(5)
      setGracePeriod(3)
    }
  }

  // Fetch active walk & initial data
  const checkActiveWalk = useCallback(async () => {
    try {
      const data = await apiFetch('/api/safewalk/active')
      if (data && data.safewalk) {
        setActiveWalk(data.safewalk)
        setGuardianTrail(data.trail || [])
        setTrustedContacts(data.contacts || [])
      } else {
        setActiveWalk(null)
        // Also fetch user contacts for preview in pre-journey mode
        try {
          const contactData = await apiFetch('/api/contacts')
          if (contactData && contactData.contacts) {
            setTrustedContacts(contactData.contacts)
          }
        } catch { /* ok */ }
      }
    } catch (err) {
      console.log('Error checking active walk:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    checkActiveWalk()
  }, [checkActiveWalk])

  // Periodic status poll (every 12 seconds when walk is active)
  useEffect(() => {
    if (!activeWalk) return
    const pollInterval = setInterval(async () => {
      try {
        const data = await apiFetch('/api/safewalk/active')
        if (data && data.safewalk) {
          setActiveWalk(data.safewalk)
          setGuardianTrail(data.trail || [])
        }
      } catch (err) {
        console.log('Poll sync error:', err)
      }
    }, 12000)
    return () => clearInterval(pollInterval)
  }, [activeWalk])

  // Dual countdown timers loop
  useEffect(() => {
    if (!activeWalk) return

    const timer = setInterval(() => {
      const now = new Date()
      const eta = new Date(activeWalk.eta)
      const createdAt = new Date(activeWalk.created_at)
      const totalDuration = eta - createdAt
      const elapsed = now - createdAt

      // Overall ETA countdown
      const diffEta = eta - now
      if (diffEta <= 0) {
        setTimeRemaining('OVERDUE')
        setProgressPercent(100)
        setIsGracePeriod(true)
      } else {
        const mins = Math.floor(diffEta / 60000)
        const secs = Math.floor((diffEta % 60000) / 1000)
        setTimeRemaining(`${mins}:${secs.toString().padStart(2, '0')}`)
        setIsGracePeriod(false)

        if (totalDuration > 0) {
          const pct = Math.min(100, Math.max(0, Math.round((elapsed / totalDuration) * 100)))
          setProgressPercent(pct)
        }
      }

      // Periodic Check-in countdown
      if (activeWalk.next_checkin_due) {
        const nextCheckin = new Date(activeWalk.next_checkin_due)
        const diffCheckin = nextCheckin - now
        if (diffCheckin <= 0) {
          setCheckinRemaining('CHECK-IN OVERDUE')
          setIsCheckinDue(true)
        } else {
          const mins = Math.floor(diffCheckin / 60000)
          const secs = Math.floor((diffCheckin % 60000) / 1000)
          setCheckinRemaining(`${mins}:${secs.toString().padStart(2, '0')}`)
          // Due soon if less than 2 minutes
          setIsCheckinDue(mins < 2)
        }
      } else {
        setCheckinRemaining(null)
        setIsCheckinDue(false)
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [activeWalk])

  // Start Journey
  const startWalk = async (e) => {
    e.preventDefault()
    setActionLoading(true)
    try {
      let lat = 0, lng = 0
      try {
        const pos = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 })
        )
        lat = pos.coords.latitude
        lng = pos.coords.longitude
      } catch {
        // Graceful non-blocking fallback
      }

      const payload = {
        dest_name: destName.trim(),
        dest_lat: lat,
        dest_lng: lng,
        eta_minutes: parseInt(etaMinutes, 10) || 20,
        mode: journeyMode,
        checkin_interval_minutes: journeyMode === 'relaxed' ? null : checkinInterval,
        grace_period_minutes: gracePeriod,
      }

      const data = await apiFetch('/api/safewalk/start', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      setActiveWalk(data.safewalk)
      setGuardianTrail(data.trail || [])
      setTrustedContacts(data.contacts || [])
      showToast('Smart Journey initiated! Stay safe.', 'success')
    } catch (err) {
      showToast(err.message || 'Failed to start journey', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Safety Confirmation / Check-in
  const handleCheckin = async () => {
    if (!activeWalk || actionLoading) return
    setActionLoading(true)
    try {
      const data = await apiFetch(`/api/safewalk/${activeWalk.id}/checkin`, { method: 'POST' })
      setActiveWalk(data.safewalk)
      setGuardianTrail(data.trail || [])
      showToast('Safety confirmed! Check-in updated.', 'success')
    } catch (err) {
      showToast(err.message || 'Failed to confirm safety', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Extend ETA
  const handleExtend = async (extraMinutes) => {
    if (!activeWalk || actionLoading) return
    setActionLoading(true)
    try {
      const data = await apiFetch(`/api/safewalk/${activeWalk.id}/extend`, {
        method: 'POST',
        body: JSON.stringify({ extra_minutes: extraMinutes }),
      })
      setActiveWalk(data.safewalk)
      setGuardianTrail(data.trail || [])
      showToast(`Expected arrival extended by ${extraMinutes} minutes.`, 'success')
    } catch (err) {
      showToast(err.message || 'Failed to extend ETA', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Complete Journey Safely
  const handleEndJourney = async () => {
    if (!activeWalk || actionLoading) return
    setActionLoading(true)
    try {
      await apiFetch(`/api/safewalk/${activeWalk.id}/end`, { method: 'POST' })
      showToast('Glad you reached safely! Journey marked complete.', 'success')
      setActiveWalk(null)
      setTimeRemaining(null)
      setCheckinRemaining(null)
      setGuardianTrail([])
    } catch (err) {
      showToast(err.message || 'Failed to complete journey', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  // Emergency SOS Distress Call
  const handleEmergencyHelp = async () => {
    if (!activeWalk) return
    try {
      let lat = activeWalk.dest_lat, lng = activeWalk.dest_lng
      try {
        const pos = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 })
        )
        lat = pos.coords.latitude
        lng = pos.coords.longitude
      } catch { /* ok */ }

      // 1. Notify backend SafeWalk emergency endpoint
      apiFetch(`/api/safewalk/${activeWalk.id}/help`, {
        method: 'POST',
        body: JSON.stringify({ latitude: lat, longitude: lng, message: 'Distress call from SafeWalk' }),
      }).then(res => {
        if (res && res.trail) setGuardianTrail(res.trail)
      }).catch(err => console.log('SafeWalk help endpoint call error:', err))

      // 2. Trigger global Emergency SOS workflow
      triggerEmergency('safewalk')
      showToast('Emergency alert triggered! Alerting guardians...', 'error')
    } catch (err) {
      showToast(err.message || 'Failed to trigger emergency', 'error')
    }
  }

  // Format Helper
  const formatTime = (isoString) => {
    if (!isoString) return '--:--'
    try {
      const date = new Date(isoString)
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return isoString
    }
  }

  // Helper for mode title and icon
  const getModeInfo = (mode) => {
    switch (mode) {
      case 'relaxed':
        return { label: 'Relaxed Journey', icon: '🍃', badgeClass: 'relaxed' }
      case 'high_support':
        return { label: 'High-Support Journey', icon: '⚡', badgeClass: 'high_support' }
      case 'protected':
      default:
        return { label: 'Protected Journey', icon: '🛡️', badgeClass: 'protected' }
    }
  }

  if (loading) {
    return (
      <div className="page-content page-enter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div className="spin" style={{ fontSize: '2rem' }} aria-hidden="true">🛡️</div>
      </div>
    )
  }

  const activeModeInfo = activeWalk ? getModeInfo(activeWalk.mode) : null

  return (
    <>
      <div className="page-abstract-bg safewalk" aria-hidden="true">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      <div className="page-content page-enter">
        {/* Page Header */}
        <div className="page-header">
          <button className="back-btn" onClick={() => navigate('/dashboard')} aria-label="Go back">
            <BackIcon />
          </button>
          <div style={{ flex: 1 }}>
            <span className="eyebrow" style={{ display: 'block', marginBottom: '2px' }}>Safety That Starts Before SOS</span>
            <h2 style={{ lineHeight: 1.1 }}>Smart Journey Protection</h2>
          </div>
        </div>

        {/* ========================================================
            VIEW A: ACTIVE JOURNEY DASHBOARD
           ======================================================== */}
        {activeWalk ? (
          <div className="safewalk-active slide-up" style={{ textAlign: 'left', padding: '10px 0' }}>
            {/* Top Status & Protection Mode Pill Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className={`journey-mode-badge ${activeModeInfo.badgeClass}`}>
                  {activeModeInfo.icon} {activeModeInfo.label}
                </span>
              </div>
              <div>
                {activeWalk.status === 'arrival_unconfirmed' || isGracePeriod ? (
                  <span className="status-pill unconfirmed">
                    <AlertTriangleIcon /> ARRIVAL UNCONFIRMED
                  </span>
                ) : isCheckinDue ? (
                  <span className="status-pill due">
                    <ClockIcon /> CHECK-IN DUE
                  </span>
                ) : (
                  <span className="status-pill active">
                    <CheckIcon /> ACTIVE JOURNEY
                  </span>
                )}
              </div>
            </div>

            {/* Destination & Meta Card */}
            <div className="glass-card-static" style={{ padding: '20px', marginBottom: '16px' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--muted-foreground)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: '4px' }}>
                Destination
              </p>
              <h3 style={{ fontSize: '1.45rem', marginBottom: '12px', color: 'var(--foreground)' }}>
                {activeWalk.dest_name}
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                <div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--muted-foreground)', display: 'block' }}>STARTED AT</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', fontWeight: 600 }}>{formatTime(activeWalk.created_at)}</span>
                </div>
                <div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--muted-foreground)', display: 'block' }}>EXPECTED ARRIVAL</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', fontWeight: 600, color: 'var(--accent)' }}>{formatTime(activeWalk.eta)}</span>
                </div>
                <div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--muted-foreground)', display: 'block' }}>GRACE WINDOW</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', fontWeight: 600 }}>{activeWalk.grace_period_minutes || 5} mins</span>
                </div>
              </div>
            </div>

            {/* Countdown Station Card */}
            <div className="glass-card-static" style={{ textAlign: 'center', padding: '24px 20px', marginBottom: '16px' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--muted-foreground)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>
                Remaining Journey Time
              </p>
              <div
                className={`safewalk-timer${timeRemaining === 'OVERDUE' ? ' text-red' : ''}`}
                role="timer"
                aria-live="polite"
                style={{ fontSize: '3.6rem', margin: '6px 0 10px 0' }}
              >
                {timeRemaining || '--:--'}
              </div>

              {/* Progress Bar */}
              <div className="safewalk-progress" aria-hidden="true" style={{ marginBottom: '16px' }}>
                <div
                  className="safewalk-progress-fill"
                  style={{
                    width: `${progressPercent}%`,
                    background: timeRemaining === 'OVERDUE' ? 'var(--red-light)' : isCheckinDue ? 'var(--amber)' : 'var(--emerald)'
                  }}
                />
              </div>

              {/* Periodic Check-in Countdown (for Protected & High-Support) */}
              {activeWalk.next_checkin_due && (
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 14px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                  <ClockIcon />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: isCheckinDue ? 'var(--amber)' : 'var(--foreground)' }}>
                    Next Check-In: <strong>{checkinRemaining || formatTime(activeWalk.next_checkin_due)}</strong>
                  </span>
                </div>
              )}
            </div>

            {/* Urgent Escalation / Check-in Alert Banners */}
            {(activeWalk.status === 'arrival_unconfirmed' || isGracePeriod) && (
              <div className="threat-indicator danger" style={{ marginBottom: '16px', textAlign: 'left' }} role="alert">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <AlertTriangleIcon />
                  <div>
                    <strong>Arrival Unconfirmed — Grace Period Active</strong>
                    <p style={{ fontSize: '0.78rem', marginTop: '3px', opacity: 0.9 }}>
                      Your expected arrival time has passed. Please confirm you are safe or extend your ETA immediately to avoid escalation to your trusted guardians.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {isCheckinDue && !(activeWalk.status === 'arrival_unconfirmed' || isGracePeriod) && (
              <div style={{ background: 'var(--amber-10)', border: '1px solid rgba(245,158,11,0.35)', color: 'var(--amber)', padding: '12px 14px', borderRadius: 'var(--radius)', marginBottom: '16px', fontSize: '0.82rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ClockIcon />
                  <span><strong>Periodic Check-In Window Open</strong>: Please confirm you are safe.</span>
                </div>
              </div>
            )}

            {/* Interactive Control Station */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {/* Check-In / Mark Safe */}
              <button
                id="safewalk-checkin-btn"
                className="btn btn-primary btn-full btn-lg"
                onClick={handleCheckin}
                disabled={actionLoading}
                style={{
                  background: 'var(--emerald)',
                  borderColor: 'var(--emerald)',
                  color: '#000',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <CheckIcon /> Confirm I&apos;m Safe
              </button>

              {/* Quick Extend ETA Buttons */}
              <div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--muted-foreground)', display: 'block', marginBottom: '6px', letterSpacing: '0.04em' }}>
                  NEED MORE TIME? EXTEND ARRIVAL:
                </span>
                <div className="quick-extend-group">
                  <button
                    className="quick-btn"
                    onClick={() => handleExtend(5)}
                    disabled={actionLoading}
                  >
                    +5 Mins
                  </button>
                  <button
                    className="quick-btn"
                    onClick={() => handleExtend(10)}
                    disabled={actionLoading}
                  >
                    +10 Mins
                  </button>
                  <button
                    className="quick-btn"
                    onClick={() => handleExtend(15)}
                    disabled={actionLoading}
                  >
                    +15 Mins
                  </button>
                </div>
              </div>

              {/* End Journey Safely */}
              <button
                id="safewalk-safe-btn"
                className="btn btn-secondary btn-full"
                onClick={handleEndJourney}
                disabled={actionLoading}
                style={{ borderColor: 'var(--border-hover)' }}
              >
                I Reached Safely (End Journey)
              </button>

              {/* Emergency SOS Distress Call */}
              <button
                id="safewalk-help-btn"
                className="btn btn-danger btn-full"
                onClick={handleEmergencyHelp}
                style={{ marginTop: '4px' }}
              >
                <AlertTriangleIcon /> Request Emergency Help
              </button>
            </div>

            {/* Authorized Trusted Guardians Card */}
            <div className="glass-card-static" style={{ marginBottom: '20px', padding: '18px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ShieldIcon /> Active Journey Guardians
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--emerald)' }}>
                  {trustedContacts.length} Assigned
                </span>
              </div>

              {trustedContacts.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {trustedContacts.map((contact, idx) => (
                    <div
                      key={contact.id || idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        background: 'rgba(0,0,0,0.2)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <UserCheckIcon />
                        <div>
                          <div style={{ fontSize: '0.84rem', fontWeight: 600 }}>{contact.name}</div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.70rem', color: 'var(--muted-foreground)' }}>
                            {contact.phone} {contact.relationship ? `• ${contact.relationship}` : ''}
                          </div>
                        </div>
                      </div>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--emerald)', background: 'var(--emerald-10)', padding: '2px 6px', borderRadius: 'var(--radius)' }}>
                        Guardian Active
                      </span>
                    </div>
                  ))}
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--muted-foreground)', marginTop: '4px' }}>
                    * Guardians will receive SMS alerts if arrival is unconfirmed after the {activeWalk.grace_period_minutes || 5}-minute grace period.
                  </p>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '10px 0' }}>
                  <p style={{ fontSize: '0.82rem', color: 'var(--muted-foreground)', marginBottom: '8px' }}>
                    No trusted contacts registered yet.
                  </p>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => navigate('/contacts')}
                  >
                    + Add Emergency Contacts
                  </button>
                </div>
              )}
            </div>

            {/* Guardian Trail (Journey Event Timeline) */}
            <div className="guardian-trail-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="eyebrow" style={{ display: 'block' }}>Guardian Trail (Audit Log)</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--accent)' }}>
                  Live Telemetry
                </span>
              </div>

              {guardianTrail.length > 0 ? (
                <div className="trail-timeline">
                  {guardianTrail.map((ev, index) => {
                    let dotClass = ''
                    if (ev.event_type === 'safety_confirmed' || ev.event_type === 'completed') dotClass = 'emerald'
                    else if (ev.event_type === 'arrival_unconfirmed') dotClass = 'amber'
                    else if (ev.event_type === 'escalation_dispatched' || ev.event_type === 'help_requested') dotClass = 'red'

                    return (
                      <div key={ev.id || index} className="trail-entry">
                        <div className={`trail-entry-dot ${dotClass}`} />
                        <div className="trail-header">
                          <span className="trail-title">{ev.title}</span>
                          <span className="trail-time">{formatTime(ev.created_at)}</span>
                        </div>
                        {ev.description && <p className="trail-desc">{ev.description}</p>}
                        {ev.metadata && ev.metadata.mode && (
                          <span className="trail-tag">Mode: {ev.metadata.mode}</span>
                        )}
                        {ev.metadata && ev.metadata.results && (
                          <span className="trail-tag">
                            SMS Status: {ev.metadata.results.some(r => r.sms_sent) ? 'Delivered' : 'Twilio Sandbox/Demo'}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p style={{ fontSize: '0.78rem', color: 'var(--muted-foreground)', marginTop: '10px' }}>
                  Journey initiated. Events will record in real-time.
                </p>
              )}
            </div>
          </div>
        ) : (
          /* ========================================================
             VIEW B: PRE-JOURNEY CONFIGURATION & START
             ======================================================== */
          <div className="slide-up">
            <div className="glass-card-static" style={{ marginBottom: '24px', textAlign: 'center', padding: '26px 20px' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.8rem', marginBottom: '10px', lineHeight: 1 }} aria-hidden="true">
                🛡️
              </div>
              <h3 style={{ marginBottom: '8px' }}>Proactive Journey Protection</h3>
              <p style={{ color: 'var(--muted-foreground)', fontSize: '0.84rem', lineHeight: 1.65 }}>
                Select your journey protection mode. Ladli Behna monitors your safe arrival and coordinates with your trusted contacts throughout your journey.
              </p>
            </div>

            <form onSubmit={startWalk}>
              {/* Destination */}
              <div className="form-group">
                <label className="form-label" htmlFor="sw-dest">Where are you going?</label>
                <input
                  id="sw-dest"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Home, Office, Metro Station"
                  value={destName}
                  onChange={e => setDestName(e.target.value)}
                  required
                />
              </div>

              {/* ETA Input & Quick Presets */}
              <div className="form-group">
                <label className="form-label" htmlFor="sw-eta">Expected Travel Time (minutes)</label>
                <input
                  id="sw-eta"
                  type="number"
                  className="form-input"
                  value={etaMinutes}
                  onChange={e => setEtaMinutes(parseInt(e.target.value, 10) || 15)}
                  min={1}
                  max={240}
                  required
                />
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                  {[15, 30, 45, 60].map(mins => (
                    <button
                      key={mins}
                      type="button"
                      className="quick-btn"
                      style={{ flex: 1, padding: '5px' }}
                      onClick={() => setEtaMinutes(mins)}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--muted-foreground)', marginTop: '6px', letterSpacing: '0.03em' }}>
                  Expected arrival around {new Date(Date.now() + etaMinutes * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>

              {/* Journey Protection Modes Selection */}
              <div className="form-group">
                <label className="form-label">Select Protection Mode</label>
                <div className="journey-modes-grid">
                  {/* Mode 1: Relaxed */}
                  <div
                    className={`journey-mode-card${journeyMode === 'relaxed' ? ' selected' : ''}`}
                    onClick={() => handleModeChange('relaxed')}
                    role="radio"
                    aria-checked={journeyMode === 'relaxed'}
                    tabIndex={0}
                  >
                    <div className="journey-mode-card-header">
                      <span className="journey-mode-title">🍃 Relaxed Journey</span>
                      <span className="journey-mode-badge relaxed">Passive ETA</span>
                    </div>
                    <p className="journey-mode-desc">
                      Ideal for familiar daytime routes. Monitors your destination arrival time with zero periodic check-in interruptions.
                    </p>
                    <div className="mode-config-row">
                      <span className="mode-config-chip">No periodic check-in</span>
                      <span className="mode-config-chip">Grace Period: 10 mins</span>
                      <span className="mode-config-chip">Overdue Detection</span>
                    </div>
                  </div>

                  {/* Mode 2: Protected */}
                  <div
                    className={`journey-mode-card${journeyMode === 'protected' ? ' selected' : ''}`}
                    onClick={() => handleModeChange('protected')}
                    role="radio"
                    aria-checked={journeyMode === 'protected'}
                    tabIndex={0}
                  >
                    <div className="journey-mode-card-header">
                      <span className="journey-mode-title">🛡️ Protected Journey (Recommended)</span>
                      <span className="journey-mode-badge protected">Periodic Check-In</span>
                    </div>
                    <p className="journey-mode-desc">
                      Balanced proactive safety for evening commutes. Prompts you to confirm safety at configurable intervals.
                    </p>
                    <div className="mode-config-row">
                      <label style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)' }}>Interval:</label>
                      <select
                        className="form-input"
                        style={{ padding: '2px 6px', fontSize: '0.72rem', width: 'auto' }}
                        value={checkinInterval}
                        onChange={(e) => setCheckinInterval(parseInt(e.target.value, 10))}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <option value={10}>Every 10 mins</option>
                        <option value={15}>Every 15 mins</option>
                        <option value={20}>Every 20 mins</option>
                      </select>
                      <span className="mode-config-chip">Grace: 5 mins</span>
                    </div>
                  </div>

                  {/* Mode 3: High-Support */}
                  <div
                    className={`journey-mode-card${journeyMode === 'high_support' ? ' selected' : ''}`}
                    onClick={() => handleModeChange('high_support')}
                    role="radio"
                    aria-checked={journeyMode === 'high_support'}
                    tabIndex={0}
                  >
                    <div className="journey-mode-card-header">
                      <span className="journey-mode-title">⚡ High-Support Journey</span>
                      <span className="journey-mode-badge high_support">Rapid Escalation</span>
                    </div>
                    <p className="journey-mode-desc">
                      Maximum vigilance for late-night or unfamiliar transit. High-frequency check-ins and rapid guardian escalation.
                    </p>
                    <div className="mode-config-row">
                      <label style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)' }}>Interval:</label>
                      <select
                        className="form-input"
                        style={{ padding: '2px 6px', fontSize: '0.72rem', width: 'auto' }}
                        value={checkinInterval}
                        onChange={(e) => setCheckinInterval(parseInt(e.target.value, 10))}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <option value={3}>Every 3 mins</option>
                        <option value={5}>Every 5 mins</option>
                        <option value={10}>Every 10 mins</option>
                      </select>
                      <span className="mode-config-chip">Grace: 3 mins</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Trusted Guardians Readiness Card */}
              <div className="glass-card-static" style={{ marginBottom: '20px', padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--foreground)' }}>
                    🛡️ Emergency Escalation Contacts
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: trustedContacts.length > 0 ? 'var(--emerald)' : 'var(--amber)' }}>
                    {trustedContacts.length > 0 ? `${trustedContacts.length} Ready` : 'No Contacts Added'}
                  </span>
                </div>
                <p style={{ fontSize: '0.74rem', color: 'var(--muted-foreground)', marginTop: '4px', lineHeight: 1.4 }}>
                  {trustedContacts.length > 0
                    ? `Guardians (${trustedContacts.map(c => c.name).slice(0, 2).join(', ')}${trustedContacts.length > 2 ? '...' : ''}) will be automatically notified if arrival remains unconfirmed.`
                    : 'Add trusted emergency contacts in your profile so they can be notified if you do not check in.'}
                </p>
              </div>

              {/* Submit Button */}
              <button
                id="safewalk-start-btn"
                type="submit"
                className="btn btn-primary btn-full btn-lg"
                disabled={actionLoading}
              >
                {actionLoading ? 'Initiating Safe Journey...' : 'Start Safe Journey'}
              </button>
            </form>

            {/* How It Works Educational Card */}
            <div className="glass-card-static" style={{ marginTop: '24px' }}>
              <span className="eyebrow" style={{ display: 'block', marginBottom: '10px' }}>How Proactive Journey Protection Works</span>
              <ol style={{ paddingLeft: '18px', color: 'var(--muted-foreground)', fontSize: '0.82rem', lineHeight: '1.9', fontFamily: 'var(--font-sans)' }}>
                <li>Select destination, expected arrival time, and desired protection level.</li>
                <li>Your live <strong>Guardian Trail</strong> logs every safety event and check-in timestamp.</li>
                <li>Confirm safety with one tap whenever prompted or easily extend your ETA if delayed.</li>
                <li>If arrival remains unconfirmed after the grace window, escalation alerts are dispatched to your trusted contacts.</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
