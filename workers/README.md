# Workers Documentation

## Overview
This directory contains background worker processes that handle asynchronous tasks in the CareerZone application.

## Workers

### 1. Matching Worker (`matching.worker.js`)
**Purpose**: Real-time job matching and notification queueing

**Technology**: MongoDB Change Streams

**How it works**:
1. Listens to MongoDB Change Streams on the `Job` collection
2. Detects 3 scenarios:
   - **INSERT**: New jobs created with `APPROVED` + `ACTIVE` status
   - **UPDATE**: Jobs approved by admin (`PENDING` → `APPROVED`)
   - **UPDATE**: Jobs reactivated (`INACTIVE` → `ACTIVE`)
3. Extracts keywords from job title, skills, and description
4. Queries Redis for users subscribed to those keywords
5. Matches jobs against user subscription criteria (location, salary, type, etc.)
6. Calculates relevance scores for each match
7. Creates `PendingNotification` records for matched users
8. Prevents duplicate notifications using Redis cache (7-day TTL)

**Running the worker**:
```bash
npm run worker:matching
```

**Key Features**:
- Real-time processing via Change Streams
- Automatic reconnection on failures
- Duplicate prevention
- Batch notification insertion
- Relevance scoring (0-70 points)

**Scoring System**:
- Keyword in title: 20 points
- Keyword in skills: 15 points
- Keyword in description: 5 points
- Filter match: 30 points
- Category exact match: 10 points

### 2. Notification Worker (`notification.worker.js`)
**Purpose**: Sends scheduled notifications to users

**How it works**:
1. Runs on a cron schedule (daily/weekly based on user preferences)
2. Queries `PendingNotification` collection for unprocessed notifications
3. Groups notifications by user and frequency
4. Sends consolidated emails and/or in-app notifications
5. Marks notifications as processed

**Running the worker**:
```bash
npm run worker:notification
```

### 3. Embedding Worker (`embedding.worker.js`)
**Purpose**: Generates vector embeddings for jobs

**Running the worker**:
```bash
npm run worker:embedding
```

## Running All Workers

To run the main server and all workers simultaneously:
```bash
npm run start:all
```

## Architecture Notes

### Why Change Streams instead of Kafka?

**Previous Architecture**: Kafka-based event streaming
- Required separate Kafka broker setup
- Producer in job service → Kafka topic → Consumer in worker
- More complex infrastructure

**Current Architecture**: MongoDB Change Streams
- Direct database listening
- No message broker needed
- Simpler deployment
- Built-in reliability and ordering guarantees
- Automatic resume token handling
- Native MongoDB feature

**Benefits**:
- ✅ Reduced infrastructure complexity
- ✅ Lower operational overhead
- ✅ Guaranteed delivery
- ✅ Automatic reconnection
- ✅ No data loss on worker restart
- ✅ Easier to debug and monitor

## Environment Requirements

- MongoDB Replica Set (required for Change Streams)
- Redis (for caching and duplicate prevention)
- Node.js >= 18.0.0

## Monitoring

Workers log to console and can be monitored via:
- Application logs
- MongoDB Change Stream metrics
- Redis connection status
- PendingNotification collection size

## Error Handling

All workers implement:
- Graceful shutdown on SIGINT/SIGTERM
- Automatic reconnection on failures
- Error logging with context
- Resource cleanup on exit
