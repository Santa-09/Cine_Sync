import { useEffect, useRef, useCallback } from 'react';
import { useSocket } from './useSocket';

const DRIFT_THRESHOLD = 0.75;
const HARD_SYNC_THRESHOLD = 2;

export function useVideoSync({ videoRef, roomId, isHost }) {
  const socket = useSocket();
  const isSyncing = useRef(false); // prevent echo loops
  const heartbeatRef = useRef(null);

  // Host: emit events when video changes state
  const onPlay = useCallback(() => {
    if (!isHost || isSyncing.current) return;
    socket.emit('sync:play', { roomId, currentTime: videoRef.current?.currentTime || 0 });
  }, [isHost, roomId, socket, videoRef]);

  const onPause = useCallback(() => {
    if (!isHost || isSyncing.current) return;
    socket.emit('sync:pause', { roomId, currentTime: videoRef.current?.currentTime || 0 });
  }, [isHost, roomId, socket, videoRef]);

  const onSeeked = useCallback(() => {
    if (!isHost || isSyncing.current) return;
    socket.emit('sync:seek', { roomId, currentTime: videoRef.current?.currentTime || 0 });
  }, [isHost, roomId, socket, videoRef]);

  const syncToTime = useCallback((targetTime, shouldPlay) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(targetTime)) return;

    isSyncing.current = true;
    const drift = Math.abs(video.currentTime - targetTime);

    if (drift > HARD_SYNC_THRESHOLD) {
      video.currentTime = targetTime;
    } else if (drift > DRIFT_THRESHOLD && shouldPlay && video.playbackRate) {
      video.playbackRate = video.currentTime < targetTime ? 1.08 : 0.92;
      setTimeout(() => {
        if (video.playbackRate !== 1) video.playbackRate = 1;
      }, 1200);
    }

    if (shouldPlay) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }

    setTimeout(() => {
      isSyncing.current = false;
    }, 350);
  }, [videoRef]);

  // Host heartbeat keeps viewers locked to the real host position.
  useEffect(() => {
    if (!isHost) return;
    heartbeatRef.current = setInterval(() => {
      if (videoRef.current) {
        socket.emit('sync:heartbeat', {
          roomId,
          currentTime: videoRef.current.currentTime,
        });
      }
    }, 1000);
    return () => clearInterval(heartbeatRef.current);
  }, [isHost, roomId, socket, videoRef]);

  // Viewer: listen to sync events
  useEffect(() => {
    if (isHost) return;

    const syncPlay = ({ currentTime }) => {
      syncToTime(currentTime, true);
    };

    const syncPause = ({ currentTime }) => {
      syncToTime(currentTime, false);
    };

    const syncSeek = ({ currentTime, isPlaying }) => {
      syncToTime(currentTime, Boolean(isPlaying));
    };

    const syncDrift = ({ currentTime, isPlaying }) => {
      const video = videoRef.current;
      if (!video) return;
      const drift = Math.abs(video.currentTime - currentTime);
      if (drift > DRIFT_THRESHOLD) {
        syncToTime(currentTime, Boolean(isPlaying));
      }
    };

    socket.on('sync:play', syncPlay);
    socket.on('sync:pause', syncPause);
    socket.on('sync:seek', syncSeek);
    socket.on('sync:drift', syncDrift);

    return () => {
      socket.off('sync:play', syncPlay);
      socket.off('sync:pause', syncPause);
      socket.off('sync:seek', syncSeek);
      socket.off('sync:drift', syncDrift);
    };
  }, [isHost, socket, syncToTime, videoRef]);

  return { onPlay, onPause, onSeeked, isSyncing };
}
