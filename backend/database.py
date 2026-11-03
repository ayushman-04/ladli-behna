"""
ShieldHer — Database Setup (PostgreSQL)
Creates tables and provides helper functions for all DB operations.
"""

import sys
if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if sys.stderr and hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

import os
import psycopg2
from psycopg2.extras import RealDictCursor
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:password@localhost:5432/shieldher")


def get_connection():
    """Get a new database connection."""
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
    conn.autocommit = True
    return conn


def init_db():
    """Create all tables if they don't exist."""
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            phone VARCHAR(20),
            safe_word VARCHAR(50) DEFAULT 'help me',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS emergency_contacts (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(100) NOT NULL,
            phone VARCHAR(20) NOT NULL,
            relationship VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS incidents (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            type VARCHAR(20) NOT NULL,
            threat_level VARCHAR(20) NOT NULL,
            transcript TEXT,
            latitude DOUBLE PRECISION,
            longitude DOUBLE PRECISION,
            resolved BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS safety_reports (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            latitude DOUBLE PRECISION NOT NULL,
            longitude DOUBLE PRECISION NOT NULL,
            description TEXT,
            category VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS safe_walks (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            dest_name VARCHAR(200),
            dest_lat DOUBLE PRECISION,
            dest_lng DOUBLE PRECISION,
            eta TIMESTAMP,
            status VARCHAR(30) DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # SafeWalk extensions & migrations
    cur.execute("""
        ALTER TABLE safe_walks ADD COLUMN IF NOT EXISTS mode VARCHAR(30) DEFAULT 'relaxed';
        ALTER TABLE safe_walks ADD COLUMN IF NOT EXISTS checkin_interval_minutes INTEGER DEFAULT NULL;
        ALTER TABLE safe_walks ADD COLUMN IF NOT EXISTS next_checkin_due TIMESTAMP DEFAULT NULL;
        ALTER TABLE safe_walks ADD COLUMN IF NOT EXISTS grace_period_minutes INTEGER DEFAULT 5;
        ALTER TABLE safe_walks ADD COLUMN IF NOT EXISTS last_checkin_at TIMESTAMP DEFAULT NULL;
        ALTER TABLE safe_walks ADD COLUMN IF NOT EXISTS escalation_stage VARCHAR(30) DEFAULT 'none';

        CREATE TABLE IF NOT EXISTS safe_walk_events (
            id SERIAL PRIMARY KEY,
            walk_id INTEGER REFERENCES safe_walks(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            event_type VARCHAR(50) NOT NULL,
            title VARCHAR(150) NOT NULL,
            description TEXT,
            metadata JSONB,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_safe_walk_events_walk ON safe_walk_events(walk_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_safe_walks_user_status ON safe_walks(user_id, status);
    """)

    cur.close()
    conn.close()
    print("✅ Database tables created successfully!")


# ============================================
# User Operations
# ============================================

def create_user(name: str, email: str, password_hash: str, phone: str = None):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO users (name, email, password_hash, phone) VALUES (%s, %s, %s, %s) RETURNING id, name, email, phone, created_at",
        (name, email, password_hash, phone)
    )
    user = cur.fetchone()
    cur.close()
    conn.close()
    return dict(user)


def get_user_by_email(email: str):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE email = %s", (email,))
    user = cur.fetchone()
    cur.close()
    conn.close()
    return dict(user) if user else None


def get_user_by_id(user_id: int):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, name, email, phone, safe_word, created_at FROM users WHERE id = %s", (user_id,))
    user = cur.fetchone()
    cur.close()
    conn.close()
    return dict(user) if user else None


def update_user(user_id: int, name: str = None, phone: str = None, safe_word: str = None):
    conn = get_connection()
    cur = conn.cursor()
    updates = []
    values = []
    if name:
        updates.append("name = %s")
        values.append(name)
    if phone:
        updates.append("phone = %s")
        values.append(phone)
    if safe_word:
        updates.append("safe_word = %s")
        values.append(safe_word)
    if not updates:
        return get_user_by_id(user_id)
    values.append(user_id)
    cur.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = %s RETURNING id, name, email, phone, safe_word, created_at", values)
    user = cur.fetchone()
    cur.close()
    conn.close()
    return dict(user) if user else None


# ============================================
# Emergency Contact Operations
# ============================================

def add_contact(user_id: int, name: str, phone: str, relationship: str = None):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO emergency_contacts (user_id, name, phone, relationship) VALUES (%s, %s, %s, %s) RETURNING *",
        (user_id, name, phone, relationship)
    )
    contact = cur.fetchone()
    cur.close()
    conn.close()
    return dict(contact)


def get_contacts(user_id: int):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM emergency_contacts WHERE user_id = %s ORDER BY created_at", (user_id,))
    contacts = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(c) for c in contacts]


def delete_contact(contact_id: int, user_id: int):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM emergency_contacts WHERE id = %s AND user_id = %s RETURNING id", (contact_id, user_id))
    deleted = cur.fetchone()
    cur.close()
    conn.close()
    return deleted is not None


# ============================================
# Incident Operations
# ============================================

def create_incident(user_id: int, incident_type: str, threat_level: str, transcript: str = None, lat: float = None, lng: float = None):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO incidents (user_id, type, threat_level, transcript, latitude, longitude) VALUES (%s, %s, %s, %s, %s, %s) RETURNING *",
        (user_id, incident_type, threat_level, transcript, lat, lng)
    )
    incident = cur.fetchone()
    cur.close()
    conn.close()
    return dict(incident)


def get_incidents(user_id: int, limit: int = 20):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM incidents WHERE user_id = %s ORDER BY created_at DESC LIMIT %s", (user_id, limit))
    incidents = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(i) for i in incidents]


def resolve_incident(incident_id: int, user_id: int):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE incidents SET resolved = TRUE WHERE id = %s AND user_id = %s RETURNING *", (incident_id, user_id))
    incident = cur.fetchone()
    cur.close()
    conn.close()
    return dict(incident) if incident else None


# ============================================
# Safety Report Operations
# ============================================

def create_report(user_id: int, lat: float, lng: float, description: str = None, category: str = None):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO safety_reports (user_id, latitude, longitude, description, category) VALUES (%s, %s, %s, %s, %s) RETURNING *",
        (user_id, lat, lng, description, category)
    )
    report = cur.fetchone()
    cur.close()
    conn.close()
    return dict(report)


def get_heatmap_data():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT latitude, longitude, category, description, created_at FROM safety_reports ORDER BY created_at DESC LIMIT 500")
    reports = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(r) for r in reports]


# ============================================
# SafeWalk Operations
# ============================================

def add_safewalk_event(walk_id: int, user_id: int, event_type: str, title: str, description: str = None, metadata: dict = None):
    import json
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO safe_walk_events (walk_id, user_id, event_type, title, description, metadata)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING *
        """,
        (walk_id, user_id, event_type, title, description, json.dumps(metadata) if metadata is not None else None)
    )
    event = cur.fetchone()
    cur.close()
    conn.close()
    return dict(event) if event else None


def get_safewalk_events(walk_id: int, user_id: int = None):
    conn = get_connection()
    cur = conn.cursor()
    if user_id is not None:
        cur.execute(
            """
            SELECT e.* FROM safe_walk_events e
            JOIN safe_walks w ON e.walk_id = w.id
            WHERE e.walk_id = %s AND w.user_id = %s
            ORDER BY e.created_at ASC
            """,
            (walk_id, user_id)
        )
    else:
        cur.execute("SELECT * FROM safe_walk_events WHERE walk_id = %s ORDER BY created_at ASC", (walk_id,))
    events = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(e) for e in events]


def create_safewalk(
    user_id: int,
    dest_name: str,
    dest_lat: float,
    dest_lng: float,
    eta: str,
    mode: str = 'relaxed',
    checkin_interval_minutes: int = None,
    next_checkin_due: str = None,
    grace_period_minutes: int = 5
):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE safe_walks SET status = 'superseded' WHERE user_id = %s AND status IN ('active', 'arrival_unconfirmed', 'overdue_processing')",
        (user_id,)
    )
    cur.execute(
        """
        INSERT INTO safe_walks (
            user_id, dest_name, dest_lat, dest_lng, eta, mode,
            checkin_interval_minutes, next_checkin_due, grace_period_minutes,
            escalation_stage, status
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'none', 'active')
        RETURNING *
        """,
        (user_id, dest_name, dest_lat, dest_lng, eta, mode, checkin_interval_minutes, next_checkin_due, grace_period_minutes)
    )
    walk = cur.fetchone()
    cur.close()
    conn.close()
    walk_dict = dict(walk)

    # Record initial events
    mode_labels = {
        'relaxed': 'Relaxed Journey',
        'protected': 'Protected Journey',
        'high_support': 'High-Support Journey'
    }
    mode_desc = mode_labels.get(mode, mode.title())

    add_safewalk_event(
        walk_id=walk_dict['id'],
        user_id=user_id,
        event_type='started',
        title='Journey Started',
        description=f"Destination set to {dest_name or 'designated location'}.",
        metadata={'dest_name': dest_name, 'eta': eta}
    )
    add_safewalk_event(
        walk_id=walk_dict['id'],
        user_id=user_id,
        event_type='mode_selected',
        title=f"Protection Mode: {mode_desc}",
        description=f"Check-in interval: {checkin_interval_minutes}m. Grace period: {grace_period_minutes}m." if checkin_interval_minutes else f"No periodic check-in required. Grace period: {grace_period_minutes}m.",
        metadata={'mode': mode, 'checkin_interval': checkin_interval_minutes, 'grace_period': grace_period_minutes}
    )

    return walk_dict


def get_active_safewalk(user_id: int):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT * FROM safe_walks
        WHERE user_id = %s AND status IN ('active', 'arrival_unconfirmed', 'overdue_processing')
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (user_id,)
    )
    walk = cur.fetchone()
    cur.close()
    conn.close()
    return dict(walk) if walk else None


def get_safewalk_by_id(walk_id: int, user_id: int = None):
    conn = get_connection()
    cur = conn.cursor()
    if user_id is not None:
        cur.execute("SELECT * FROM safe_walks WHERE id = %s AND user_id = %s", (walk_id, user_id))
    else:
        cur.execute("SELECT * FROM safe_walks WHERE id = %s", (walk_id,))
    walk = cur.fetchone()
    cur.close()
    conn.close()
    return dict(walk) if walk else None


def checkin_safewalk(walk_id: int, user_id: int):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM safe_walks WHERE id = %s AND user_id = %s", (walk_id, user_id))
    walk = cur.fetchone()
    if not walk:
        cur.close()
        conn.close()
        return None

    interval = walk.get('checkin_interval_minutes')
    if interval:
        cur.execute(
            """
            UPDATE safe_walks
            SET last_checkin_at = NOW(),
                next_checkin_due = NOW() + (%s * INTERVAL '1 minute'),
                status = 'active',
                escalation_stage = 'none'
            WHERE id = %s AND user_id = %s
            RETURNING *
            """,
            (interval, walk_id, user_id)
        )
    else:
        cur.execute(
            """
            UPDATE safe_walks
            SET last_checkin_at = NOW(),
                status = 'active',
                escalation_stage = 'none'
            WHERE id = %s AND user_id = %s
            RETURNING *
            """,
            (walk_id, user_id)
        )
    updated = cur.fetchone()
    cur.close()
    conn.close()

    if updated:
        add_safewalk_event(
            walk_id=walk_id,
            user_id=user_id,
            event_type='safety_confirmed',
            title='Safety Confirmed',
            description=f"User checked in safely. Next check-in in {interval} minutes." if interval else "User confirmed safety.",
            metadata={'checkin_at': updated['last_checkin_at'].isoformat() if updated.get('last_checkin_at') else None}
        )
        return dict(updated)
    return None


def extend_safewalk_eta(walk_id: int, user_id: int, extra_minutes: int):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE safe_walks
        SET eta = GREATEST(eta, NOW()) + (%s * INTERVAL '1 minute'),
            next_checkin_due = CASE
                WHEN checkin_interval_minutes IS NOT NULL THEN
                    GREATEST(COALESCE(next_checkin_due, NOW()), NOW() + (%s * INTERVAL '1 minute'))
                ELSE next_checkin_due
            END,
            status = 'active',
            escalation_stage = 'none'
        WHERE id = %s AND user_id = %s
        RETURNING *
        """,
        (extra_minutes, extra_minutes, walk_id, user_id)
    )
    updated = cur.fetchone()
    cur.close()
    conn.close()

    if updated:
        eta_display = updated['eta'].strftime('%I:%M %p') if hasattr(updated['eta'], 'strftime') else str(updated['eta'])
        add_safewalk_event(
            walk_id=walk_id,
            user_id=user_id,
            event_type='eta_extended',
            title=f"ETA Extended (+{extra_minutes}m)",
            description=f"Expected arrival pushed by {extra_minutes} minutes. New arrival: {eta_display}.",
            metadata={'extra_minutes': extra_minutes, 'new_eta': updated['eta'].isoformat() if hasattr(updated['eta'], 'isoformat') else str(updated['eta'])}
        )
        return dict(updated)
    return None


def end_safewalk(walk_id: int, user_id: int, status: str = 'completed'):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE safe_walks SET status = %s WHERE id = %s AND user_id = %s RETURNING *",
        (status, walk_id, user_id)
    )
    walk = cur.fetchone()
    cur.close()
    conn.close()

    if walk:
        add_safewalk_event(
            walk_id=walk_id,
            user_id=user_id,
            event_type='completed',
            title='Journey Completed',
            description='User marked journey as completed safely.',
            metadata={'final_status': status}
        )
        return dict(walk)
    return None


def flag_grace_period_safewalks():
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE safe_walks
        SET status = 'arrival_unconfirmed',
            escalation_stage = 'grace_active'
        WHERE status = 'active'
          AND escalation_stage = 'none'
          AND (
              (eta IS NOT NULL AND eta <= NOW())
              OR
              (checkin_interval_minutes IS NOT NULL AND next_checkin_due IS NOT NULL AND next_checkin_due <= NOW())
          )
        RETURNING *
        """
    )
    walks = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(w) for w in walks]


def claim_overdue_safewalks(limit: int = 50):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        UPDATE safe_walks
        SET escalation_stage = 'unconfirmed_alerted'
        WHERE id IN (
            SELECT id
            FROM safe_walks
            WHERE status = 'arrival_unconfirmed'
              AND escalation_stage = 'grace_active'
              AND (
                  (eta IS NOT NULL AND eta + (COALESCE(grace_period_minutes, 5) * INTERVAL '1 minute') <= NOW())
                  OR
                  (checkin_interval_minutes IS NOT NULL AND next_checkin_due IS NOT NULL AND next_checkin_due + (COALESCE(grace_period_minutes, 5) * INTERVAL '1 minute') <= NOW())
              )
            ORDER BY eta ASC
            LIMIT %s
            FOR UPDATE SKIP LOCKED
        )
        RETURNING *
        """,
        (limit,)
    )
    walks = cur.fetchall()
    cur.close()
    conn.close()
    return [dict(w) for w in walks]


def update_safewalk_status(walk_id: int, user_id: int, status: str):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE safe_walks SET status = %s WHERE id = %s AND user_id = %s RETURNING *",
        (status, walk_id, user_id)
    )
    walk = cur.fetchone()
    cur.close()
    conn.close()
    return dict(walk) if walk else None
