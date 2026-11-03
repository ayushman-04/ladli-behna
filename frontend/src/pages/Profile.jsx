import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, useAuth, useToast } from '../App'
import { validateIndianMobile } from './Contacts'

/* ── Inline SVG Icons ─────────────────────────────────── */
const BackIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
)

const ShieldCheckIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
)

const KeyIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="M10.5 12.5L21 2" />
    <path d="M17 6l3 3" />
    <path d="M14 9l2 2" />
  </svg>
)

const UsersIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)

const MapPinIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
)

const EyeIcon = ({ visible }) => visible ? (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
) : (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
)

export default function Profile() {
  const navigate = useNavigate()
  const { user: authUser, updateAuthUser } = useAuth()
  const { showToast } = useToast()

  const [profile, setProfile] = useState(null)
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editMode, setEditMode] = useState(false)

  // Form states
  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formSafeWord, setFormSafeWord] = useState('')
  const [errors, setErrors] = useState({})
  const [showSafeWord, setShowSafeWord] = useState(false)

  // Confirmation modal for safe word updates
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [pendingPayload, setPendingPayload] = useState(null)

  // Browser Geolocation permission state
  const [geoPermission, setGeoPermission] = useState('checking') // checking | granted | prompt | denied | unsupported

  const loadProfileData = useCallback(async () => {
    setLoading(true)
    try {
      const [profileData, contactsData] = await Promise.all([
        apiFetch('/api/me'),
        apiFetch('/api/contacts').catch(() => ({ contacts: [] }))
      ])

      const u = profileData.user || {}
      setProfile(u)
      setFormName(u.name || '')
      setFormPhone(u.phone || '')
      setFormSafeWord(u.safe_word || '')
      setContacts(contactsData.contacts || [])
    } catch (err) {
      showToast(err.message || 'Failed to load profile', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    loadProfileData()
  }, [])

  // Query actual browser geolocation permissions dynamically
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' })
        .then((permissionStatus) => {
          setGeoPermission(permissionStatus.state)
          permissionStatus.onchange = () => {
            setGeoPermission(permissionStatus.state)
          }
        })
        .catch(() => setGeoPermission('unsupported'))
    } else if (typeof navigator !== 'undefined' && !navigator.geolocation) {
      setGeoPermission('unsupported')
    } else {
      setGeoPermission('prompt')
    }
  }, [])

  const getInitials = (nameStr) => {
    if (!nameStr) return 'LB'
    return nameStr.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  const formatCreationDate = (dateStr) => {
    if (!dateStr) return 'Recently'
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      })
    } catch {
      return String(dateStr).slice(0, 10)
    }
  }

  const handleEditToggle = () => {
    if (editMode) {
      // Cancel edit mode: reset values to current profile
      setFormName(profile?.name || '')
      setFormPhone(profile?.phone || '')
      setFormSafeWord(profile?.safe_word || '')
      setErrors({})
      setEditMode(false)
    } else {
      setEditMode(true)
    }
  }

  const validateForm = () => {
    const errs = {}
    const trimmedName = formName.trim()
    if (!trimmedName) {
      errs.name = 'Full name is required.'
    }

    const trimmedPhone = formPhone.trim()
    if (trimmedPhone) {
      const phoneRes = validateIndianMobile(trimmedPhone)
      if (!phoneRes.valid) {
        errs.phone = phoneRes.error
      }
    }

    setErrors(errs)
    return { valid: Object.keys(errs).length === 0, trimmedName, trimmedPhone }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const { valid, trimmedName, trimmedPhone } = validateForm()
    if (!valid) {
      showToast('Please fix the validation errors before saving.', 'error')
      return
    }

    const normalizedPhone = trimmedPhone
      ? validateIndianMobile(trimmedPhone).normalized
      : null

    const payload = {
      name: trimmedName,
      phone: normalizedPhone,
      safe_word: formSafeWord.trim() || null,
    }

    // Check if safe word was altered
    const oldSafeWord = (profile?.safe_word || '').trim()
    const newSafeWord = (formSafeWord || '').trim()
    const safeWordChanged = oldSafeWord !== newSafeWord

    if (safeWordChanged) {
      // Sensitive change confirmation
      setPendingPayload(payload)
      setShowConfirmModal(true)
    } else {
      executeProfileUpdate(payload)
    }
  }

  const executeProfileUpdate = async (payload) => {
    setSaving(true)
    try {
      const res = await apiFetch('/api/me', {
        method: 'PUT',
        body: JSON.stringify(payload),
      })

      const updated = res.user
      setProfile(updated)
      setFormName(updated.name || '')
      setFormPhone(updated.phone || '')
      setFormSafeWord(updated.safe_word || '')
      setEditMode(false)
      setErrors({})

      if (updateAuthUser) {
        updateAuthUser(updated)
      }

      showToast('Profile and preferences updated successfully!', 'success')
    } catch (err) {
      showToast(err.message || 'Failed to update profile', 'error')
    } finally {
      setSaving(false)
      setShowConfirmModal(false)
      setPendingPayload(null)
    }
  }

  return (
    <>
      <div className="page-abstract-bg contacts" aria-hidden="true">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <div className="dot-grid" />
      </div>

      <div className="page-content page-enter profile-page" style={{ paddingBottom: '90px' }}>
        {/* Page Header */}
        <div className="page-header" style={{ marginBottom: '18px' }}>
          <button className="back-btn" onClick={() => navigate('/dashboard')} aria-label="Go back to Dashboard">
            <BackIcon />
          </button>
          <div style={{ flex: 1 }}>
            <span className="eyebrow" style={{ display: 'block', marginBottom: '2px' }}>Account &amp; Security</span>
            <h2 style={{ lineHeight: 1.1 }}>Profile &amp; Safety</h2>
          </div>
          <button
            id="profile-toggle-edit-btn"
            className={`btn btn-sm ${editMode ? 'btn-outline' : 'btn-primary'}`}
            onClick={handleEditToggle}
            disabled={loading || saving}
          >
            {editMode ? 'Cancel' : 'Edit Profile'}
          </button>
        </div>

        {loading ? (
          <div className="empty-state" style={{ minHeight: '300px' }}>
            <div className="spin" style={{ fontSize: '2rem' }} aria-hidden="true">⟳</div>
            <p style={{ marginTop: '12px' }}>Loading profile &amp; safety preferences…</p>
          </div>
        ) : (
          <>
            {/* User Overview Hero Card */}
            <div className="glass-card-static" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div
                style={{
                  width: '58px',
                  height: '58px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(236,168,214,0.3), rgba(244,63,94,0.2))',
                  border: '2px solid rgba(236,168,214,0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: 700,
                  fontSize: '1.25rem',
                  color: 'var(--accent)',
                  boxShadow: '0 0 18px rgba(236,168,214,0.2)',
                  flexShrink: 0
                }}
              >
                {getInitials(profile?.name || authUser?.name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontSize: '1.15rem', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {profile?.name || 'User'}
                </h3>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--muted-foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '4px' }}>
                  {profile?.email}
                </p>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="status-badge safe" style={{ fontSize: '0.64rem', padding: '2px 8px' }}>
                    <span className="status-dot" aria-hidden="true" /> Verified Identity
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--muted-foreground)' }}>
                    Member since {formatCreationDate(profile?.created_at)}
                  </span>
                </div>
              </div>
            </div>

            {/* Profile Information / Edit Form */}
            <form onSubmit={handleSubmit} noValidate style={{ marginBottom: '20px' }}>
              <div className="glass-card-static" style={{ marginBottom: '16px' }}>
                <span className="eyebrow" style={{ display: 'block', marginBottom: '14px' }}>Personal Details</span>

                {/* Full Name */}
                <div className="form-group">
                  <label className="form-label" htmlFor="profile-name">Full Name</label>
                  {editMode ? (
                    <>
                      <input
                        id="profile-name"
                        type="text"
                        className="form-input"
                        placeholder="Your full name"
                        value={formName}
                        onChange={e => {
                          setFormName(e.target.value)
                          if (errors.name) setErrors(prev => ({ ...prev, name: null }))
                        }}
                        required
                      />
                      {errors.name && <div className="form-error" role="alert">{errors.name}</div>}
                    </>
                  ) : (
                    <div style={{ fontSize: '0.92rem', fontWeight: 500, padding: '4px 0' }}>
                      {profile?.name || 'Not set'}
                    </div>
                  )}
                </div>

                {/* Email (Read-Only) */}
                <div className="form-group">
                  <label className="form-label" htmlFor="profile-email">
                    Email Address <span style={{ textTransform: 'none', fontWeight: 400 }}>(cannot be changed)</span>
                  </label>
                  <input
                    id="profile-email"
                    type="email"
                    className="form-input"
                    value={profile?.email || ''}
                    disabled
                    style={{ opacity: 0.7, cursor: 'not-allowed' }}
                  />
                </div>

                {/* Mobile Number */}
                <div className="form-group" style={{ marginBottom: editMode ? '18px' : '4px' }}>
                  <label className="form-label" htmlFor="profile-phone">
                    Mobile Number {editMode && <span style={{ textTransform: 'none', fontWeight: 400 }}>(Indian 10-digit)</span>}
                  </label>
                  {editMode ? (
                    <>
                      <input
                        id="profile-phone"
                        type="tel"
                        className="form-input"
                        placeholder="e.g. 9876543210 or +91 9876543210"
                        value={formPhone}
                        onChange={e => {
                          setFormPhone(e.target.value)
                          if (errors.phone) setErrors(prev => ({ ...prev, phone: null }))
                        }}
                      />
                      {errors.phone && <div className="form-error" role="alert">{errors.phone}</div>}
                    </>
                  ) : (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.88rem', padding: '4px 0' }}>
                      {profile?.phone || <span style={{ color: 'var(--muted-foreground)', fontStyle: 'italic' }}>No phone number added</span>}
                    </div>
                  )}
                </div>

                {/* Safe Word field (in edit mode) */}
                {editMode && (
                  <div className="form-group" style={{ marginBottom: '18px' }}>
                    <label className="form-label" htmlFor="profile-safeword">
                      Emergency Safe Word <span style={{ textTransform: 'none', fontWeight: 400 }}>(Sensitive safety trigger)</span>
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        id="profile-safeword"
                        type={showSafeWord ? 'text' : 'password'}
                        className="form-input"
                        placeholder="e.g. Lotus, RedMoon"
                        value={formSafeWord}
                        onChange={e => setFormSafeWord(e.target.value)}
                        style={{ paddingRight: '40px' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSafeWord(!showSafeWord)}
                        style={{
                          position: 'absolute',
                          right: '10px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          color: 'var(--muted-foreground)',
                          cursor: 'pointer',
                          padding: '4px'
                        }}
                        aria-label={showSafeWord ? 'Hide safe word' : 'Show safe word'}
                      >
                        <EyeIcon visible={showSafeWord} />
                      </button>
                    </div>
                    <p style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', marginTop: '5px', lineHeight: 1.4 }}>
                      Used during audio surveillance or distress check-ins. Keep this secret between you and trusted guardians.
                    </p>
                  </div>
                )}

                {/* Save Button (edit mode) */}
                {editMode && (
                  <button
                    id="profile-save-btn"
                    type="submit"
                    className="btn btn-safe btn-full"
                    disabled={saving}
                    style={{ marginTop: '8px' }}
                  >
                    {saving ? 'Saving Changes…' : 'Save Profile Changes'}
                  </button>
                )}
              </div>
            </form>

            {/* Safety Preferences Section */}
            <div style={{ marginTop: '24px' }}>
              <span className="eyebrow" style={{ display: 'block', marginBottom: '12px' }}>Safety Preferences</span>

              {/* Safe Word Display Card (view mode) */}
              {!editMode && (
                <div className="glass-card-static" style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: 'var(--accent)' }}><KeyIcon /></span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Personal Safe Word</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowSafeWord(!showSafeWord)}
                      style={{ padding: '3px 8px', fontSize: '0.72rem' }}
                    >
                      {showSafeWord ? 'Hide' : 'Reveal'}
                    </button>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--muted-foreground)', marginBottom: '10px', lineHeight: 1.5 }}>
                    Spoken or texted during audio monitoring or check-in to confirm safety or trigger silent distress.
                  </p>
                  <div
                    style={{
                      background: 'rgba(20,8,16,0.6)',
                      border: '1px solid rgba(236,168,214,0.18)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.88rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <span>
                      {profile?.safe_word
                        ? (showSafeWord ? profile.safe_word : '••••••••')
                        : <span style={{ color: 'var(--muted-foreground)', fontStyle: 'italic' }}>No safe word configured</span>
                      }
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setEditMode(true)}
                      style={{ fontSize: '0.72rem', color: 'var(--accent)' }}
                    >
                      Change
                    </button>
                  </div>
                </div>
              )}

              {/* Emergency Contacts Overview */}
              <div className="glass-card-static" style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'var(--accent)' }}><UsersIcon /></span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Emergency Contact Network</span>
                  </div>
                  <span className="status-badge safe" style={{ fontSize: '0.66rem' }}>
                    {contacts.length} {contacts.length === 1 ? 'Contact' : 'Contacts'}
                  </span>
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--muted-foreground)', marginBottom: '12px', lineHeight: 1.5 }}>
                  These trusted people receive SMS alerts with your real-time GPS location during an emergency.
                </p>

                {contacts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--muted-foreground)', fontSize: '0.8rem' }}>
                    <p>No emergency contacts added yet.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                    {contacts.slice(0, 3).map(c => (
                      <div
                        key={c.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: 'rgba(20,8,16,0.4)',
                          padding: '7px 12px',
                          borderRadius: '8px',
                          fontSize: '0.82rem'
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>{c.name}</span>
                        <span style={{ color: 'var(--muted-foreground)', fontSize: '0.74rem' }}>{c.relationship}</span>
                      </div>
                    ))}
                    {contacts.length > 3 && (
                      <p style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', textAlign: 'center' }}>
                        +{contacts.length - 3} more contacts configured
                      </p>
                    )}
                  </div>
                )}

                <button
                  id="profile-manage-contacts-btn"
                  className="btn btn-outline btn-full"
                  onClick={() => navigate('/contacts')}
                  style={{ fontSize: '0.82rem', marginTop: '6px' }}
                >
                  Manage Emergency Contacts &rarr;
                </button>
              </div>

              {/* Location Permission Status (Real dynamic browser query) */}
              <div className="glass-card-static" style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: 'var(--accent)' }}><MapPinIcon /></span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Location Permission</span>
                  </div>
                  {geoPermission === 'granted' && (
                    <span className="status-badge safe" style={{ fontSize: '0.66rem' }}>
                      <span className="status-dot" aria-hidden="true" /> Granted
                    </span>
                  )}
                  {geoPermission === 'prompt' && (
                    <span className="status-badge" style={{ fontSize: '0.66rem', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                      Ask on Demand
                    </span>
                  )}
                  {geoPermission === 'denied' && (
                    <span className="status-badge" style={{ fontSize: '0.66rem', background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                      Denied
                    </span>
                  )}
                  {geoPermission === 'unsupported' && (
                    <span className="status-badge" style={{ fontSize: '0.66rem', color: 'var(--muted-foreground)' }}>
                      Not Supported
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '0.78rem', color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
                  {geoPermission === 'granted' && 'Live GPS telemetry is active for SafeWalk, Emergency SOS, and Safety Map spatial queries.'}
                  {geoPermission === 'prompt' && 'Your browser will prompt for geolocation permissions when an emergency or map session starts.'}
                  {geoPermission === 'denied' && 'Microphone/GPS permission was blocked. Please enable location permissions in browser site settings to transmit live coordinates during SOS.'}
                  {geoPermission === 'unsupported' && 'Geolocation API is not available on this device.'}
                </p>
                <div style={{ marginTop: '8px', fontSize: '0.72rem', color: 'var(--muted-foreground)', fontStyle: 'italic' }}>
                  ℹ️ Browser security requires location permission to be granted in your browser settings.
                </div>
              </div>

              {/* Emergency Channels Overview (Supported Features Only) */}
              <div className="glass-card-static">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <span style={{ color: 'var(--accent)' }}><ShieldCheckIcon /></span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Emergency Channels</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600 }}>Twilio SMS Dispatch</div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--muted-foreground)' }}>Automatic SMS with live location to emergency contacts</div>
                    </div>
                    <span className="status-badge safe" style={{ fontSize: '0.64rem' }}>Supported</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600 }}>WhatsApp Emergency Link</div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--muted-foreground)' }}>One-click direct WhatsApp pre-filled message generation</div>
                    </div>
                    <span className="status-badge safe" style={{ fontSize: '0.64rem' }}>Active</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600 }}>Police Helpline Notification</div>
                      <div style={{ fontSize: '0.74rem', color: 'var(--muted-foreground)' }}>Option to alert police liaison during SOS</div>
                    </div>
                    <span className="status-badge" style={{ fontSize: '0.64rem', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>Optional</span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Sensitive Change Confirmation Modal (Safe Word) */}
        {showConfirmModal && (
          <div className="emergency-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
            <div className="emergency-modal" style={{ maxWidth: '380px' }}>
              <div className="emergency-icon" aria-hidden="true" style={{ fontSize: '2rem', marginBottom: '8px' }}>🔐</div>
              <h3 id="confirm-modal-title" style={{ fontSize: '1.1rem', marginBottom: '8px' }}>Confirm Safe Word Update</h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--muted-foreground)', lineHeight: 1.6, marginBottom: '16px' }}>
                Your safe word is a sensitive safety credential used to verify distress or trigger automated intervention. Are you sure you want to change it?
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => { setShowConfirmModal(false); setPendingPayload(null) }}
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-safe"
                  onClick={() => executeProfileUpdate(pendingPayload)}
                  disabled={saving}
                  style={{ flex: 1 }}
                >
                  {saving ? 'Updating…' : 'Confirm Update'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
