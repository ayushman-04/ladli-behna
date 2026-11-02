import { useState, useEffect, createContext, useContext } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import './App.css'

import Navbar from './components/Navbar'
import EmergencyPopup from './components/EmergencyPopup'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import ShieldMode from './pages/ShieldMode'
import MapView from './pages/MapView'
import Contacts from './pages/Contacts'
import SafeWalk from './pages/SafeWalk'
import Hub from './pages/Hub'

// ============================================
// API Helper
// ============================================

const API_BASE = 'http://localhost:8000'

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('shieldher_token')
  const headers = { ...options.headers }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // Only set Content-Type for non-FormData requests
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.detail || 'Something went wrong')
  }

  return data
}

// ============================================
// Auth Context
// ============================================

export const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

// ============================================
// Toast Context
// ============================================

export const ToastContext = createContext(null)

export function useToast() {
  return useContext(ToastContext)
}

// ============================================
// Emergency Context
// ============================================

export const EmergencyContext = createContext(null)

export function useEmergency() {
  return useContext(EmergencyContext)
}

// ============================================
// Protected Route
// ============================================

function ProtectedRoute({ children }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/" replace />
  return children
}

// ============================================
// App Component
// ============================================

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const [emergency, setEmergency] = useState(null) // { type, countdown, onOk, onNotOk }
  const location = useLocation()

  // Check for existing auth on mount
  useEffect(() => {
    const token = localStorage.getItem('shieldher_token')
    const savedUser = localStorage.getItem('shieldher_user')
    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser))
      } catch {
        localStorage.removeItem('shieldher_token')
        localStorage.removeItem('shieldher_user')
      }
    }
    setLoading(false)
  }, [])

  // Login handler
  const login = (token, userData) => {
    localStorage.setItem('shieldher_token', token)
    localStorage.setItem('shieldher_user', JSON.stringify(userData))
    setUser(userData)
  }

  // Logout handler
  const logout = () => {
    localStorage.removeItem('shieldher_token')
    localStorage.removeItem('shieldher_user')
    setUser(null)
  }

  // Toast handler
  const showToast = (message, type = 'success') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Emergency trigger
  const triggerEmergency = (type = 'manual') => {
    setEmergency({ type })
  }

  const cancelEmergency = () => {
    setEmergency(null)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'oklch(0.06 0.008 260)' }}>
        <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#eca8d6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 2s linear infinite', opacity: 0.8 }}>
          <path d="M12 2l7 4v5c0 4.97-3.13 9.28-7 11-3.87-1.72-7-6.03-7-11V6l7-4z" />
        </svg>
      </div>
    )
  }


  const showNavbar = user && location.pathname !== '/'

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      <ToastContext.Provider value={{ showToast }}>
        <EmergencyContext.Provider value={{ emergency, triggerEmergency, cancelEmergency }}>
          <div className="app-container">
            <Routes>
              <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <Landing />} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/shield" element={<ProtectedRoute><ShieldMode /></ProtectedRoute>} />
              <Route path="/map" element={<ProtectedRoute><MapView /></ProtectedRoute>} />
              <Route path="/contacts" element={<ProtectedRoute><Contacts /></ProtectedRoute>} />
              <Route path="/safewalk" element={<ProtectedRoute><SafeWalk /></ProtectedRoute>} />
              <Route path="/hub" element={<ProtectedRoute><Hub /></ProtectedRoute>} />
            </Routes>

            {showNavbar && <Navbar />}

            {/* Emergency Popup */}
            {emergency && (
              <EmergencyPopup
                type={emergency.type}
                onOk={cancelEmergency}
              />
            )}

            {/* Toast */}
            {toast && (
              <div className={`toast ${toast.type}`}>
                {toast.message}
              </div>
            )}
          </div>
        </EmergencyContext.Provider>
      </ToastContext.Provider>
    </AuthContext.Provider>
  )
}

export default App
