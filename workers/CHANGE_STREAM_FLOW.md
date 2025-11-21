# MongoDB Change Stream Flow Diagram

## Flow Chart: Job Lifecycle & Matching Worker

```
┌─────────────────────────────────────────────────────────────────┐
│                    RECRUITER CREATES JOB                        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  Job Created in DB   │
              └──────────┬───────────┘
                         │
         ┌───────────────┴───────────────┐
         │                               │
         ▼                               ▼
┌─────────────────┐            ┌─────────────────┐
│ moderationStatus│            │ moderationStatus│
│   = APPROVED    │            │   = PENDING     │
│ status = ACTIVE │            │ status = ACTIVE │
└────────┬────────┘            └────────┬────────┘
         │                               │
         │ INSERT Event                  │ INSERT Event
         │                               │
         ▼                               ▼
┌─────────────────┐            ┌─────────────────┐
│ Change Stream   │            │ Change Stream   │
│   ✅ MATCH      │            │   ❌ NO MATCH   │
└────────┬────────┘            └────────┬────────┘
         │                               │
         │                               │ (Wait for approval)
         │                               │
         │                               ▼
         │                      ┌─────────────────┐
         │                      │  ADMIN REVIEWS  │
         │                      └────────┬────────┘
         │                               │
         │                      ┌────────┴────────┐
         │                      │                 │
         │                      ▼                 ▼
         │              ┌──────────────┐  ┌──────────────┐
         │              │   APPROVE    │  │   REJECT     │
         │              └──────┬───────┘  └──────┬───────┘
         │                     │                 │
         │                     │ UPDATE Event    │ UPDATE Event
         │                     │                 │
         │                     ▼                 ▼
         │              ┌──────────────┐  ┌──────────────┐
         │              │moderationStatus│ │moderationStatus│
         │              │  = APPROVED  │  │  = REJECTED  │
         │              └──────┬───────┘  └──────┬───────┘
         │                     │                 │
         │                     │                 │
         │                     ▼                 ▼
         │              ┌──────────────┐  ┌──────────────┐
         │              │ Change Stream│  │ Change Stream│
         │              │  ✅ MATCH    │  │  ❌ NO MATCH │
         │              └──────┬───────┘  └──────────────┘
         │                     │
         └─────────────────────┴─────────────────┐
                                                  │
                                                  ▼
                                    ┌──────────────────────┐
                                    │  MATCHING WORKER     │
                                    │  processJobForMatching│
                                    └──────────┬───────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          │                          │
                    ▼                          ▼                          ▼
          ┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
          │ Extract Keywords │      │  Query Redis     │      │  Query MongoDB   │
          │ [nodejs, react]  │      │  Get User IDs    │      │  Get Subscriptions│
          └──────────────────┘      └──────────────────┘      └──────────────────┘
                    │                          │                          │
                    └──────────────────────────┼──────────────────────────┘
                                               │
                                               ▼
                                    ┌──────────────────────┐
                                    │  Filter & Score      │
                                    │  Calculate Relevance │
                                    └──────────┬───────────┘
                                               │
                                               ▼
                                    ┌──────────────────────┐
                                    │ Create Pending       │
                                    │ Notifications        │
                                    └──────────┬───────────┘
                                               │
                                               ▼
                                    ┌──────────────────────┐
                                    │  Mark as Sent        │
                                    │  (Redis Cache)       │
                                    └──────────────────────┘
```

## Scenario Comparison

| Scenario | Initial Status | Event Type | Worker Action |
|----------|---------------|------------|---------------|
| **Auto-Approved** | `APPROVED` + `ACTIVE` | `INSERT` | ✅ Process immediately |
| **Pending → Approved** | `PENDING` → `APPROVED` | `UPDATE` | ✅ Process when approved |
| **Inactive → Active** | `INACTIVE` → `ACTIVE` | `UPDATE` | ✅ Process when activated |
| **Pending (waiting)** | `PENDING` + `ACTIVE` | `INSERT` | ❌ Skip (wait for approval) |
| **Rejected** | `REJECTED` | `UPDATE` | ❌ Skip (never process) |
| **Approved but Inactive** | `APPROVED` + `INACTIVE` | `UPDATE` | ❌ Skip (wait for activation) |

## Change Stream Pipeline

```javascript
// MongoDB Aggregation Pipeline
[
  {
    $match: {
      $or: [
        // Scenario 1: Auto-approved job
        {
          operationType: 'insert',
          'fullDocument.moderationStatus': 'APPROVED',
          'fullDocument.status': 'ACTIVE'
        },
        
        // Scenario 2: Job gets approved
        {
          operationType: 'update',
          'updateDescription.updatedFields.moderationStatus': 'APPROVED',
          'fullDocument.status': 'ACTIVE'
        },
        
        // Scenario 3: Job gets reactivated
        {
          operationType: 'update',
          'updateDescription.updatedFields.status': 'ACTIVE',
          'fullDocument.moderationStatus': 'APPROVED'
        }
      ]
    }
  }
]
```

## Timeline Example

```
T0: Recruiter creates job
    → moderationStatus: PENDING
    → status: ACTIVE
    → Change Stream: ❌ No match (waiting)

T1: Admin reviews job (5 minutes later)
    → moderationStatus: PENDING → APPROVED
    → Change Stream: ✅ Match! (UPDATE event)
    → Worker processes matching

T2: Matching completed (2 seconds later)
    → 15 users matched
    → 15 pending notifications created
    → Redis cache updated

T3: Notification worker runs (next scheduled time)
    → Sends emails/in-app notifications
    → Marks notifications as processed
```

## Error Handling

```
┌─────────────────┐
│ Change Stream   │
│     Error       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Log Error      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Wait 5 seconds │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Close Stream    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Restart Worker  │
│ (Recursive Call)│
└─────────────────┘
```

## Benefits of This Approach

✅ **No Jobs Missed**: Catches both INSERT and UPDATE events  
✅ **Real-time**: Processes jobs immediately when approved  
✅ **Reliable**: Auto-reconnect on failures  
✅ **Efficient**: Only processes APPROVED + ACTIVE jobs  
✅ **Flexible**: Handles multiple job creation workflows  
