// In-memory store for all rooms
const rooms = new Map();

function now() {
  return Date.now();
}

function projectCurrentTime(room) {
  if (!room?.isPlaying) return room?.currentTime || 0;
  return room.currentTime + (now() - room.playStateUpdatedAt) / 1000;
}

function withProjectedPlayback(room) {
  if (!room) return null;
  return {
    ...room,
    currentTime: projectCurrentTime(room),
  };
}

function createRoom({ roomId, hostId, hostName, movieId, movieTitle, moviePoster, movieBackdrop }) {
  const room = {
    id: roomId,
    hostId,
    hostName,
    movie: movieId ? { id: movieId, title: movieTitle, poster: moviePoster, backdrop: movieBackdrop } : null,
    videoUrl: null,
    videoName: null,
    currentTime: 0,
    isPlaying: false,
    playStateUpdatedAt: now(),
    members: [],
    chat: [],
    createdAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
  };
  rooms.set(roomId, room);
  return room;
}

function getRoom(roomId) {
  return rooms.get(roomId) || null;
}

function getRoomSnapshot(roomId) {
  return withProjectedPlayback(getRoom(roomId));
}

function deleteRoom(roomId) {
  return rooms.delete(roomId);
}

function getAllRooms() {
  return Array.from(rooms.values());
}

function addMember(roomId, member) {
  const room = rooms.get(roomId);
  if (!room) return null;
  room.members = room.members.filter((m) => m.socketId !== member.socketId);
  room.members.push(member);
  room.lastActivity = new Date().toISOString();
  return room;
}

function removeMember(roomId, socketId) {
  const room = rooms.get(roomId);
  if (!room) return null;
  room.members = room.members.filter((m) => m.socketId !== socketId);
  room.lastActivity = new Date().toISOString();
  if (room.members.length === 0) {
    rooms.delete(roomId);
    return null;
  }
  return room;
}

function updatePlayState(roomId, isPlaying, currentTime) {
  const room = rooms.get(roomId);
  if (!room) return null;
  room.isPlaying = isPlaying;
  room.currentTime = Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0;
  room.playStateUpdatedAt = now();
  room.lastActivity = new Date().toISOString();
  return room;
}

function updateMovie(roomId, movie) {
  const room = rooms.get(roomId);
  if (!room) return null;
  room.movie = movie;
  room.currentTime = 0;
  room.isPlaying = false;
  room.playStateUpdatedAt = now();
  room.lastActivity = new Date().toISOString();
  return room;
}

function updateVideoUrl(roomId, videoUrl, videoName = null) {
  const room = rooms.get(roomId);
  if (!room) return null;
  room.videoUrl = videoUrl;
  room.videoName = videoName;
  room.currentTime = 0;
  room.isPlaying = false;
  room.playStateUpdatedAt = now();
  room.lastActivity = new Date().toISOString();
  return room;
}

function addChat(roomId, message) {
  const room = rooms.get(roomId);
  if (!room) return null;
  room.chat.push(message);
  if (room.chat.length > 200) room.chat = room.chat.slice(-200);
  return room;
}

function getRoomStats() {
  const allRooms = Array.from(rooms.values());
  return {
    totalRooms: allRooms.length,
    totalUsers: allRooms.reduce((acc, r) => acc + r.members.length, 0),
    rooms: allRooms.map((r) => ({
      id: r.id,
      hostName: r.hostName,
      memberCount: r.members.length,
      movie: r.videoName || r.movie?.title || 'No movie selected',
      createdAt: r.createdAt,
      lastActivity: r.lastActivity,
      isPlaying: r.isPlaying,
    })),
  };
}

module.exports = {
  createRoom,
  getRoom,
  getRoomSnapshot,
  deleteRoom,
  getAllRooms,
  addMember,
  removeMember,
  updatePlayState,
  updateMovie,
  updateVideoUrl,
  addChat,
  getRoomStats,
};
