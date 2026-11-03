import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { apiFetch, useToast } from '../App'

// Fix Leaflet default marker icons for bundlers
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

// Custom Markers
const policeIcon = new L.DivIcon({
  html: '<div style="font-size:24px;line-height:1;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.6));text-align:center">🚔</div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  className: 'custom-map-icon',
})

const userIcon = new L.DivIcon({
  html: '<div style="position:relative;display:flex;align-items:center;justify-content:center;"><div style="position:absolute;width:28px;height:28px;border-radius:50%;background:rgba(236,168,214,0.35);animation:ping 2s cubic-bezier(0,0,0.2,1) infinite;"></div><div style="font-size:24px;line-height:1;filter:drop-shadow(0 2px 6px rgba(236,168,214,0.8));">📍</div></div>',
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  className: 'custom-map-icon',
})

const hazardIcon = new L.DivIcon({
  html: '<div style="font-size:22px;line-height:1;filter:drop-shadow(0 2px 6px rgba(239,68,68,0.7));text-align:center">⚠️</div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  className: 'custom-map-icon',
})

const referenceIcon = new L.DivIcon({
  html: '<div style="font-size:22px;line-height:1;filter:drop-shadow(0 2px 6px rgba(100,100,100,0.6));opacity:0.85;text-align:center">🌐</div>',
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  className: 'custom-map-icon',
})

const DEFAULT_FALLBACK_CENTER = [28.6139, 77.2090] // Delhi NCR regional overview

function FlyToPosition({ position }) {
  const map = useMap()
  useEffect(() => {
    if (position) {
      map.flyTo(position, 14, { duration: 1.2 })
    }
  }, [position, map])
  return null
}

const BackIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
)

export default function MapView() {
  const navigate = useNavigate()
  const { showToast } = useToast()

  // Real user coordinates (null if permission denied or unavailable)
  const [userPosition, setUserPosition] = useState(null)
  const [mapCenter, setMapCenter] = useState(DEFAULT_FALLBACK_CENTER)
  const [locationStatus, setLocationStatus] = useState('locating') // 'locating' | 'granted' | 'denied' | 'unavailable' | 'timeout'
  const [locationError, setLocationError] = useState('')

  // Map entities
  const [policeStations, setPoliceStations] = useState([])
  const [policeUnavailableMessage, setPoliceUnavailableMessage] = useState('')
  const [verifiedHelplines, setVerifiedHelplines] = useState([
    { name: 'National Emergency (ERSS)', phone: '112', tel_link: 'tel:112' },
    { name: 'Women Helpline (All India)', phone: '1091', tel_link: 'tel:1091' },
    { name: 'Police Control Room', phone: '100', tel_link: 'tel:100' },
  ])
  const [safetyReports, setSafetyReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeFilter, setActiveFilter] = useState('all') // 'all' | 'police' | 'reports'

  // Report hazard modal
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)
  const [reportCategory, setReportCategory] = useState('poor_lighting')
  const [reportDescription, setReportDescription] = useState('')
  const [submittingReport, setSubmittingReport] = useState(false)

  // Fetch location on mount
  useEffect(() => {
    requestLocation()
    fetchSafetyReports()
  }, [])

  const requestLocation = () => {
    setLoading(true)
    setLocationStatus('locating')
    setLocationError('')

    if (!('geolocation' in navigator)) {
      setLocationStatus('unavailable')
      setLocationError('Geolocation is not supported by your browser. Displaying default regional overview.')
      setUserPosition(null)
      setMapCenter(DEFAULT_FALLBACK_CENTER)
      setLoading(false)
      findPoliceStations(DEFAULT_FALLBACK_CENTER[0], DEFAULT_FALLBACK_CENTER[1])
      return
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        setUserPosition([latitude, longitude])
        setMapCenter([latitude, longitude])
        setLocationStatus('granted')
        setLocationError('')
        setLoading(false)
        findPoliceStations(latitude, longitude)
      },
      (err) => {
        // Crucial requirement: Never present fallback coordinates as the user's actual location.
        setUserPosition(null)
        setMapCenter(DEFAULT_FALLBACK_CENTER)

        if (err.code === err.PERMISSION_DENIED) {
          setLocationStatus('denied')
          setLocationError('Location permission was denied. Displaying default regional overview (Delhi NCR). Fallback coordinates are not your live location.')
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setLocationStatus('unavailable')
          setLocationError('Location signal unavailable. Showing regional map overview.')
        } else if (err.code === err.TIMEOUT) {
          setLocationStatus('timeout')
          setLocationError('Location request timed out. Showing regional map overview.')
        } else {
          setLocationStatus('unavailable')
          setLocationError('Unable to detect location. Showing regional map overview.')
        }

        setLoading(false)
        findPoliceStations(DEFAULT_FALLBACK_CENTER[0], DEFAULT_FALLBACK_CENTER[1])
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    )
  }

  const findPoliceStations = async (lat, lng) => {
    try {
      const data = await apiFetch('/api/location/police', {
        method: 'POST',
        body: JSON.stringify({ latitude: lat, longitude: lng }),
      })
      const stations = data.stations || []
      setPoliceStations(stations)
      if (stations.length === 0) {
        setPoliceUnavailableMessage(data.message || 'Nearby police station data is temporarily unavailable from OpenStreetMap.')
      } else {
        setPoliceUnavailableMessage('')
      }
      if (data.emergency_numbers && data.emergency_numbers.length > 0) {
        setVerifiedHelplines(data.emergency_numbers)
      }
    } catch (err) {
      console.warn('Police stations query notice:', err)
      setPoliceStations([])
      setPoliceUnavailableMessage('Nearby police station data is temporarily unavailable from OpenStreetMap.')
    }
  }

  const fetchSafetyReports = async () => {
    try {
      const data = await apiFetch('/api/reports/heatmap')
      setSafetyReports(data.reports || [])
    } catch (err) {
      console.warn('Safety reports fetch error:', err)
    }
  }

  const handleReportSubmit = async (e) => {
    e.preventDefault()
    setSubmittingReport(true)

    // Use user live position if available, else current map center
    const targetCoords = userPosition || mapCenter

    try {
      await apiFetch('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          latitude: targetCoords[0],
          longitude: targetCoords[1],
          category: reportCategory,
          description: reportDescription || 'Community reported safety hazard',
        }),
      })

      showToast('Safety hazard reported successfully! Thank you.', 'success')
      setIsReportModalOpen(false)
      setReportDescription('')
      fetchSafetyReports()
    } catch (err) {
      showToast(err.message || 'Failed to submit report', 'error')
    } finally {
      setSubmittingReport(false)
    }
  }

  const getCategoryLabel = (cat) => {
    switch (cat) {
      case 'poor_lighting': return '💡 Poor Lighting'
      case 'unsafe_area': return '🚧 Unsafe Area'
      case 'harassment': return '🚨 Harassment Zone'
      case 'stalking': return '👁️ Suspicious Activity / Stalking'
      default: return '⚠️ Safety Hazard'
    }
  }

  if (loading) {
    return (
      <div className="page-content page-enter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spin" style={{ fontSize: '2rem', marginBottom: '14px' }} aria-hidden="true">🗺️</div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--muted-foreground)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Acquiring map coordinates & safety telemetry…
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="page-abstract-bg map" aria-hidden="true">
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
            <span className="eyebrow" style={{ display: 'block', marginBottom: '2px' }}>Spatial Intelligence</span>
            <h2 style={{ lineHeight: 1.1 }}>Safety Map & Hazards</h2>
          </div>
        </div>

        {/* Location Status State Banner */}
        {locationStatus === 'granted' && (
          <div className="glass-card-static" style={{ marginBottom: '12px', padding: '10px 14px', borderLeft: '3px solid var(--emerald)', background: 'rgba(16,185,129,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: 'var(--emerald)', letterSpacing: '0.02em', margin: 0 }}>
                📍 <strong>Live GPS Active</strong> — Location verified at {userPosition[0].toFixed(4)}°, {userPosition[1].toFixed(4)}°
              </p>
              <button onClick={requestLocation} className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: '0.7rem' }}>
                Refresh
              </button>
            </div>
          </div>
        )}

        {(locationStatus === 'denied' || locationStatus === 'unavailable' || locationStatus === 'timeout') && (
          <div className="glass-card-static" style={{ marginBottom: '12px', padding: '12px 14px', borderLeft: '3px solid var(--amber)', background: 'rgba(245,158,11,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
              <div>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', fontWeight: 600, color: 'var(--amber)', letterSpacing: '0.02em', marginBottom: '4px' }}>
                  ⚠️ {locationStatus === 'denied' ? 'Location Permission Denied' : 'GPS Location Unavailable'}
                </p>
                <p style={{ fontSize: '0.76rem', color: 'var(--foreground)', opacity: 0.85, lineHeight: 1.4, margin: 0 }}>
                  Showing regional overview (Delhi NCR). Fallback coordinates are <em>never</em> treated as your actual location. Enable browser location to activate personal safe zones.
                </p>
              </div>
              <button
                onClick={requestLocation}
                className="btn btn-outline btn-sm"
                style={{ padding: '6px 12px', fontSize: '0.72rem', flexShrink: 0 }}
              >
                Retry Location
              </button>
            </div>
          </div>
        )}

        {/* Map Controls */}
        <div className="map-controls" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <button
            id="map-locate-btn"
            className={`btn btn-sm ${userPosition ? 'btn-primary' : 'btn-outline'}`}
            onClick={requestLocation}
          >
            {userPosition ? '📍 My Location' : '🧭 Acquire GPS'}
          </button>

          <button
            className={`btn btn-sm ${activeFilter === 'all' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setActiveFilter('all')}
          >
            All Overlays
          </button>

          <button
            id="map-police-btn"
            className={`btn btn-sm ${activeFilter === 'police' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => {
              setActiveFilter('police')
              const coords = userPosition || mapCenter
              findPoliceStations(coords[0], coords[1])
            }}
          >
            🚔 Police Stations ({policeStations.length})
          </button>

          <button
            id="map-hazard-btn"
            className={`btn btn-sm ${activeFilter === 'reports' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => {
              setActiveFilter('reports')
              fetchSafetyReports()
            }}
          >
            ⚠️ Hazard Reports ({safetyReports.length})
          </button>

          <button
            id="map-report-hazard-btn"
            className="btn btn-sm btn-outline"
            style={{ marginLeft: 'auto', borderColor: 'var(--red-border)', color: 'var(--red-light)' }}
            onClick={() => setIsReportModalOpen(true)}
          >
            + Report Unsafe Area
          </button>
        </div>

        {/* Map Container */}
        <div className="map-container" style={{ position: 'relative' }}>
          <MapContainer
            center={mapCenter}
            zoom={userPosition ? 14 : 12}
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
          >
            {/* Standard OpenStreetMap TileLayer respecting usage policy, without watermark */}
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />

            <FlyToPosition position={mapCenter} />

            {/* ONLY render live user marker when real GPS coordinates exist */}
            {userPosition && (
              <>
                <Circle
                  center={userPosition}
                  radius={200}
                  pathOptions={{ color: '#eca8d6', fillColor: '#eca8d6', fillOpacity: 0.15, weight: 1.5 }}
                />
                <Marker position={userPosition} icon={userIcon}>
                  <Popup>
                    <div style={{ textAlign: 'center', padding: '4px' }}>
                      <strong style={{ color: 'var(--accent)', fontSize: '0.9rem' }}>📍 You Are Here</strong>
                      <p style={{ margin: '4px 0 0', fontSize: '0.75rem', opacity: 0.85 }}>
                        Live GPS tracking active
                      </p>
                    </div>
                  </Popup>
                </Marker>
              </>
            )}

            {/* When user position is unavailable, render a clear reference point */}
            {!userPosition && (
              <Marker position={DEFAULT_FALLBACK_CENTER} icon={referenceIcon}>
                <Popup>
                  <div style={{ textAlign: 'center', padding: '4px' }}>
                    <strong style={{ color: 'var(--amber)', fontSize: '0.85rem' }}>🌐 Default Reference Point</strong>
                    <p style={{ margin: '4px 0 0', fontSize: '0.72rem', opacity: 0.8 }}>
                      Delhi NCR Regional Overview<br />
                      <em>(Not your actual location)</em>
                    </p>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Police Station Markers */}
            {(activeFilter === 'all' || activeFilter === 'police') &&
              policeStations.map((station, i) => (
                <Marker key={`police-${i}`} position={[station.latitude, station.longitude]} icon={policeIcon}>
                  <Popup>
                    <div style={{ padding: '4px' }}>
                      <strong style={{ fontSize: '0.88rem', display: 'block', marginBottom: '4px' }}>
                        🚔 {station.name}
                      </strong>
                      {station.phone ? (
                        <a href={`tel:${station.phone}`} style={{ color: 'var(--accent)', fontSize: '0.75rem', display: 'block', marginBottom: '6px' }}>
                          📞 {station.phone}
                        </a>
                      ) : (
                        <span style={{ fontSize: '0.72rem', color: 'var(--muted-foreground)', display: 'block', marginBottom: '6px' }}>
                          Phone: Dial 100 / 112
                        </span>
                      )}
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: '0.72rem', textDecoration: 'underline', color: 'var(--accent)' }}
                      >
                        Directions →
                      </a>
                    </div>
                  </Popup>
                </Marker>
              ))}

            {/* Community Safety Hazard Markers */}
            {(activeFilter === 'all' || activeFilter === 'reports') &&
              safetyReports.map((report, i) => (
                <Marker key={`report-${i}`} position={[report.latitude, report.longitude]} icon={hazardIcon}>
                  <Popup>
                    <div style={{ padding: '4px' }}>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--red-light)', display: 'block', marginBottom: '4px' }}>
                        {getCategoryLabel(report.category)}
                      </strong>
                      <p style={{ fontSize: '0.75rem', margin: '0 0 6px', color: 'var(--foreground)' }}>
                        {report.description || 'Community reported safety concern'}
                      </p>
                      <small style={{ fontSize: '0.68rem', color: 'var(--muted-foreground)' }}>
                        Reported: {new Date(report.created_at).toLocaleDateString()}
                      </small>
                    </div>
                  </Popup>
                </Marker>
              ))}
          </MapContainer>
        </div>

        {/* Police Station Directory & Verified Emergency Helplines Fallback */}
        {(activeFilter === 'all' || activeFilter === 'police') && (
          <div className="police-list" style={{ marginTop: '20px' }}>
            <span className="eyebrow" style={{ display: 'block', marginBottom: '10px' }}>
              Nearby Safe Havens & Police Stations ({policeStations.length})
            </span>
            {policeStations.length > 0 ? (
              policeStations.slice(0, 5).map((station, i) => (
                <div key={i} className="police-item">
                  <span className="police-icon" aria-hidden="true">🏛️</span>
                  <div style={{ flex: 1 }}>
                    <div className="police-name">{station.name}</div>
                    {station.phone ? (
                      <a href={`tel:${station.phone}`} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--accent)' }}>
                        {station.phone}
                      </a>
                    ) : (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--muted-foreground)' }}>
                        Helpline: Dial 112 / 100
                      </span>
                    )}
                  </div>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${station.latitude},${station.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-outline btn-sm"
                    aria-label={`Directions to ${station.name}`}
                  >
                    Directions
                  </a>
                </div>
              ))
            ) : (
              <div className="glass-card-static" style={{ padding: '14px 16px', borderLeft: '3px solid var(--amber)', background: 'rgba(245,158,11,0.06)', borderRadius: '8px' }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem', color: 'var(--amber)', fontWeight: 600, marginBottom: '6px' }}>
                  ℹ️ Nearby Police Station Data Unavailable
                </p>
                <p style={{ fontSize: '0.76rem', color: 'var(--foreground)', opacity: 0.85, lineHeight: 1.4, margin: '0 0 12px 0' }}>
                  {policeUnavailableMessage || 'Nearby police station mapping data is temporarily unavailable from OpenStreetMap. Fictional coordinates are never displayed. For immediate assistance, dial the verified emergency helplines below.'}
                </p>
                
                <span className="eyebrow" style={{ display: 'block', marginBottom: '8px', fontSize: '0.7rem' }}>
                  Verified Emergency Contact Numbers (India)
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {verifiedHelplines.map((helpline, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div>
                        <strong style={{ fontSize: '0.8rem', display: 'block', color: helpline.phone === '112' ? 'var(--red-light)' : 'var(--foreground)' }}>
                          {helpline.phone === '112' ? '⭐ ' : ''}{helpline.name}
                        </strong>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--muted-foreground)' }}>
                          Dial: {helpline.phone}
                        </span>
                      </div>
                      <a href={helpline.tel_link || `tel:${helpline.phone}`} className={`btn btn-sm ${helpline.phone === '112' ? 'btn-danger' : 'btn-outline'}`} style={{ padding: '4px 12px', fontSize: '0.72rem' }}>
                        📞 Call {helpline.phone}
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Hazard Reports Directory */}
        {safetyReports.length > 0 && (
          <div className="hazard-list" style={{ marginTop: '20px' }}>
            <span className="eyebrow" style={{ display: 'block', marginBottom: '10px' }}>
              Recent Community Hazard Reports ({safetyReports.length})
            </span>
            {safetyReports.slice(0, 4).map((report, i) => (
              <div key={i} className="police-item" style={{ borderColor: 'rgba(239,68,68,0.2)' }}>
                <span className="police-icon" aria-hidden="true">⚠️</span>
                <div style={{ flex: 1 }}>
                  <div className="police-name" style={{ color: 'var(--red-light)' }}>
                    {getCategoryLabel(report.category)}
                  </div>
                  <p style={{ fontSize: '0.74rem', color: 'var(--foreground)', opacity: 0.85, margin: '2px 0 4px' }}>
                    {report.description}
                  </p>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'var(--muted-foreground)' }}>
                    {new Date(report.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Report Unsafe Zone Modal */}
        {isReportModalOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.75)',
              backdropFilter: 'blur(8px)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
            }}
          >
            <div
              className="glass-card-static"
              style={{
                width: '100%',
                maxWidth: '440px',
                padding: '24px',
                border: '1px solid var(--accent-30)',
                background: 'rgba(16,8,14,0.95)',
                boxShadow: 'var(--shadow-lg)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--foreground)' }}>
                  Report Safety Hazard
                </h3>
                <button
                  onClick={() => setIsReportModalOpen(false)}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: '1.1rem', padding: '2px 8px' }}
                >
                  ✕
                </button>
              </div>

              <p style={{ fontSize: '0.78rem', color: 'var(--muted-foreground)', marginBottom: '16px', lineHeight: 1.4 }}>
                Contribute an anonymous hazard or incident notice to help protect women in this area.
              </p>

              <form onSubmit={handleReportSubmit}>
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--muted-foreground)', marginBottom: '6px' }}>
                    HAZARD CATEGORY
                  </label>
                  <select
                    value={reportCategory}
                    onChange={(e) => setReportCategory(e.target.value)}
                    className="form-input"
                    style={{ width: '100%', background: 'rgba(20,10,18,0.8)', color: 'var(--foreground)', border: '1px solid var(--border)' }}
                  >
                    <option value="poor_lighting">💡 Poor / Broken Lighting</option>
                    <option value="unsafe_area">🚧 Deserted / Unsafe Alley or Area</option>
                    <option value="harassment">🚨 Catcalling / Harassment Zone</option>
                    <option value="stalking">👁️ Stalking / Suspicious Loitering</option>
                    <option value="other">⚠️ Other Safety Hazard</option>
                  </select>
                </div>

                <div style={{ marginBottom: '18px' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--muted-foreground)', marginBottom: '6px' }}>
                    DESCRIPTION (OPTIONAL)
                  </label>
                  <textarea
                    rows={3}
                    value={reportDescription}
                    onChange={(e) => setReportDescription(e.target.value)}
                    placeholder="E.g., Streetlights are broken near the metro exit..."
                    className="form-input"
                    style={{ width: '100%', background: 'rgba(20,10,18,0.8)', color: 'var(--foreground)', border: '1px solid var(--border)', resize: 'vertical' }}
                  />
                </div>

                <div style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--accent)', marginBottom: '16px' }}>
                  Coordinates: {(userPosition || mapCenter)[0].toFixed(4)}°, {(userPosition || mapCenter)[1].toFixed(4)}°
                  {!userPosition && ' (Using map center overview)'}
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => setIsReportModalOpen(false)}
                    className="btn btn-outline btn-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingReport}
                    className="btn btn-primary btn-sm"
                  >
                    {submittingReport ? 'Submitting…' : 'Submit Hazard Report'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
