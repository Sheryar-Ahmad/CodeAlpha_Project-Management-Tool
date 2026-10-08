# Architecture and learning notes

## Request flow

1. React sends a same-origin request to /api with the browser session cookie.
2. Express checks the request origin for mutations and validates the JSON body.
3. Authentication hashes the opaque session token and looks up an unexpired session.
4. The route uses the authenticated user ID in its MongoDB filter.
5. MongoDB returns only that user’s data; Express serializes permitted fields.
6. React refreshes the paginated board and account-wide summary after a successful mutation.

The local demo uses a different adapter. It never sends demo tasks to the account API.

## Why these choices?

**React components:** the board, task card, task form, and authentication screen each have a defined responsibility. The workspace hook coordinates fetching, cancellation, and mutations.

**Mongoose models:** schemas define the persisted data. Zod validates request shapes first, so nested operators and unexpected ownership fields are rejected before a query is constructed.

**Cookie sessions:** the browser keeps an HTTP-only token, while MongoDB stores its SHA-256 digest. JavaScript cannot read the cookie. Authentication is checked on every protected request, including expiry even before MongoDB’s TTL cleanup.

**Password hashing:** Node’s scrypt derives a salted password hash. Plaintext passwords are never persisted. Reset and email verification are not implemented yet.

**PATCH validation:** create defaults must not be applied to partial updates. Changing a status should not clear a description or replace priority.

**Pagination:** the server returns at most 50 tasks and the UI requests 30. Counters summarize the whole account; columns show the current page, so their counts may differ from summary cards.

**Rate limits:** MongoDB stores hashed-IP counters shared across function instances. Fixed windows allow boundary bursts. A trusted proxy must be configured correctly before using forwarded addresses. Vercel’s direct proxy is trusted only under its platform environment flag; other deployments do not trust arbitrary forwarding headers.

**Search:** the query is a bounded string escaped for literal regex search. Ownership indexes constrain the scan to one user. Large accounts should move to a dedicated search index.

**SEO:** the marketing pages stay static and discoverable. The private workspace uses noindex, while API authorization protects the actual data.

## Current scope

Projects are task group labels, not separate project entities. There are no memberships, invitations, roles, shared boards, or real-time synchronization in this milestone. Those require separate authorization rules and tests.
