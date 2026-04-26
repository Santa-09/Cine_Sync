import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useSocket } from '../hooks/useSocket';
import { useVideoSync } from '../hooks/useVideoSync';
import { useRoom } from '../context/RoomContext';
import styles from './WatchPage.module.css';

const CHUNK_RETRY_LIMIT = 3;
const RESUME_STORAGE_PREFIX = 'cine-sync-upload';

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function WatchPage() {
  const { roomId: routeRoomId } = useParams();
  const roomId = routeRoomId.toUpperCase();
  const navigate = useNavigate();
  const socket = useSocket();
  const {
    username,
    isHost,
    setIsHost,
    setRoomId,
    members,
    setMembers,
    currentMovie,
    setCurrentMovie,
    videoUrl,
    setVideoUrl,
  } = useRoom();

  const videoRef = useRef(null);
  const chatEndRef = useRef(null);

  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState('');
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [localFiles, setLocalFiles] = useState([]);
  const [fileError, setFileError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [directUrl, setDirectUrl] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [initialPlayback, setInitialPlayback] = useState(null);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sidePanel, setSidePanel] = useState('chat');

  const { onPlay, onPause, onSeeked } = useVideoSync({ videoRef, roomId, isHost });

  const loadLocalFiles = useCallback(async () => {
    try {
      setFileError('');
      const { data } = await axios.get('/api/videos');
      setLocalFiles(data || []);
      if (!data?.length) {
        setFileError('No movie files found in MOVIES_DIR.');
      }
    } catch {
      setLocalFiles([]);
      setFileError('Could not read the movie folder.');
    }
  }, []);

  useEffect(() => {
    if (!username) {
      navigate('/');
      return;
    }

    setRoomId(roomId);

    socket.emit('room:join', { roomId, username }, (res) => {
      if (res?.success) {
        setIsHost(res.isHost);
        setMembers(res.room.members || []);
        setChatMessages(res.room.chat || []);
        if (res.room.videoUrl) setVideoUrl(res.room.videoUrl);
        if (res.room.videoName) setCurrentMovie({ title: res.room.videoName });
        setInitialPlayback({
          currentTime: res.room.currentTime || 0,
          isPlaying: Boolean(res.room.isPlaying),
        });
        setJoined(true);
      } else {
        setError('Room not found or connection failed.');
      }
    });

    return () => {
      socket.emit('room:leave', { roomId });
    };
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onUserJoined = ({ member }) => {
      setMembers((prev) => [...prev.filter((m) => m.socketId !== member.socketId), member]);
    };
    const onUserLeft = ({ socketId }) => {
      setMembers((prev) => prev.filter((m) => m.socketId !== socketId));
    };
    const onVideoUrl = ({ videoUrl: url, filename }) => {
      setVideoUrl(url);
      setCurrentMovie(filename ? { title: filename } : null);
      setInitialPlayback({ currentTime: 0, isPlaying: false });
      setIsPlaying(false);
    };
    const onChatMsg = (msg) => {
      setChatMessages((prev) => [...prev, msg]);
    };
    const onForceClosed = () => {
      alert('This room was closed by admin.');
      navigate('/');
    };
    const onHostChanged = ({ newHostId, members: updatedMembers }) => {
      setIsHost(socket.id === newHostId);
      if (updatedMembers) setMembers(updatedMembers);
    };

    socket.on('room:user-joined', onUserJoined);
    socket.on('room:user-left', onUserLeft);
    socket.on('room:video-url', onVideoUrl);
    socket.on('chat:message', onChatMsg);
    socket.on('room:force-closed', onForceClosed);
    socket.on('room:host-changed', onHostChanged);

    return () => {
      socket.off('room:user-joined', onUserJoined);
      socket.off('room:user-left', onUserLeft);
      socket.off('room:video-url', onVideoUrl);
      socket.off('chat:message', onChatMsg);
      socket.off('room:force-closed', onForceClosed);
      socket.off('room:host-changed', onHostChanged);
    };
  }, [socket, navigate, setIsHost, setMembers, setCurrentMovie, setVideoUrl]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    if (isHost) loadLocalFiles();
  }, [isHost, loadLocalFiles]);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    onPlay();
  }, [onPlay]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
    onPause();
  }, [onPause]);

  const handleSeeked = useCallback(() => {
    onSeeked();
  }, [onSeeked]);

  const handleTimeUpdate = useCallback(() => {
    setCurrentTime(videoRef.current?.currentTime || 0);
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    setDuration(video?.duration || 0);

    if (!video || isHost || !initialPlayback) return;
    video.currentTime = initialPlayback.currentTime || 0;
    if (initialPlayback.isPlaying) {
      video.play().catch(() => {});
    }
    setInitialPlayback(null);
  }, [initialPlayback, isHost]);

  const togglePlay = () => {
    if (!videoRef.current || !isHost) return;
    videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause();
  };

  const seek = (e) => {
    if (!videoRef.current || !isHost) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    videoRef.current.currentTime = pct * duration;
  };

  const changeVolume = (e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (videoRef.current) videoRef.current.volume = v;
    setIsMuted(v === 0);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  const toggleFullscreen = () => {
    const el = document.querySelector(`.${styles.playerWrap}`);
    if (!document.fullscreenElement) {
      el?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const sendChat = () => {
    if (!chatInput.trim()) return;
    socket.emit('chat:message', { roomId, text: chatInput.trim() });
    setChatInput('');
  };

  const setLocalVideo = (filename) => {
    const url = `/api/video/${encodeURIComponent(filename)}`;
    setVideoUrl(url);
    setCurrentMovie({ title: filename });
    socket.emit('room:video-url', { roomId, videoUrl: url, filename });
    setShowFilePicker(false);
  };

  const uploadMovie = async (file) => {
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);
    setUploadStatus('Preparing upload...');
    setFileError('');

    try {
      const resumeKey = `${file.name}-${file.size}-${file.lastModified}`
        .replace(/[^a-z0-9_-]/gi, '-')
        .slice(0, 120);
      const storageKey = `${RESUME_STORAGE_PREFIX}:${resumeKey}`;
      const { data: session } = await axios.post('/api/videos/upload-session', {
        filename: file.name,
        fileSize: file.size,
        resumeKey,
      });

      const uploadedChunks = new Set(session.uploadedChunks || []);
      let uploadedBytes = 0;

      uploadedChunks.forEach((chunkIndex) => {
        const chunkStart = chunkIndex * session.chunkSize;
        const chunkEnd = Math.min(file.size, chunkStart + session.chunkSize);
        uploadedBytes += Math.max(0, chunkEnd - chunkStart);
      });

      setUploadProgress(Math.round((uploadedBytes / file.size) * 100));
      setUploadStatus(session.resumed ? 'Resuming upload...' : 'Uploading chunks...');
      localStorage.setItem(storageKey, session.uploadId);

      for (let chunkIndex = 0; chunkIndex < session.totalChunks; chunkIndex += 1) {
        if (uploadedChunks.has(chunkIndex)) continue;

        const chunkStart = chunkIndex * session.chunkSize;
        const chunkEnd = Math.min(file.size, chunkStart + session.chunkSize);
        const chunk = file.slice(chunkStart, chunkEnd);

        let uploaded = false;
        let lastError = null;

        for (let attempt = 1; attempt <= CHUNK_RETRY_LIMIT; attempt += 1) {
          try {
            setUploadStatus(
              attempt > 1
                ? `Retrying chunk ${chunkIndex + 1} of ${session.totalChunks}...`
                : `Uploading chunk ${chunkIndex + 1} of ${session.totalChunks}...`
            );

            await axios.put(`/api/videos/upload-session/${session.uploadId}/chunks/${chunkIndex}`, chunk, {
              headers: {
                'Content-Type': 'application/octet-stream',
              },
              timeout: 120000,
            });

            uploaded = true;
            uploadedBytes += chunk.size;
            setUploadProgress(Math.round((uploadedBytes / file.size) * 100));
            break;
          } catch (error) {
            lastError = error;
            if (attempt < CHUNK_RETRY_LIMIT) {
              await delay(1000 * attempt);
            }
          }
        }

        if (!uploaded) {
          throw lastError || new Error('Chunk upload failed.');
        }
      }

      setUploadStatus('Finalizing upload...');
      const { data } = await axios.post(`/api/videos/upload-session/${session.uploadId}/complete`);
      localStorage.removeItem(storageKey);
      setUploadProgress(100);
      setUploadStatus('Upload complete.');
      await loadLocalFiles();
      setLocalVideo(data.filename);
    } catch (err) {
      setFileError(err.response?.data?.error || 'Upload failed.');
      setUploadStatus('');
    } finally {
      setUploading(false);
    }
  };

  const setDirectVideoUrl = () => {
    const url = directUrl.trim();
    if (!url) return;

    setVideoUrl(url);
    setCurrentMovie({ title: url });
    socket.emit('room:video-url', { roomId, videoUrl: url, filename: url });
    setDirectUrl('');
    setShowFilePicker(false);
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(`${window.location.origin}/room/${roomId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (s) => {
    if (!s || isNaN(s)) return '0:00';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  };

  if (!joined && !error) {
    return (
      <div className={styles.loadingPage}>
        <div className={styles.loadingSpinner} />
        <p>Joining room <strong>{roomId}</strong>...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.errorPage}>
        <h2>Room not found</h2>
        <p>{error}</p>
        <button onClick={() => navigate('/')}>Go Home</button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <button className={styles.backBtn} onClick={() => navigate('/')}>Home</button>
        <div className={styles.roomInfo}>
          <span className={styles.roomCode}>ROOM: {roomId}</span>
          <button className={styles.copyBtn} onClick={copyRoomCode}>
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
        <div className={styles.topBarRight}>
          <div className={styles.memberCount}>
            <span className={styles.memberDot} />
            {members.length} watching
          </div>
          {isHost && <span className={styles.hostBadge}>HOST</span>}
        </div>
      </header>

      <div className={styles.layout}>
        <div className={styles.playerColumn}>
          {currentMovie && (
            <div className={styles.movieStrip}>
              <div>
                <div className={styles.movieStripTitle}>{currentMovie.title}</div>
                {isHost && (
                  <div className={styles.movieStripActions}>
                    <button className={styles.smallBtn} onClick={() => setShowFilePicker((v) => !v)}>
                      Change Movie File
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className={styles.playerWrap} onMouseMove={() => setShowControls(true)}>
            {videoUrl ? (
              <video
                ref={videoRef}
                className={styles.video}
                src={videoUrl}
                onPlay={handlePlay}
                onPause={handlePause}
                onSeeked={handleSeeked}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
              />
            ) : (
              <div className={styles.noVideo}>
                <div className={styles.noVideoOverlay}>
                  <div className={styles.noVideoIcon}>🎬</div>
                  {isHost ? (
                    <>
                      <p className={styles.noVideoText}>Choose a movie file to start</p>
                      <div className={styles.noVideoActions}>
                        <button className={styles.noVideoBtn} onClick={() => setShowFilePicker(true)}>
                          Choose Movie File
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className={styles.noVideoText}>Waiting for host to choose a movie...</p>
                  )}
                </div>
              </div>
            )}

            {videoUrl && (
              <div className={`${styles.controls} ${showControls ? styles.controlsVisible : ''}`}>
                <div className={styles.progressWrap} onClick={seek}>
                  <div className={styles.progressBg}>
                    <div
                      className={styles.progressFill}
                      style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
                    />
                  </div>
                </div>

                <div className={styles.controlsRow}>
                  <div className={styles.controlsLeft}>
                    <button
                      className={styles.controlBtn}
                      onClick={togglePlay}
                      disabled={!isHost}
                      title={!isHost ? 'Only host can control playback' : ''}
                    >
                      {isPlaying ? 'Pause' : 'Play'}
                    </button>
                    <div className={styles.volumeGroup}>
                      <button className={styles.controlBtn} onClick={toggleMute}>
                        {isMuted || volume === 0 ? 'Mute' : 'Vol'}
                      </button>
                      <input
                        type="range"
                        className={styles.volumeSlider}
                        min="0"
                        max="1"
                        step="0.05"
                        value={isMuted ? 0 : volume}
                        onChange={changeVolume}
                      />
                    </div>
                    <span className={styles.timeDisplay}>
                      {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                  </div>

                  <div className={styles.controlsRight}>
                    {!isHost && <span className={styles.viewerTag}>Viewer</span>}
                    <button className={styles.controlBtn} onClick={toggleFullscreen}>
                      {isFullscreen ? 'Exit' : 'Full'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {isHost && showFilePicker && (
            <div className={styles.urlPanel}>
              <p className={styles.urlPanelTitle}>Choose Movie File</p>
              <label className={styles.uploadBox}>
                <span>{uploading ? `Uploading ${uploadProgress}%` : 'Browse from your computer'}</span>
                <input
                  type="file"
                  accept=".mp4,.mkv,.webm,.avi,.mov,video/*"
                  disabled={uploading}
                  onChange={(event) => uploadMovie(event.target.files?.[0])}
                />
              </label>
              {uploading && (
                <div className={styles.uploadMeta}>
                  <div className={styles.uploadProgressBar}>
                    <div className={styles.uploadProgressFill} style={{ width: `${uploadProgress}%` }} />
                  </div>
                  <p className={styles.urlSubtitle}>{uploadStatus}</p>
                </div>
              )}
              <div className={styles.urlRow}>
                <input
                  className={styles.urlInput}
                  placeholder="Or paste a direct video URL..."
                  value={directUrl}
                  onChange={(event) => setDirectUrl(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && setDirectVideoUrl()}
                />
                <button className={styles.urlSetBtn} onClick={setDirectVideoUrl}>Use URL</button>
              </div>
              <div className={styles.movieStripActions}>
                <button className={styles.smallBtn} onClick={loadLocalFiles}>Refresh Folder</button>
              </div>
              {fileError && <p className={styles.urlSubtitle}>{fileError}</p>}
              {localFiles.length > 0 && (
                <div className={styles.localFilesList}>
                  {localFiles.map((file) => (
                    <button key={file} className={styles.localFileBtn} onClick={() => setLocalVideo(file)}>
                      {file}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.sidebar}>
          <div className={styles.sidebarTabs}>
            <button
              className={`${styles.sidebarTab} ${sidePanel === 'chat' ? styles.sidebarTabActive : ''}`}
              onClick={() => setSidePanel('chat')}
            >
              Chat
            </button>
            <button
              className={`${styles.sidebarTab} ${sidePanel === 'members' ? styles.sidebarTabActive : ''}`}
              onClick={() => setSidePanel('members')}
            >
              Members ({members.length})
            </button>
          </div>

          {sidePanel === 'chat' ? (
            <ChatPanel
              messages={chatMessages}
              chatInput={chatInput}
              setChatInput={setChatInput}
              sendChat={sendChat}
              chatEndRef={chatEndRef}
              username={username}
            />
          ) : (
            <MembersPanel members={members} />
          )}
        </div>
      </div>
    </div>
  );
}

function ChatPanel({ messages, chatInput, setChatInput, sendChat, chatEndRef, username }) {
  return (
    <div className={styles.chatPanel}>
      <div className={styles.chatMessages}>
        {messages.map((msg, i) => (
          <div key={msg.id || i} className={`${styles.chatMsg} ${msg.username === username ? styles.chatMsgSelf : ''}`}>
            {msg.username !== username && (
              <div className={styles.chatAvatar}>{msg.username?.charAt(0).toUpperCase()}</div>
            )}
            <div className={styles.chatBubbleWrap}>
              {msg.username !== username && <span className={styles.chatName}>{msg.username}</span>}
              <div className={styles.chatBubble}>{msg.text}</div>
              <span className={styles.chatTime}>
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
      <div className={styles.chatInputRow}>
        <input
          className={styles.chatInput}
          placeholder="Say something..."
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendChat()}
          maxLength={300}
        />
        <button className={styles.chatSendBtn} onClick={sendChat}>Send</button>
      </div>
    </div>
  );
}

function MembersPanel({ members }) {
  return (
    <div className={styles.membersPanel}>
      {members.map((member, i) => (
        <div key={member.socketId || i} className={styles.memberRow}>
          <div className={styles.memberAvatar}>{member.username?.charAt(0).toUpperCase()}</div>
          <div className={styles.memberInfo}>
            <span className={styles.memberName}>{member.username}</span>
            {member.isHost && <span className={styles.memberHostTag}>HOST</span>}
          </div>
          <div className={`${styles.memberStatus} ${styles.memberOnline}`} />
        </div>
      ))}
    </div>
  );
}
