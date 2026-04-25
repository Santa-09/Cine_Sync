import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useSocket } from '../hooks/useSocket';
import styles from './AdminPage.module.css';

const ADMIN_KEY = 'wp_admin_secret';

export default function AdminPage() {
  const navigate = useNavigate();
  const socket = useSocket();
  const [secret, setSecret] = useState(() => localStorage.getItem(ADMIN_KEY) || '');
  const [authed, setAuthed] = useState(false);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null); // roomId or 'all'
  const [toast, setToast] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const fetchStats = useCallback(async (s = secret) => {
    if (!s) return;
    setLoading(true);
    try {
      const { data } = await axios.get('/api/admin/stats', {
        headers: { 'x-admin-secret': s },
      });
      setStats(data);
      setAuthed(true);
      setError('');
      localStorage.setItem(ADMIN_KEY, s);
    } catch (err) {
      if (err.response?.status === 401) {
        setError('Incorrect admin password');
        setAuthed(false);
      } else {
        setError('Server unreachable');
      }
    } finally {
      setLoading(false);
    }
  }, [secret]);

  // Auto-refresh every 5s
  useEffect(() => {
    if (!authed || !autoRefresh) return;
    const id = setInterval(() => fetchStats(), 5000);
    return () => clearInterval(id);
  }, [authed, autoRefresh, fetchStats]);

  const login = () => fetchStats(secret);

  const deleteRoom = async (roomId) => {
    try {
      await axios.delete(`/api/admin/rooms/${roomId}`, {
        headers: { 'x-admin-secret': secret },
      });
      // Also emit socket event to force-close
      socket.emit('admin:close-room', { roomId, secret });
      showToast(`Room ${roomId} deleted`);
      setConfirmDelete(null);
      fetchStats();
    } catch {
      showToast('Failed to delete room');
    }
  };

  const deleteAllRooms = async () => {
    try {
      const { data } = await axios.delete('/api/admin/rooms', {
        headers: { 'x-admin-secret': secret },
      });
      showToast(`Deleted ${data.deleted} rooms`);
      setConfirmDelete(null);
      fetchStats();
    } catch {
      showToast('Failed to delete all rooms');
    }
  };

  const logout = () => {
    setAuthed(false);
    setSecret('');
    setStats(null);
    localStorage.removeItem(ADMIN_KEY);
  };

  // ── Login screen ──────────────────────────────────────────
  if (!authed) {
    return (
      <div className={styles.loginPage}>
        <div className={styles.loginBg} />
        <div className={styles.loginCard}>
          <div className={styles.loginIcon}>⚙</div>
          <h1 className={styles.loginTitle}>Admin Panel</h1>
          <p className={styles.loginSubtitle}>CineSync Global Admin Access</p>
          <div className={styles.loginField}>
            <label className={styles.loginLabel}>Admin Password</label>
            <input
              className={styles.loginInput}
              type="password"
              placeholder="Enter your admin secret..."
              value={secret}
              onChange={e => setSecret(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && login()}
              autoFocus
            />
          </div>
          {error && <p className={styles.loginError}>{error}</p>}
          <button className={styles.loginBtn} onClick={login} disabled={loading}>
            {loading ? <span className={styles.spin} /> : 'Access Dashboard'}
          </button>
          <button className={styles.loginBack} onClick={() => navigate('/')}>← Back to Home</button>
        </div>
      </div>
    );
  }

  // ── Dashboard ─────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <div className={styles.bg} />

      {/* Toast */}
      {toast && <div className={styles.toast}>{toast}</div>}

      {/* Confirm dialog */}
      {confirmDelete && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmCard}>
            <div className={styles.confirmIcon}>⚠</div>
            <h3 className={styles.confirmTitle}>
              {confirmDelete === 'all' ? 'Delete ALL rooms?' : `Delete room ${confirmDelete}?`}
            </h3>
            <p className={styles.confirmDesc}>
              {confirmDelete === 'all'
                ? 'All active rooms will be force-closed and users disconnected.'
                : 'All users in this room will be disconnected immediately.'
              }
            </p>
            <div className={styles.confirmActions}>
              <button className={styles.confirmCancel} onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button
                className={styles.confirmDelete}
                onClick={() => confirmDelete === 'all' ? deleteAllRooms() : deleteRoom(confirmDelete)}
              >Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button className={styles.backBtn} onClick={() => navigate('/')}>← Home</button>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>⚙</span>
            Admin Dashboard
          </div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.autoRefreshToggle}>
            <button
              className={`${styles.toggleBtn} ${autoRefresh ? styles.toggleOn : ''}`}
              onClick={() => setAutoRefresh(v => !v)}
            >
              {autoRefresh ? '⟳ Live' : '⟳ Paused'}
            </button>
          </div>
          <button className={styles.refreshBtn} onClick={() => fetchStats()}>Refresh</button>
          <button className={styles.logoutBtn} onClick={logout}>Logout</button>
        </div>
      </header>

      {/* Stat cards */}
      <div className={styles.statCards}>
        <div className={styles.statCard}>
          <div className={styles.statCardIcon}>🏠</div>
          <div className={styles.statCardValue}>{stats?.totalRooms ?? 0}</div>
          <div className={styles.statCardLabel}>Active Rooms</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statCardIcon}>👥</div>
          <div className={styles.statCardValue}>{stats?.totalUsers ?? 0}</div>
          <div className={styles.statCardLabel}>Total Viewers</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statCardIcon}>▶</div>
          <div className={styles.statCardValue}>
            {stats?.rooms?.filter(r => r.isPlaying).length ?? 0}
          </div>
          <div className={styles.statCardLabel}>Currently Playing</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statCardIcon}>🌐</div>
          <div className={styles.statCardValue} style={{ color: 'var(--green)', fontSize: '18px' }}>ONLINE</div>
          <div className={styles.statCardLabel}>Server Status</div>
        </div>
      </div>

      {/* Actions bar */}
      <div className={styles.actionsBar}>
        <h2 className={styles.sectionTitle}>
          Active Rooms
          {loading && <span className={styles.loadingDot} />}
        </h2>
        <button
          className={styles.dangerBtn}
          onClick={() => setConfirmDelete('all')}
          disabled={!stats?.rooms?.length}
        >
          🗑 Delete All Rooms
        </button>
      </div>

      {/* Rooms table */}
      {stats?.rooms?.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🎬</div>
          <p className={styles.emptyText}>No active rooms right now</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Room ID</th>
                <th>Host</th>
                <th>Movie</th>
                <th>Members</th>
                <th>Status</th>
                <th>Created</th>
                <th>Last Active</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {stats?.rooms?.map(room => (
                <tr key={room.id} className={styles.tableRow}>
                  <td>
                    <span className={styles.roomIdCell}>{room.id}</span>
                  </td>
                  <td>
                    <div className={styles.hostCell}>
                      <div className={styles.hostAvatar}>{room.hostName?.charAt(0).toUpperCase()}</div>
                      {room.hostName}
                    </div>
                  </td>
                  <td>
                    <span className={styles.movieCell} title={room.movie}>
                      {room.movie}
                    </span>
                  </td>
                  <td>
                    <div className={styles.memberCountCell}>
                      <span className={styles.memberDot} />
                      {room.memberCount}
                    </div>
                  </td>
                  <td>
                    {room.isPlaying
                      ? <span className={styles.statusPlaying}>▶ Playing</span>
                      : <span className={styles.statusPaused}>⏸ Paused</span>
                    }
                  </td>
                  <td className={styles.dateCell}>
                    {new Date(room.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className={styles.dateCell}>
                    {new Date(room.lastActivity).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>
                    <div className={styles.tableActions}>
                      <button
                        className={styles.viewBtn}
                        onClick={() => window.open(`/room/${room.id}`, '_blank')}
                      >
                        View
                      </button>
                      <button
                        className={styles.deleteRoomBtn}
                        onClick={() => setConfirmDelete(room.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer info */}
      <div className={styles.footer}>
        <p className={styles.footerText}>
          CineSync Admin • Auto-refreshes every 5s • Changes take effect immediately
        </p>
      </div>
    </div>
  );
}
