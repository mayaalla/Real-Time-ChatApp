# Local setup

## Database
- Provider: Neon, project `chat-app`, database `chatapp`
- Branches:
  - `main` / `production` -> used only by the deployed app (Part 26)
  - `dev` -> used on my laptop
  - `test` -> used by automated tests (Part 25)
- Connection strings live in `backend/.env` (never committed).
  - `DATABASE_URL`  = dev branch, POOLED  (has `-pooler` in the host) - used by the app
  - `DIRECT_URL`    = dev branch, DIRECT  (no `-pooler`)             - used by migrations
- To reset the dev data: Prisma reset command (added in Part 5), or reset the branch in the Neon console.

## Redis
- Not provisioned yet. Needed from Part 15. Will be Upstash or Redis Cloud, must support pub/sub.

## Docker
- Not used. Optional; see Part 3, Step 3.9 if I ever want to work offline.

## Running the backend
- cd backend
- npm install
- npm run dev        # development, restarts on save
- npm run typecheck  # check types
- npm run lint       # check code
- npm run build && npm start   # run the compiled version