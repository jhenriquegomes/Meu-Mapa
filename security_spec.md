# Security Specification: Territory Mapper

## Data Invariants
1. A **Map** must belong to the user who creates it.
2. A **Territory** must belong to a valid Map.
3. A **TerritoryGroup** must belong to a valid Map.
4. Users can only read, write, or delete maps they own.
5. Access to territories and groups is derived from ownership of the parent Map.
6. Admin users (hardcoded or in /admins collection) have full access.

## The "Dirty Dozen" Payloads (Malicious Attempts)

1. **Identity Spoofing**: Creating a map with a `userId` that is not the current user's UID.
2. **Resource Hijacking**: Updating a map owned by another user.
3. **Ghost Field Injection**: Adding a field like `isAdmin: true` to a map document.
4. **Orphaned Territory**: Creating a territory with a `mapId` that doesn't exist.
5. **Cross-Map Territory Injection**: Creating a territory for a map owned by another user.
6. **State Skip**: Updating a territory's `groupId` to a non-existent group.
7. **Type Poisoning**: Sending a string for the territory `number` field.
8. **Massive Payload**: Sending a `points` list with 10,000 items (Denial of Wallet).
9. **Unauthenticated Read**: Attempting to list all maps without being signed in.
10. **ID Poisoning**: Using a very long and strange string as a `mapId` in a path.
11. **Immutable Field Change**: Attempting to change the `userId` of an existing map.
12. **PII Leak**: Attempting to read user profiles or data of other users if any exist.

## Verification
- All "Dirty Dozen" payloads must return `PERMISSION_DENIED`.
- Authorized operations by the owner must return `SUCCESS`.
