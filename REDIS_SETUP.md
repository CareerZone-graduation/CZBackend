# Redis Setup Guide

## What is Redis?
Redis is an in-memory data store used for caching and improving application performance. This application uses Redis for:
- Caching search history
- Managing job alert subscriptions
- Session management

## The Application Will Work Without Redis
The application has been configured to work gracefully without Redis. If Redis is not available:
- Features will continue to work but without caching benefits
- You'll see warning messages in logs but the app won't crash
- Performance may be slightly slower without caching

## Installing Redis on Windows

### Option 1: Using WSL (Recommended)
1. Install WSL if you haven't: `wsl --install`
2. Open WSL terminal
3. Install Redis:
   ```bash
   sudo apt update
   sudo apt install redis-server
   ```
4. Start Redis:
   ```bash
   sudo service redis-server start
   ```
5. Verify it's running:
   ```bash
   redis-cli ping
   # Should return: PONG
   ```

### Option 2: Using Docker
1. Install Docker Desktop for Windows
2. Run Redis container:
   ```bash
   docker run -d -p 6379:6379 --name redis redis:latest
   ```
3. Verify it's running:
   ```bash
   docker exec -it redis redis-cli ping
   # Should return: PONG
   ```

### Option 3: Native Windows (Not Recommended)
Redis doesn't officially support Windows, but you can use:
- Memurai (commercial Redis-compatible server)
- Redis for Windows (unofficial port)

## Starting Redis

### WSL:
```bash
sudo service redis-server start
```

### Docker:
```bash
docker start redis
```

## Stopping Redis

### WSL:
```bash
sudo service redis-server stop
```

### Docker:
```bash
docker stop redis
```

## Checking Redis Status

### WSL:
```bash
sudo service redis-server status
```

### Docker:
```bash
docker ps | grep redis
```

## Configuration
The application connects to Redis using the `REDIS_URL` environment variable in `.env`:
```
REDIS_URL=redis://localhost:6379
```

## Troubleshooting

### Connection Timeout Error
If you see "Redis Client Error Connection timeout":
1. Check if Redis is running (see "Checking Redis Status" above)
2. Verify the REDIS_URL in your `.env` file
3. The application will continue to work without Redis

### Redis Not Starting
- **WSL**: Try `sudo service redis-server restart`
- **Docker**: Try `docker restart redis`

### Port Already in Use
If port 6379 is already in use:
1. Find what's using it: `netstat -ano | findstr :6379`
2. Either stop that process or change Redis port in `.env`

## For Development
If you don't want to deal with Redis during development:
- The application will work fine without it
- You'll see warning messages in logs, which you can ignore
- Consider installing Redis only when you need caching performance
