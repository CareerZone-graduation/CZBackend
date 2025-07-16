# Hướng dẫn Tích hợp Chat WebSocket cho Frontend

Tài liệu này hướng dẫn cách kết nối, gửi, và nhận tin nhắn real-time bằng WebSocket (Socket.IO) với backend CareerZone.

## 1. Cài đặt Thư viện

Trước tiên, hãy cài đặt thư viện `socket.io-client` cho dự án frontend của bạn:

```bash
npm install socket.io-client
```

## 2. Luồng Hoạt Động Tổng Quan

Đây là luồng hoạt động đề xuất cho việc tích hợp tính năng chat:

1.  **Lấy Token**: Người dùng đăng nhập và frontend nhận được một mã JWT.
2.  **Kết nối Socket**: Khi ứng dụng khởi động hoặc khi người dùng truy cập vào khu vực yêu cầu real-time, hãy thiết lập một kết nối duy nhất đến Socket.IO server và giữ kết nối đó.
3.  **Tạo/Chọn Cuộc Trò Chuyện**:
    *   Người dùng muốn chat với người khác -> Gọi API `POST /api/chat/conversations` để tạo cuộc trò chuyện. Backend sẽ trả về thông tin cuộc trò chuyện, bao gồm `_id`.
    *   Nếu API trả về lỗi 400 "Cuộc trò chuyện đã tồn tại", bạn cần gọi `GET /api/chat/conversations` để tìm ra cuộc trò chuyện đã có từ trước.
4.  **Vào Phòng Chat**:
    *   Khi người dùng mở một cuộc trò chuyện cụ thể, frontend sẽ có `conversationId`.
    *   Sử dụng `conversationId` này để:
        *   Gọi API `GET /api/chat/conversations/:conversationId/messages` để tải lịch sử tin nhắn cũ.
        *   Gửi sự kiện `conversation:join` qua WebSocket để bắt đầu lắng nghe tin nhắn mới cho cuộc trò chuyện này.
5.  **Gửi và Nhận Tin Nhắn**:
    *   Người dùng nhập và gửi tin nhắn -> Frontend gửi sự kiện `message:send`.
    *   Frontend lắng nghe sự kiện `message:new` để nhận tin nhắn mới từ tất cả những người trong phòng (bao gồm cả tin nhắn của chính mình để cập nhật UI).
6.  **Rời Phòng Chat**: Khi người dùng đóng cửa sổ chat hoặc chuyển sang cuộc trò chuyện khác, hãy gửi sự kiện `conversation:leave` để ngừng nhận tin nhắn không cần thiết.

## 3. Kết Nối và Xác Thực

Bạn nên tạo một file quản lý socket (ví dụ: `socket.js` hoặc một custom hook trong React) để xử lý kết nối.

```javascript
// src/socket.js
import { io } from 'socket.io-client';

const URL = 'http://localhost:5000'; // URL của backend
let socket;

export const connectSocket = (token) => {
  // Nếu đã có kết nối thì không tạo lại
  if (socket && socket.connected) {
    return socket;
  }

  // Tạo kết nối mới với token xác thực
  socket = io(URL, {
    auth: {
      token: token,
    },
    // Tùy chọn: tự động kết nối lại
    reconnection: true,
    reconnectionAttempts: 5,
  });

  // Các sự kiện kết nối cơ bản
  socket.on('connect', () => {
    console.log('Connected to WebSocket server with ID:', socket.id);
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from WebSocket server.');
  });

  socket.on('connect_error', (err) => {
    console.error('WebSocket connection error:', err.message);
  });

  return socket;
};

export const getSocket = () => socket;
```

## 4. Các Sự Kiện WebSocket Chính

### 4.1. Tham gia và Rời phòng chat

```javascript
const socket = getSocket();

// Khi mở một cuộc trò chuyện
export const joinConversation = (conversationId) => {
  if (socket && conversationId) {
    socket.emit('conversation:join', { conversationId });
  }
};

// Khi đóng một cuộc trò chuyện
export const leaveConversation = (conversationId) => {
  if (socket && conversationId) {
    socket.emit('conversation:leave', { conversationId });
  }
};
```

### 4.2. Gửi Tin Nhắn

Sự kiện `message:send` nhận vào 2 tham số: `data` và một `callback` (tùy chọn) để nhận phản hồi từ server.

```javascript
const socket = getSocket();

export const sendMessage = (messageData, callback) => {
  if (socket) {
    // messageData có dạng: { conversationId: '...', content: '...' }
    socket.emit('message:send', messageData, (response) => {
      if (response.success) {
        console.log('Message sent and confirmed by server:', response.message);
        if (callback) callback(null, response.message);
      } else {
        console.error('Failed to send message:', response.message);
        if (callback) callback(new Error(response.message), null);
      }
    });
  }
};
```

### 4.3. Lắng nghe Tin Nhắn Mới

Bạn cần đăng ký listener cho sự kiện `message:new` để cập nhật UI.

```javascript
// Ví dụ trong một component React
import { useEffect } from 'react';
import { getSocket } from './socket';

const ChatWindow = ({ conversationId }) => {
  const [messages, setMessages] = useState([]);
  const socket = getSocket();

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (newMessage) => {
      // Thêm tin nhắn mới vào state để re-render UI
      setMessages((prevMessages) => [...prevMessages, newMessage]);
    };

    // Đăng ký lắng nghe
    socket.on('message:new', handleNewMessage);

    // Hủy đăng ký khi component unmount
    return () => {
      socket.off('message:new', handleNewMessage);
    };
  }, [socket]);

  // ... render UI
};
```

## 5. Các Sự Kiện Phụ (Typing Indicators)

Để hiển thị "user is typing...", frontend cần gửi và lắng nghe các sự kiện sau:

**Gửi sự kiện khi bắt đầu/dừng gõ:**

```javascript
const socket = getSocket();

// Khi người dùng bắt đầu gõ
export const startTyping = (conversationId) => {
  if (socket) {
    socket.emit('chat:typing:start', { conversationId });
  }
};

// Khi người dùng dừng gõ
export const stopTyping = (conversationId) => {
  if (socket) {
    socket.emit('chat:typing:stop', { conversationId });
  }
};
```

**Lắng nghe sự kiện từ người khác:**

```javascript
// Trong React component
useEffect(() => {
  if (!socket) return;

  const handleTypingStart = ({ userId, username }) => {
    // Hiển thị "username is typing..."
    console.log(`${username} is typing...`);
  };

  const handleTypingStop = ({ userId, username }) => {
    // Ẩn thông báo "is typing"
    console.log(`${username} stopped typing.`);
  };

  socket.on('chat:typing:start', handleTypingStart);
  socket.on('chat:typing:stop', handleTypingStop);

  return () => {
    socket.off('chat:typing:start', handleTypingStart);
    socket.off('chat:typing:stop', handleTypingStop);
  };
}, [socket]);
```

## 6. Ví dụ với React Hook

Đây là một ví dụ về custom hook `useChat` để quản lý logic chat.

```javascript
// hooks/useChat.js
import { useState, useEffect, useCallback } from 'react';
import { getSocket, joinConversation, leaveConversation } from '../socket';

export const useChat = (conversationId) => {
  const [messages, setMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const socket = getSocket();

  // Lắng nghe tin nhắn mới
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (newMessage) => {
      // Chỉ thêm tin nhắn nếu nó thuộc về cuộc trò chuyện hiện tại
      if (newMessage.conversationId === conversationId) {
        setMessages((prev) => [...prev, newMessage]);
      }
    };
    
    socket.on('message:new', handleNewMessage);
    setIsConnected(socket.connected);

    return () => {
      socket.off('message:new', handleNewMessage);
    };
  }, [socket, conversationId]);

  // Tham gia và rời phòng
  useEffect(() => {
    if (conversationId) {
      joinConversation(conversationId);
    }
    return () => {
      if (conversationId) {
        leaveConversation(conversationId);
      }
    };
  }, [conversationId]);

  // Hàm gửi tin nhắn
  const sendMessage = useCallback((content) => {
    if (socket && conversationId) {
      const messageData = {
        conversationId,
        content,
        type: 'text',
      };
      socket.emit('message:send', messageData, (response) => {
        if (!response.success) {
          // Xử lý lỗi gửi tin nhắn, ví dụ: hiển thị thông báo
          console.error('Failed to send message:', response.message);
        }
      });
    }
  }, [socket, conversationId]);

  return { messages, setMessages, sendMessage, isConnected };
};
```

## 7. Tóm Tắt Các API Liên Quan

-   `POST /api/chat/conversations`: Tạo cuộc trò chuyện mới.
-   `GET /api/chat/conversations`: Lấy danh sách các cuộc trò chuyện.
-   `GET /api/chat/conversations/:conversationId`: Lấy chi tiết một cuộc trò chuyện.
-   `GET /api/chat/conversations/:conversationId/messages`: Lấy lịch sử tin nhắn.
