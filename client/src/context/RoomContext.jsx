import React, { createContext, useContext, useState } from 'react';

const RoomContext = createContext(null);

export function RoomProvider({ children }) {
  const [roomId, setRoomId] = useState(null);
  const [username, setUsername] = useState(() => localStorage.getItem('wp_username') || '');
  const [isHost, setIsHost] = useState(false);
  const [members, setMembers] = useState([]);
  const [currentMovie, setCurrentMovie] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);

  const saveUsername = (name) => {
    setUsername(name);
    localStorage.setItem('wp_username', name);
  };

  return (
    <RoomContext.Provider value={{
      roomId, setRoomId,
      username, setUsername: saveUsername,
      isHost, setIsHost,
      members, setMembers,
      currentMovie, setCurrentMovie,
      videoUrl, setVideoUrl,
    }}>
      {children}
    </RoomContext.Provider>
  );
}

export function useRoom() {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error('useRoom must be used within RoomProvider');
  return ctx;
}
