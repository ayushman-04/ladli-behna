import { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch, useToast } from '../App'

// India National Emergency Numbers (ERSS Priority)
const INDIA_EMERGENCY_NUMBERS = [
  {
    name: 'National Emergency (ERSS)',
    subtitle: 'Police, Fire, Ambulance (All-in-one)',
    phone: '112',
    tel_link: 'tel:112',
    priority: true,
  },
  {
    name: 'Women Helpline (All India)',
    subtitle: 'Emergency support & rescue 24x7',
    phone: '1091',
    tel_link: 'tel:1091',
    priority: false,
  },
  {
    name: 'Women in Distress (NCW)',
    subtitle: 'National Commission for Women Helpline',
    phone: '7827170170',
    tel_link: 'tel:7827170170',
    priority: false,
  },
  {
    name: 'Police Control Room',
    subtitle: 'Direct Police Assistance',
    phone: '100',
    tel_link: 'tel:100',
    priority: false,
  },
]

export default function EmergencyPopup({ type, onOk }) {
  const [countdown, setCountdown] = useState(15)
  const [triggered, setTriggered] = useState(false)
  const [emergencyData, setEmergencyData] = useState(null)
  const [isResolving, setIsResolving] = useState(false)
  const [notifyPolice, setNotifyPolice] = useState(false)
  const [gpsStatus, setGpsStatus] = useState('pending') // 'pending' | 'acquired' | 'unavailable'
  const { showToast } = useToast()

  const audioRef = useRef({
    audioCtx: null,
    oscillator: null,
    gainNode: null,
    intervalId: null,
    timeoutId: null,
    isStopped: false,
  })

  const triggeringRef = useRef(false)

  // -------------------------------------------------------------
  // B. Audio Lifecycle: Safe, Idempotent Web Audio API Management
  // -------------------------------------------------------------
  const stopAlarm = useCallback(() => {
    const current = audioRef.current
    if (!current || current.isStopped) return
    current.isStopped = true

    if (current.intervalId) {
      clearInterval(current.intervalId)
      current.intervalId = null
    }

    if (current.timeoutId) {
      clearTimeout(current.timeoutId)
      current.timeoutId = null
    }

    if (current.oscillator) {
      try {
        current.oscillator.stop()
        current.oscillator.disconnect()
      } catch {
        // Safe ignore if already stopped
      }
      current.oscillator = null
    }

    if (current.gainNode) {
      try {
        current.gainNode.disconnect()
      } catch {
        // Safe ignore
      }
      current.gainNode = null
    }

    if (current.audioCtx) {
      try {
        if (current.audioCtx.state !== 'closed') {
          current.audioCtx.close().catch(() => {})
        }
      } catch {
        // Safe ignore
      }
      current.audioCtx = null
    }
  }, [])

  useEffect(() => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) return

    let audioCtx = null
    try {
      audioCtx = new AudioContextClass()
    } catch (err) {
      console.warn('AudioContext initialization failed:', err)
      return
    }

    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {})
    }

    let oscillator = null
    let gainNode = null
    let intervalId = null
    let timeoutId = null

    try {
      oscillator = audioCtx.createOscillator()
      gainNode = audioCtx.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioCtx.destination)

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(800, audioCtx.currentTime)
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime)

      intervalId = setInterval(() => {
        try {
          if (audioCtx && audioCtx.state !== 'closed') {
            gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime)
            timeoutId = setTimeout(() => {
              try {
                if (audioCtx && audioCtx.state !== 'closed') {
                  gainNode.gain.setValueAtTime(0, audioCtx.currentTime)
                }
              } catch {}
            }, 400)
          }
        } catch {}
      }, 800)

      oscillator.start()
    } catch (err) {
      console.warn('Oscillator start failed:', err)
    }

    audioRef.current = {
      audioCtx,
      oscillator,
      gainNode,
      intervalId,
      timeoutId,
      isStopped: false,
    }

    return () => {
      stopAlarm()
    }
  }, [stopAlarm])

  // -------------------------------------------------------------
  // A. Robust Geolocation Acquisition (Non-blocking Fallback)
  // -------------------------------------------------------------
  const getCoordinatesSafely = async (timeoutMs = 4000) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatus('unavailable')
      return null
    }

    return new Promise((resolve) => {
      let isSettled = false

      const fallbackTimer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true
          console.warn(`Geolocation timed out after ${timeoutMs}ms; continuing SOS without GPS coordinates`)
          setGpsStatus('unavailable')
          resolve(null)
        }
      }, timeoutMs)

      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (!isSettled) {
            isSettled = true
            clearTimeout(fallbackTimer)
            if (position && position.coords) {
              setGpsStatus('acquired')
              resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              })
            } else {
              setGpsStatus('unavailable')
              resolve(null)
            }
          }
        },
        (error) => {
          if (!isSettled) {
            isSettled = true
            clearTimeout(fallbackTimer)
            console.warn('Geolocation unavailable or denied:', error?.message || error)
            setGpsStatus('unavailable')
            resolve(null) // Never abort SOS workflow on GPS denial!
          }
        },
        {
          enableHighAccuracy: true,
          timeout: timeoutMs,
          maximumAge: 30000,
        }
      )
    })
  }

  // -------------------------------------------------------------
  // Emergency Trigger Execution
  // -------------------------------------------------------------
  const handleNotOk = useCallback(async () => {
    if (triggered || triggeringRef.current) return
    triggeringRef.current = true
    setTriggered(true)
    stopAlarm()

    // 1. Attempt non-blocking location fetch
    const coords = await getCoordinatesSafely(4000)

    try {
      // 2. Dispatch emergency protocol to backend
      const payload = {
        latitude: coords ? coords.latitude : null,
        longitude: coords ? coords.longitude : null,
        type: type || 'manual',
        notify_police: notifyPolice,
        transcript: `SOS alert triggered (${type || 'manual'})`,
      }

      const data = await apiFetch('/api/emergency/trigger', {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      // Normalize emergency numbers to always prioritize India 112
      const emergencyNumbers = (data.emergency_numbers && data.emergency_numbers.length > 0)
        ? data.emergency_numbers.filter(n => n.phone !== '911')
        : INDIA_EMERGENCY_NUMBERS

      setEmergencyData({
        ...data,
        emergency_numbers: emergencyNumbers,
        isOfflineFallback: false,
      })

      // -------------------------------------------------------------
      // D. Notification Transparency Feedback
      // -------------------------------------------------------------
      const smsResults = data.sms_results || []
      const acceptedCount = smsResults.filter(r => r.sms_sent).length
      const totalCount = smsResults.length

      if (totalCount === 0) {
        showToast('🚨 SOS logged on server! Add contacts to enable automated alerts.', 'error')
      } else if (acceptedCount === 0) {
        showToast('🚨 Emergency logged! SMS service unconfigured — use WhatsApp/Call below.', 'error')
      } else {
        showToast(`🚨 SOS submitted! Dispatch provider accepted request for ${acceptedCount}/${totalCount} contacts.`, 'error')
      }

      // Vibrate if supported
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([500, 200, 500, 200, 500])
      }
    } catch (err) {
      console.error('Emergency trigger error (activating offline fallback):', err)

      // -------------------------------------------------------------
      // F. Offline / Unreachable Server Resilience Fallback
      // -------------------------------------------------------------
      let fallbackContacts = []
      try {
        const cached = localStorage.getItem('shieldher_contacts_cache')
        if (cached) {
          const raw = JSON.parse(cached)
          fallbackContacts = raw.map(c => {
            const cleanPhone = (c.phone || '').replace('+', '').replace(/\s+/g, '').replace(/-/g, '')
            return {
              name: c.name,
              phone: c.phone,
              relationship: c.relationship,
              tel_link: `tel:${c.phone}`,
              whatsapp_link: `https://wa.me/${cleanPhone}?text=${encodeURIComponent('🚨 EMERGENCY! I need immediate help!')}`,
            }
          })
        }
      } catch (cacheErr) {
        console.warn('Failed reading contacts cache:', cacheErr)
      }

      setEmergencyData({
        incident: null,
        contacts: fallbackContacts,
        sms_results: fallbackContacts.map(c => ({
          phone: c.phone,
          sms_sent: false,
          sms_error: 'Offline / Server unreachable',
        })),
        emergency_numbers: INDIA_EMERGENCY_NUMBERS,
        sos_message: 'EMERGENCY! I need immediate help!',
        isOfflineFallback: true,
      })

      showToast('⚠️ Server unreachable. Emergency alert could not be sent remotely — call 112 or contacts below directly!', 'error')

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([400, 200, 400])
      }
    }
  }, [triggered, stopAlarm, type, notifyPolice, showToast])

  // -------------------------------------------------------------
  // Countdown Timer
  // -------------------------------------------------------------
  useEffect(() => {
    if (triggered) return

    if (countdown <= 0) {
      handleNotOk()
      return
    }

    const timer = setTimeout(() => {
      setCountdown(prev => prev - 1)
    }, 1000)

    return () => clearTimeout(timer)
  }, [countdown, triggered, handleNotOk])

  // User clicked "I'm Okay" during countdown
  const handleOk = () => {
    stopAlarm()
    showToast("Glad you're safe! 💚", 'success')
    onOk()
  }

  // -------------------------------------------------------------
  // C. Emergency Resolution: Mark Incident Resolved in Database
  // -------------------------------------------------------------
  const handleResolveAndDismiss = async () => {
    stopAlarm()
    const incidentId = emergencyData?.incident?.id

    if (incidentId) {
      setIsResolving(true)
      try {
        await apiFetch(`/api/emergency/resolve/${incidentId}`, { method: 'POST' })
        showToast("Glad you're safe! Emergency incident resolved. 💚", 'success')
      } catch (err) {
        console.warn('Could not mark incident as resolved on server:', err)
        showToast("Alert dismissed locally. 💚", 'success')
      } finally {
        setIsResolving(false)
      }
    } else {
      showToast("Emergency dismissed. 💚", 'success')
    }

    onOk()
  }

  // -------------------------------------------------------------
  // Emergency Triggered Screen (Active Assistance Dashboard)
  // -------------------------------------------------------------
  if (triggered && emergencyData) {
    const smsMap = {}
    for (const r of (emergencyData.sms_results || [])) {
      smsMap[r.phone] = r
    }

    return (
      <div className="emergency-overlay" role="dialog" aria-modal="true" aria-label="Emergency activated">
        <div className="emergency-modal" style={{ maxWidth: '420px', maxHeight: '90vh', overflowY: 'auto' }}>
          <div className="emergency-icon" aria-hidden="true">🚨</div>
          <h2 style={{ color: 'var(--red-light, #f87171)' }}>Emergency Activated</h2>

          {/* Status Subtitle & Offline/GPS Indicators */}
          <div style={{ marginBottom: '16px' }}>
            {emergencyData.isOfflineFallback ? (
              <div style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '0.78rem',
                color: '#fca5a5',
                textAlign: 'left',
                marginBottom: '10px',
                lineHeight: '1.4'
              }}>
                ⚠️ <strong>Offline Mode:</strong> Server is unreachable. Alert could not be dispatched remotely. Please call emergency services or contacts directly below.
              </div>
            ) : (
              <p style={{ color: 'var(--muted-foreground, #94a3b8)', marginBottom: '8px', fontSize: '0.84rem' }}>
                Emergency incident recorded. Dispatch status and direct lines are displayed below.
              </p>
            )}

            {/* GPS Status Indicator */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '0.7rem',
              padding: '3px 8px',
              borderRadius: '6px',
              background: gpsStatus === 'acquired' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
              color: gpsStatus === 'acquired' ? '#34d399' : '#fbbf24',
            }}>
              <span>{gpsStatus === 'acquired' ? '📍 GPS Attached' : '⚠️ GPS Unavailable (Location Omitted)'}</span>
            </div>
          </div>

          {/* Emergency Services (ERSS 112 Priority) */}
          <div style={{ marginBottom: '18px' }}>
            <span className="eyebrow" style={{ display: 'block', marginBottom: '8px', textAlign: 'left', fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Official Emergency Services (India)
            </span>
            {(emergencyData.emergency_numbers || INDIA_EMERGENCY_NUMBERS).map((num, i) => (
              <a
                key={i}
                href={num.tel_link}
                className="emergency-contact-card"
                style={{
                  textDecoration: 'none',
                  color: 'inherit',
                  marginBottom: '6px',
                  border: num.phone === '112' ? '1px solid rgba(239, 68, 68, 0.5)' : undefined,
                  background: num.phone === '112' ? 'rgba(239, 68, 68, 0.12)' : undefined,
                }}
                aria-label={`Call ${num.name} at ${num.phone}`}
              >
                <div className="contact-info">
                  <div className="contact-name" style={{ fontWeight: num.phone === '112' ? '600' : '500' }}>
                    {num.phone === '112' ? `⭐ ${num.name}` : num.name}
                  </div>
                  <div className="contact-phone" style={{ color: num.phone === '112' ? '#f87171' : undefined }}>
                    {num.phone} {num.subtitle ? `• ${num.subtitle}` : ''}
                  </div>
                </div>
                <div className="contact-actions">
                  <span className="call-btn" aria-hidden="true" style={{ fontSize: '1.2rem' }}>📞</span>
                </div>
              </a>
            ))}
          </div>

          {/* Personal Trusted Contacts */}
          {emergencyData.contacts?.length > 0 && (
            <div style={{ marginBottom: '18px' }}>
              <span className="eyebrow" style={{ display: 'block', marginBottom: '8px', textAlign: 'left', fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Your Trusted Contacts
              </span>
              {emergencyData.contacts.map((contact, i) => {
                const sms = smsMap[contact.phone]

                // D. Notification Transparency Formatting
                let statusText = 'Remote delivery unconfirmed'
                let statusColor = '#94a3b8'

                if (emergencyData.isOfflineFallback) {
                  statusText = 'Alert not sent remotely (offline)'
                  statusColor = '#f87171'
                } else if (sms) {
                  if (sms.sms_sent) {
                    statusText = 'Provider accepted request (delivery in progress)'
                    statusColor = '#38bdf8'
                  } else if (sms.sms_error && sms.sms_error.toLowerCase().includes('not configured')) {
                    statusText = 'SMS service in test/demo mode (use direct call below)'
                    statusColor = '#fbbf24'
                  } else {
                    statusText = `Dispatch failed: ${sms.sms_error || 'Delivery unconfirmed'}`
                    statusColor = '#f87171'
                  }
                }

                return (
                  <div key={i} className="emergency-contact-card" style={{ marginBottom: '6px' }}>
                    <div className="contact-info">
                      <div className="contact-name">{contact.name}</div>
                      <div className="contact-phone">{contact.phone}</div>
                      <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.68rem', marginTop: '4px', color: statusColor, lineHeight: '1.3' }}>
                        {statusText}
                      </div>
                    </div>
                    <div className="contact-actions">
                      <a href={contact.tel_link} className="call-btn" title="Call directly" aria-label={`Call ${contact.name}`}>📞</a>
                      {contact.whatsapp_link && (
                        <a href={contact.whatsapp_link} target="_blank" rel="noopener noreferrer" className="whatsapp-btn" title="Send WhatsApp Message" aria-label={`WhatsApp ${contact.name}`}>💬</a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {(!emergencyData.contacts || emergencyData.contacts.length === 0) && (
            <div className="glass-card-static" style={{ marginBottom: '14px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
              <p style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.74rem', color: '#fbbf24', margin: 0 }}>
                No emergency contacts saved. Please use the direct 112 emergency calling button above.
              </p>
            </div>
          )}

          {/* Safe Resolution Button */}
          <button
            id="emergency-safe-btn"
            className="btn btn-safe btn-full"
            onClick={handleResolveAndDismiss}
            disabled={isResolving}
            style={{ marginTop: '12px', width: '100%', padding: '14px' }}
          >
            {isResolving ? 'Resolving Emergency...' : "I'm Safe Now — Cancel Emergency"}
          </button>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------
  // Countdown Phase (Initial Warning Screen)
  // -------------------------------------------------------------
  const progress = Math.max(0, Math.min(100, (countdown / 15) * 100))

  return (
    <div className="emergency-overlay" role="dialog" aria-modal="true" aria-label="Safety check countdown">
      <div className="emergency-modal">
        <div className="emergency-icon" aria-hidden="true">⚠️</div>
        <h2>Are You Okay?</h2>
        <p style={{ color: 'var(--muted-foreground, #94a3b8)', fontSize: '0.88rem', marginBottom: '4px' }}>
          {type === 'shake' ? 'Sudden motion or impact detected'
           : type === 'audio' ? 'Potential threat pattern detected in audio'
           : 'Safety check protocol triggered'}
        </p>

        <div className="countdown" role="timer" aria-live="assertive" aria-label={`${countdown} seconds remaining`}>
          {countdown}
        </div>

        <div className="countdown-bar" aria-hidden="true">
          <div className="countdown-bar-fill" style={{ width: `${progress}%` }} />
        </div>

        <p style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.7rem', color: '#94a3b8', marginBottom: '16px', letterSpacing: '0.04em' }}>
          Emergency alert triggers automatically if no response
        </p>

        {/* Optional police notification toggle */}
        <label
          htmlFor="notify-police-toggle"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            marginBottom: '20px',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '0.72rem',
            color: 'var(--muted-foreground, #94a3b8)',
            justifyContent: 'center',
            letterSpacing: '0.04em',
          }}
        >
          <input
            type="checkbox"
            id="notify-police-toggle"
            checked={notifyPolice}
            onChange={e => setNotifyPolice(e.target.checked)}
            style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: 'var(--accent, #ec4899)' }}
          />
          Also notify police helpline (optional)
        </label>

        <button id="emergency-ok-btn" className="btn btn-safe btn-ok" onClick={handleOk}>
          I&apos;m Okay
        </button>

        <button id="emergency-help-btn" className="btn btn-danger btn-not-ok" onClick={handleNotOk}>
          I Need Help
        </button>
      </div>
    </div>
  )
}
