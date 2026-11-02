"""
ShieldHer — Database Setup (PostgreSQL)
Creates tables and provides helper functions for all DB operations.
"""

import os
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

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
            status VARCHAR(20) DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
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

def create_safewalk(user_id: int, dest_name: str, dest_lat: float, dest_lng: float, eta: str):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE safe_walks SET status = 'superseded' WHERE user_id = %s AND status = 'active'",
        (user_id,)
    )
    cur.execute(
        "INSERT INTO safe_walks (user_id, dest_name, dest_lat, dest_lng, eta) VALUES (%s, %s, %s, %s, %s) RETURNING *",
        (user_id, dest_name, dest_lat, dest_lng, eta)
    )
    walk = cur.fetchone()
    cur.close()
    conn.close()
    return dict(walk)


def get_active_safewalk(user_id: int):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT * FROM safe_walks WHERE user_id = %s AND status = 'active' ORDER BY created_at DESC LIMIT 1", (user_id,))
    walk = cur.fetchone()
    cur.close()
    conn.close()
    return dict(walk) if walk else None


def get_overdue_safewalks(limit: int = 50):
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        """
        SELECT *
        FROM safe_walks
        WHERE status = 'active'
          AND eta IS NOT NULL
          AND eta <= NOW()
        ORDER BY eta ASC
        LIMIT %s
        """,
        (limit,)
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
        SET status = 'overdue_processing'
        WHERE id IN (
            SELECT id
            FROM safe_walks
            WHERE status = 'active'
              AND eta IS NOT NULL
              AND eta <= NOW()
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


def end_safewalk(walk_id: int, user_id: int, status: str = "completed"):
    return update_safewalk_status(walk_id, user_id, status)
