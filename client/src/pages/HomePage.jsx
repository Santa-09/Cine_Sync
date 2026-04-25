import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useRoom } from '../context/RoomContext';
import styles from './HomePage.module.css';

export default function HomePage() {
  const navigate = useNavigate();
  const { username, setUsername, setRoomId, setIsHost } = useRoom();
  const [name, setName] = useState(username);
  const [joinCode, setJoinCode] = useState('');
  const [tab, setTab] = useState('create'); // 'create' | 'join'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return setError('Enter your name first');
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.post('/api/rooms', { hostName: name.trim() });
      setUsername(name.trim());
      setRoomId(data.roomId);
      setIsHost(true);
      navigate(`/room/${data.roomId}`);
    } catch {
      setError('Failed to create room. Server offline?');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = () => {
    if (!name.trim()) return setError('Enter your name first');
    if (!joinCode.trim()) return setError('Enter a room code');
    setUsername(name.trim());
    setRoomId(joinCode.trim().toUpperCase());
    setIsHost(false);
    navigate(`/room/${joinCode.trim().toUpperCase()}`);
  };

  return (
    <div className={styles.page}>
      {/* Cinematic background */}
      <div className={styles.bg}>
        <div className={styles.bgGrid} />
        <div className={styles.bgGlow1} />
        <div className={styles.bgGlow2} />
        <div className={styles.bgFilm} />
      </div>

      {/* Nav */}
      <nav className={styles.nav}>
        <div className={styles.navLogo}>
          <span className={styles.logoIcon}>◈</span>
          <span className={styles.logoText}>CineSync</span>
        </div>
        <div className={styles.navLinks}>
          <button className={styles.navLink} onClick={() => navigate('/admin')}>Admin</button>
        </div>
      </nav>

      {/* Hero */}
      <main className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.badge}>
            <span className={styles.badgeDot} />
            Real-time sync
          </div>
          <h1 className={styles.heroTitle}>
            Watch movies<br />
            <em>together.</em>
          </h1>
          <p className={styles.heroSubtitle}>
            Create a room, invite your crew, and stream in perfect sync —
            no matter where they are.
          </p>

          {/* Card */}
          <div className={styles.card}>
            {/* Tabs */}
            <div className={styles.tabs}>
              <button
                className={`${styles.tab} ${tab === 'create' ? styles.tabActive : ''}`}
                onClick={() => { setTab('create'); setError(''); }}
              >Create Room</button>
              <button
                className={`${styles.tab} ${tab === 'join' ? styles.tabActive : ''}`}
                onClick={() => { setTab('join'); setError(''); }}
              >Join Room</button>
            </div>

            <div className={styles.cardBody}>
              <div className={styles.field}>
                <label className={styles.label}>Your Name</label>
                <input
                  className={styles.input}
                  placeholder="e.g. Alex"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') tab === 'create' ? handleCreate() : handleJoin(); }}
                  maxLength={24}
                />
              </div>

              {tab === 'join' && (
                <div className={styles.field}>
                  <label className={styles.label}>Room Code</label>
                  <input
                    className={`${styles.input} ${styles.inputCode}`}
                    placeholder="e.g. A1B2C3D4"
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }}
                    maxLength={8}
                  />
                </div>
              )}

              {error && <p className={styles.error}>{error}</p>}

              <button
                className={styles.cta}
                onClick={tab === 'create' ? handleCreate : handleJoin}
                disabled={loading}
              >
                {loading ? <span className={styles.spinner} /> : null}
                {tab === 'create' ? 'Create Room' : 'Join Room'}
                {!loading && <span className={styles.ctaArrow}>→</span>}
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statNum}>HD</span>
              <span className={styles.statLabel}>Quality</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.stat}>
              <span className={styles.statNum}>&lt;1s</span>
              <span className={styles.statLabel}>Sync Lag</span>
            </div>
            <div className={styles.statDivider} />
            <div className={styles.stat}>
              <span className={styles.statNum}>∞</span>
              <span className={styles.statLabel}>Rooms</span>
            </div>
          </div>
        </div>

        {/* Right: floating movie cards decoration */}
        <div className={styles.heroVisual}>
          <div className={styles.floatCard1}>
            <div className={styles.floatPoster} style={{ background: 'linear-gradient(135deg, #1a1a2e, #16213e)' }}>
              <div className={styles.floatPosterShimmer} />
              <span className={styles.floatIcon}>🎬</span>
            </div>
            <div className={styles.floatInfo}>
              <div className={styles.floatTitle}>Now Watching</div>
              <div className={styles.floatSub}>4 members online</div>
            </div>
            <div className={styles.liveDot} />
          </div>
          <div className={styles.floatCard2}>
            <div className={styles.chatBubble}>
              <span className={styles.chatAvatar}>K</span>
              <span className={styles.chatText}>omg this scene 🔥</span>
            </div>
            <div className={styles.chatBubble} style={{ alignSelf: 'flex-end' }}>
              <span className={styles.chatText}>SAME 😭</span>
              <span className={styles.chatAvatar} style={{ background: 'var(--blue)' }}>A</span>
            </div>
          </div>
          <div className={styles.floatCard3}>
            <div className={styles.syncIndicator}>
              <div className={styles.syncWave} />
              <span>Synced</span>
            </div>
          </div>
        </div>
      </main>

      {/* Features */}
      <section className={styles.features}>
        {[
          { icon: '⚡', title: 'Real-time Sync', desc: 'Play, pause, seek — all perfectly synced across every viewer instantly.' },
          { icon: '📁', title: 'Local Movie Folder', desc: 'Pick downloaded movies from your configured folder and start watching.' },
          { icon: '💬', title: 'Live Chat', desc: 'React together with a built-in chat panel — no third-party app needed.' },
        ].map((f, i) => (
          <div key={i} className={styles.feature} style={{ animationDelay: `${i * 0.1}s` }}>
            <div className={styles.featureIcon}>{f.icon}</div>
            <h3 className={styles.featureTitle}>{f.title}</h3>
            <p className={styles.featureDesc}>{f.desc}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
