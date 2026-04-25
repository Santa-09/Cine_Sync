import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { RoomProvider } from './context/RoomContext';
import HomePage from './pages/HomePage';
import WatchPage from './pages/WatchPage';
import AdminPage from './pages/AdminPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <RoomProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/room/:roomId" element={<WatchPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </RoomProvider>
  );
}
