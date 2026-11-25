# Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **PII Isolation**: User email addresses are stored exclusively in `/user_secrets/{userId}` (`allow get, create, update: if isOwner(userId)`). `/public_profiles/{userId}` never contains `email`, `phone`, or `address`.
2. **Identity Integrity**: Every document created by a user enforces `uid`/`createdBy`/`senderId` == `request.auth.uid` and `request.auth.token.email_verified == true`.
3. **Master Gate Membership (Read & Write)**: Reading (`get`/`list`) OR posting messages in `/open_rooms/{roomId}/messages/{messageId}` strictly requires active membership in `/open_rooms/{roomId}/members/$(request.auth.uid)`. Non-members cannot view message contents even in public rooms.
4. **Host-Only Room Deletion & Message Moderation**: Only `existing().createdBy == request.auth.uid` (the room creator/host) may delete `/open_rooms/{roomId}` or `/room_invites/{inviteCode}`. Room message deletion is limited to the message sender or room host; DM message deletion is limited to the message sender who is a thread participant.
5. **Canonical 1:1 DM Isolation**: `/dm_threads/{threadId}` has deterministic `threadId == user1Uid + "__" + user2Uid` where `user1Uid < user2Uid`, `participantUids.size() == 2`, and both read/list/write are restricted exclusively to those two UIDs.
6. **Temporal Integrity & Atomicity**: All `createdAt`/`updatedAt`/`joinedAt`/`lastMessageAt` timestamps must equal `request.time`. Posting a chat message atomically updates the parent room/thread `lastMessageText` and `lastMessageAt` via `getAfter()`.
7. **Size & Schema Bounds**: All document IDs match `^[a-zA-Z0-9_-]+$` (`<= 128` chars), every string has explicit `.size()` upper bounds, and `keys().hasAll(...)` + `keys().hasOnly(...)` block shadow fields.
8. **Admin RBAC & Verified Bootstrapping**: `/admins/{userId}` can only be listed, created, or deleted by verified admins (`isBootstrappedAdmin()` checking `email == 'rndsjnd@gmail.com' && email_verified == true`, or an existing `/admins/$(request.auth.uid)` record with verified email). Self-promotion by non-admins is denied, and the primary owner record cannot be deleted.

## 2. The "Dirty Dozen" Attack Payloads (Expected: `PERMISSION_DENIED`)
1. **Unverified / Unauthenticated Write**: Write to `/public_profiles/userA` with `request.auth == null` or `email_verified == false`.
2. **PII Leak Attempt**: User B attempts `get` or `list` on `/user_secrets/userA`.
3. **Ghost / Shadow Field Injection**: Create `/public_profiles/userA` with extra field `isAdmin: true` or `role: "moderator"`.
4. **Identity Spoofing in Open Chat**: User A creates `/open_rooms/room1/messages/msg1` with `senderId: "userB"`.
5. **Non-Member Message Injection & Eavesdropping**: User B attempts to `get`, `list`, or `create` `/open_rooms/room1/messages/msg1` without `/open_rooms/room1/members/userB`.
6. **Non-Host Room Deletion**: User B (a regular joined member) attempts to `delete` `/open_rooms/room1` created by User A.
7. **Spoofed Member Join**: User A attempts to create `/open_rooms/room1/members/userB` to force User B into a room.
8. **1:1 DM Eavesdropping (Get/List)**: User C attempts `get` or `list` on `/dm_threads/userA__userB` or its `/messages` subcollection.
9. **Non-Canonical / Poisoned DM Thread ID**: User A creates `/dm_threads/fake-id-123` with `user1Uid: "userB", user2Uid: "userA"`.
10. **Other User's DM Message Deletion**: User B attempts to `delete` a DM message sent by User A (`senderId == "userA"`).
11. **Client Timestamp Forgery**: Create message with backdated `createdAt` instead of `request.time`.
12. **Immutable Field Tampering**: Update `/open_rooms/room1` attempting to alter `createdBy` or `createdAt`, or update `/dm_threads/userA__userB` attempting to alter `participantUids`.
13. **Admin Escalation / Unverified Spoof**: Regular user or user with `email: "rndsjnd@gmail.com"` & `email_verified: false` attempts to create or list `/admins/{uid}`.

