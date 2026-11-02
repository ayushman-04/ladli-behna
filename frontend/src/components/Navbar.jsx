import { NavLink } from 'react-router-dom'

/* Inline SVG icon set — no external icon dependency */
const Icons = {
  Home: () => (
    <svg viewBox="0 0 24 24">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  ),
  Shield: () => (
    <svg viewBox="0 0 24 24">
      <path d="M12 2l7 4v5c0 4.97-3.13 9.28-7 11-3.87-1.72-7-6.03-7-11V6l7-4z" />
    </svg>
  ),
  Map: () => (
    <svg viewBox="0 0 24 24">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  ),
  Users: () => (
    <svg viewBox="0 0 24 24">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Book: () => (
    <svg viewBox="0 0 24 24">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
}

export default function Navbar() {
  const navItems = [
    { to: '/dashboard', label: 'Home',     Icon: Icons.Home   },
    { to: '/shield',    label: 'Shield',   Icon: Icons.Shield },
    { to: '/map',       label: 'Map',      Icon: Icons.Map    },
    { to: '/contacts',  label: 'Contacts', Icon: Icons.Users  },
    { to: '/hub',       label: 'Hub',      Icon: Icons.Book   },
  ]

  return (
    <nav className="navbar" role="navigation" aria-label="Main navigation">
      {navItems.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
          aria-label={label}
        >
          <span className="nav-icon" aria-hidden="true">
            <Icon />
          </span>
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
