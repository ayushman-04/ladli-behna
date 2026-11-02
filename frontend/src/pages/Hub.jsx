import { useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

function useScrollReveal() {
  const refs = useRef([])
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible') }),
      { threshold: 0.08, rootMargin: '0px 0px -20px 0px' }
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

const resources = {
  helplines: [
    { icon: '🚔', title: 'Police Emergency',  desc: 'Dial 100 for immediate police assistance',         link: 'tel:100' },
    { icon: '👩', title: 'Women Helpline',    desc: 'National Commission for Women — 1091',             link: 'tel:1091' },
    { icon: '🚑', title: 'Ambulance',         desc: 'Emergency medical services — 102',                 link: 'tel:102' },
    { icon: '👧', title: 'Child Helpline',    desc: 'For children in distress — 1098',                  link: 'tel:1098' },
    { icon: '🆘', title: 'National Emergency','desc': 'Single emergency number — 112',                  link: 'tel:112' },
  ],
  selfDefense: [
    { icon: '🥋', title: 'Basic Self-Defense Moves',  desc: 'Simple techniques everyone should know',            link: 'https://www.youtube.com/results?search_query=basic+self+defense+for+women' },
    { icon: '🦵', title: 'Escape from Grabs',         desc: 'How to break free from common holds',               link: 'https://www.youtube.com/results?search_query=self+defense+escape+grabs' },
    { icon: '💪', title: 'Situational Awareness',     desc: 'How to stay alert and avoid danger',                link: 'https://www.youtube.com/results?search_query=situational+awareness+women+safety' },
  ],
  legalRights: [
    { icon: '⚖️', title: 'Protection from Domestic Violence', desc: 'Know your rights under DV Act 2005',                           link: 'https://wcd.nic.in/act/protection-women-domestic-violence-act-2005' },
    { icon: '📋', title: 'Sexual Harassment at Workplace',    desc: 'POSH Act 2013 — workplace safety',                             link: 'https://wcd.nic.in/act/sexual-harassment-women-workplace-prevention-prohibition-and-redressal-act-2013' },
    { icon: '🏛️', title: 'How to File an FIR',               desc: 'Step-by-step guide to filing a police complaint',              link: 'https://www.google.com/search?q=how+to+file+FIR+in+India+women' },
    { icon: '📱', title: 'Cyber Crime Reporting',             desc: 'Report online harassment at cybercrime.gov.in',                link: 'https://cybercrime.gov.in/' },
  ],
  financial: [
    { icon: '💰', title: 'PM Jan Dhan Yojana',  desc: 'Free bank accounts & financial inclusion',           link: 'https://pmjdy.gov.in/' },
    { icon: '📊', title: 'Mudra Loan Scheme',    desc: 'Loans up to ₹10 lakh for women entrepreneurs',      link: 'https://www.mudra.org.in/' },
    { icon: '🎓', title: 'Stand Up India',       desc: 'Bank loans for SC/ST and women entrepreneurs',      link: 'https://www.standupmitra.in/' },
    { icon: '👩‍💼', title: 'Skill India',         desc: 'Free skill development programs',                   link: 'https://www.skillindia.gov.in/' },
  ],
}

const categories = [
  { key: 'helplines',   label: 'Emergency Helplines',      eyebrow: 'Emergency' },
  { key: 'selfDefense', label: 'Self-Defense',             eyebrow: 'Training' },
  { key: 'legalRights', label: 'Know Your Legal Rights',   eyebrow: 'Legal' },
  { key: 'financial',   label: 'Financial Empowerment',    eyebrow: 'Finance' },
]

export default function Hub() {
  const navigate = useNavigate()
  const addRef = useScrollReveal()

  return (
    <>
      <div className="page-abstract-bg hub" aria-hidden="true">
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
          <span className="eyebrow" style={{ display: 'block', marginBottom: '2px' }}>Resources</span>
          <h2 style={{ lineHeight: 1.1 }}>Empowerment Hub</h2>
        </div>
      </div>

      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '0.84rem', color: 'var(--muted-foreground)', marginBottom: '28px', lineHeight: 1.65 }}>
        Safety, legal rights, financial inclusion, and skill development — all in one place.
      </p>

      {categories.map(({ key, label, eyebrow }) => (
        <section key={key} className="hub-category" aria-label={label}>
          <div className="hub-category-header">
            <span className="eyebrow">{eyebrow}</span>
            <h3>{label}</h3>
          </div>

          {resources[key].map((item, i) => (
            <a
              key={i}
              href={item.link}
              target={item.link.startsWith('tel:') ? '_self' : '_blank'}
              rel="noopener noreferrer"
              className={`resource-card reveal reveal-delay-${Math.min(i + 1, 6)}`}
              ref={addRef}
              aria-label={`${item.title} — ${item.desc}`}
            >
              <span className="resource-icon" aria-hidden="true">{item.icon}</span>
              <div>
                <div className="resource-title">{item.title}</div>
                <div className="resource-desc">{item.desc}</div>
              </div>
            </a>
          ))}
        </section>
      ))}
    </div>
    </>
  )
}
