import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch, useToast } from '../App'

function useScrollReveal() {
  const refs = useRef([])
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible') }),
      { threshold: 0.1, rootMargin: '0px 0px -20px 0px' }
    )
    refs.current.forEach(el => { if (el) observer.observe(el) })
    return () => observer.disconnect()
  }, [])
  return (el) => { if (el && !refs.current.includes(el)) refs.current.push(el) }
}

const BackIcon = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
)
const TrashIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4h6v2" />
  </svg>
)

export default function Contacts() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [contacts, setContacts] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(true)

  const [name, setName]               = useState('')
  const [phone, setPhone]             = useState('')
  const [relationship, setRelationship] = useState('')

  useEffect(() => { loadContacts() }, [])

  const loadContacts = async () => {
    try {
      const data = await apiFetch('/api/contacts')
      setContacts(data.contacts || [])
    } catch (err) {
      console.error('Load contacts error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    try {
      await apiFetch('/api/contacts', {
        method: 'POST',
        body: JSON.stringify({ name, phone, relationship: relationship || null }),
      })
      showToast('Contact added!', 'success')
      setName(''); setPhone(''); setRelationship('')
      setShowForm(false)
      loadContacts()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this emergency contact?')) return
    try {
      await apiFetch(`/api/contacts/${id}`, { method: 'DELETE' })
      showToast('Contact removed', 'warning')
      loadContacts()
    } catch (err) {
      showToast(err.message, 'error')
    }
  }

  const getInitials = (name) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  const addRef = useScrollReveal()

  return (
    <>
      <div className="page-abstract-bg contacts" aria-hidden="true">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <div className="dot-grid" />
      </div>
    <div className="page-content page-enter">
      {/* Page Header */}
      <div className="page-header">
        <button className="back-btn" onClick={() => navigate('/dashboard')} aria-label="Go back">
          <BackIcon />
        </button>
        <div style={{ flex: 1 }}>
          <span className="eyebrow" style={{ display: 'block', marginBottom: '2px' }}>Safety Network</span>
          <h2 style={{ lineHeight: 1.1 }}>Emergency Contacts</h2>
        </div>
      </div>

      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.84rem', color: 'var(--muted-foreground)', marginBottom: '20px', lineHeight: 1.6 }}>
        These people will be alerted during an emergency with your live location.
      </p>

      {/* Add Contact Button */}
      <button
        id="contacts-add-btn"
        className={`btn btn-full ${showForm ? 'btn-outline' : 'btn-primary'}`}
        onClick={() => setShowForm(!showForm)}
        style={{ marginBottom: '18px' }}
      >
        {showForm ? 'Cancel' : '+ Add Emergency Contact'}
      </button>

      {/* Add Contact Form */}
      {showForm && (
        <form
          className="glass-card-static add-contact-form slide-up"
          onSubmit={handleAdd}
          style={{ marginBottom: '18px' }}
        >
          <div className="form-group">
            <label className="form-label" htmlFor="contact-name">Name</label>
            <input id="contact-name" type="text" className="form-input" placeholder="Contact name" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="contact-phone">Phone Number</label>
            <input id="contact-phone" type="tel" className="form-input" placeholder="+91 9876543210" value={phone} onChange={e => setPhone(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="contact-rel">Relationship <span style={{ textTransform: 'none', fontWeight: 400 }}>(optional)</span></label>
            <input id="contact-rel" type="text" className="form-input" placeholder="e.g. Mother, Friend" value={relationship} onChange={e => setRelationship(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-safe btn-full">
            Save Contact
          </button>
        </form>
      )}

      {/* Contacts List */}
      <div className="contacts-list">
        {loading ? (
          <div className="empty-state">
            <div className="spin" style={{ fontSize: '1.6rem' }} aria-hidden="true">⟳</div>
          </div>
        ) : contacts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon" aria-hidden="true">✦</div>
            <p>No emergency contacts yet</p>
            <p style={{ marginTop: '5px', fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: 'oklch(0.40 0.008 260)', letterSpacing: '0.03em' }}>
              Add trusted people who will be alerted in emergencies
            </p>
          </div>
        ) : (
          contacts.map((contact, idx) => (
            <div key={contact.id} className={`contact-card reveal reveal-delay-${Math.min(idx+1,6)}`} ref={addRef}>
              <div className="contact-avatar" aria-hidden="true">
                {getInitials(contact.name)}
              </div>
              <div className="contact-info">
                <div className="contact-name">{contact.name}</div>
                <div className="contact-phone">{contact.phone}</div>
                {contact.relationship && (
                  <div className="contact-relationship">{contact.relationship}</div>
                )}
              </div>
              <button
                className="contact-delete"
                onClick={() => handleDelete(contact.id)}
                aria-label={`Remove ${contact.name}`}
              >
                <TrashIcon />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Default Emergency Numbers */}
      <div className="glass-card-static reveal" ref={addRef} style={{ marginTop: '24px' }}>
        <span className="eyebrow" style={{ display: 'block', marginBottom: '12px' }}>Default Emergency Numbers</span>
        <div style={{ color: 'var(--muted-foreground)', fontSize: '0.83rem', lineHeight: '2', fontFamily: 'var(--font-sans)' }}>
          <div>Police &mdash; <strong style={{ color: 'var(--foreground)', fontFamily: 'var(--font-mono)' }}>100</strong></div>
          <div>Women Helpline &mdash; <strong style={{ color: 'var(--foreground)', fontFamily: 'var(--font-mono)' }}>1091</strong></div>
          <div>Ambulance &mdash; <strong style={{ color: 'var(--foreground)', fontFamily: 'var(--font-mono)' }}>102</strong></div>
        </div>
      </div>
    </div>
    </>
  )
}
