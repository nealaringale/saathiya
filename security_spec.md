# Saathiya Firestore Security Specification

## Security invariants

1. **Adults and consent:** user account documents require `ageConfirmed18Plus == true` and `acceptedTerms == true`. Matchmaking profile documents separately require a numeric age of at least 18.
2. **Private account data:** email, phone, blocklists, and partner-preference notes stay in `/users/{userId}`; only that user (or an admin) can read the account document.
3. **Profile privacy:** a profile is readable by its owner, an admin, or signed-in users when `optedInDiscover == true` and `visibility == 'visible'`. The collection query rule is intentionally restrictive.
4. **Private match chat:** only the two users listed in an active match's `participants` may read or write its messages. Wedding planners do not inherit chat access.
5. **Secret-crush privacy:** a recipient cannot read a secret-crush swipe unless they have also created a reciprocal positive swipe.
6. **Planner boundaries:** planners can manage their wedding event and guest access, but do not gain access to other users' private account data, matches, messages, or swipes.
7. **Path and timestamp validation:** document IDs are validated before writes. Create timestamps must match `request.time`; mutable records require updates to use the current request time and preserve creation timestamps.

## Automated adversarial cases

The executable cases in `firestore.rules.test.js` run against the Firestore Emulator, using mocked authenticated users and admin-only seeding. They cover:

1. Underage profile creation is rejected.
2. Reading another user's private account document is rejected.
3. A user cannot self-promote the protected `identityVerified` field.
4. A planner cannot create a membership document for another guest.
5. A planner cannot list a private match chat.
6. A secret-crush recipient cannot read the swipe without a reciprocal swipe.
7. A user cannot create a swipe using another user's identity.
8. A non-participant cannot inject a message into a match.
9. An unmatched conversation cannot be reactivated by a participant.
10. A 300-character wedding ID is rejected by the path validator.
11. A memory write with a backdated client timestamp is rejected.
12. A query for hidden profiles is rejected.

A positive control also verifies that an adult user can create their own valid, hidden, opted-out profile. Run the cases with `npm run test:rules`.
