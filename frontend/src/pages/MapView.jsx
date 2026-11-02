import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { apiFetch } from '../App'

// Fix Leaflet default marker icons
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const policeIcon = new L.DivIcon({
  html: '<div style="font-size:22px;text-align:center">🚔</div>',
  iconSize: [30, 30],
  className: '',
})
const userIcon = new L.DivIcon({
  html: '<div style="font-size:22px;text-align:center">📍</div>',
  iconSize: [30, 30],
  className: '',
})

function FlyToUser({ position }) {
  const map = useMap()
  useEffect(() => {
    if (position) map.flyTo(position, 15, { duration: 1.5 })
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
  const [userPosition, setUserPosition] = useState(null)
  const [policeStations, setPoliceStations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords
          setUserPosition([latitude, longitude])
          setLoading(false)
          findPoliceStations(latitude, longitude)
        },
        () => {
          setUserPosition([28.6139, 77.2090])
          setLoading(false)
          setError('Could not get your location. Showing default location.')
        },
        { enableHighAccuracy: true, timeout: 10000 }
      )
    } else {
      setUserPosition([28.6139, 77.2090])
      setLoading(false)
    }
  }, [])

  const findPoliceStations = async (lat, lng) => {
    try {
      const data = await apiFetch('/api/location/police', {
        method: 'POST',
        body: JSON.stringify({ latitude: lat, longitude: lng }),
      })
      setPoliceStations(data.stations || [])
    } catch (err) {
      console.error('Police station fetch error:', err)
    }
  }

  const refreshLocation = () => {
    setLoading(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        setUserPosition([latitude, longitude])
        setLoading(false)
        findPoliceStations(latitude, longitude)
      },
      () => setLoading(false),
      { enableHighAccuracy: true }
    )
  }

  if (loading) {
    return (
      <div className="page-content page-enter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spin" style={{ fontSize: '2rem', marginBottom: '14px' }} aria-hidden="true">🗺️</div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--muted-foreground)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Getting your location...</p>
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
          <span className="eyebrow" style={{ display: 'block', marginBottom: '2px' }}>Location Services</span>
          <h2 style={{ lineHeight: 1.1 }}>Safety Map</h2>
        </div>
      </div>

      {error && (
        <div className="glass-card-static" style={{ marginBottom: '12px', padding: '10px 14px' }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--amber)', letterSpacing: '0.03em' }}>
            {error}
          </p>
        </div>
      )}

      {/* Map Controls */}
      <div className="map-controls">
        <button id="map-locate-btn" className="btn btn-outline btn-sm" onClick={refreshLocation}>
          My Location
        </button>
        <button
          id="map-police-btn"
          className="btn btn-outline btn-sm"
          onClick={() => userPosition && findPoliceStations(userPosition[0], userPosition[1])}
        >
          Find Police
        </button>
      </div>

      {/* Map */}
      <div className="map-container">
        {userPosition && (
          <MapContainer center={userPosition} zoom={14} style={{ height: '100%', width: '100%' }} zoomControl={false}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />
            <FlyToUser position={userPosition} />
            <Marker position={userPosition} icon={userIcon}>
              <Popup><strong>You are here</strong></Popup>
            </Marker>
            {policeStations.map((station, i) => (
              <Marker key={i} position={[station.latitude, station.longitude]} icon={policeIcon}>
                <Popup>
                  <strong>{station.name}</strong>
                  {station.phone && <><br />{station.phone}</>}
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>

      {/* Police Station List */}
      {policeStations.length > 0 && (
        <div className="police-list">
          <span className="eyebrow" style={{ display: 'block', margin: '16px 0 10px' }}>
            Nearby Police Stations
          </span>
          {policeStations.slice(0, 5).map((station, i) => (
            <div key={i} className="police-item">
              <span className="police-icon" aria-hidden="true">🏛️</span>
              <div style={{ flex: 1 }}>
                <div className="police-name">{station.name}</div>
                {station.phone && (
                  <a href={`tel:${station.phone}`} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--accent)' }}>
                    {station.phone}
                  </a>
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
          ))}
        </div>
      )}
    </div>
    </>
  )
}
