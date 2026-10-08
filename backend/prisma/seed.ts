import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

// Prisma 7: driver adapter is required (Step 5.6)
const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Fixed IDs — every run produces identical data, so dev URLs stay bookmarkable
// ---------------------------------------------------------------------------
const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB   = "22222222-2222-4222-8222-222222222222";
const CAROL = "33333333-3333-4333-8333-333333333333";
const DAVE  = "44444444-4444-4444-8444-444444444444";

const DM    = "aaaaaaaa-bbbb-4000-8000-000000000001"; // Alice ↔ Bob DM
const GROUP = "aaaaaaaa-bbbb-4000-8000-000000000002"; // all four — Study Group

const PASSWORD = "Password123!"; // same for every seed user, on purpose

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

// ---------------------------------------------------------------------------
async function main() {
  // -------------------------------------------------------------------------
  // 1. WIPE — delete children before parents (FK order)
  //    Receipt → Message → Participant → Conversation → User
  // -------------------------------------------------------------------------
  await prisma.receipt.deleteMany();
  await prisma.message.deleteMany();
  await prisma.participant.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.user.deleteMany();

  // -------------------------------------------------------------------------
  // 2. FOUR USERS
  //    NOTE: `name` is a required field in this schema (non-nullable String)
  // -------------------------------------------------------------------------
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  await prisma.user.createMany({
    data: [
      { id: ALICE, email: "alice@example.com", username: "alice", name: "Alice", passwordHash },
      { id: BOB,   email: "bob@example.com",   username: "bob",   name: "Bob",   passwordHash },
      { id: CAROL, email: "carol@example.com", username: "carol", name: "Carol", passwordHash },
      { id: DAVE,  email: "dave@example.com",  username: "dave",  name: "Dave",  passwordHash },
    ],
  });

  // -------------------------------------------------------------------------
  // 3. TWO CONVERSATIONS
  // -------------------------------------------------------------------------
  await prisma.conversation.createMany({
    data: [
      { id: DM,    isGroup: false, name: null },
      { id: GROUP, isGroup: true,  name: "Study Group" },
    ],
  });

  // -------------------------------------------------------------------------
  // 4. PARTICIPANTS — the join table that controls who can enter which room
  // -------------------------------------------------------------------------
  await prisma.participant.createMany({
    data: [
      // DM: Alice & Bob
      { userId: ALICE, conversationId: DM,    role: "OWNER"  },
      { userId: BOB,   conversationId: DM,    role: "MEMBER" },

      // Study Group: all four
      { userId: ALICE, conversationId: GROUP, role: "OWNER"  },
      { userId: BOB,   conversationId: GROUP, role: "MEMBER" },
      { userId: CAROL, conversationId: GROUP, role: "ADMIN"  },
      { userId: DAVE,  conversationId: GROUP, role: "MEMBER" },
    ],
  });

  // -------------------------------------------------------------------------
  // 5. MESSAGES
  //    • Explicit IDs for easy debugging (readable over random UUIDs)
  //    • Schema field is `textBody` (not `body`) — critical diff from guide
  //    • 14 DM messages  (~21 h span, alternating Alice/Bob)
  //    • 18 Group messages (~3 day span, cycling all four senders)
  // -------------------------------------------------------------------------
  const dmSenders    = [ALICE, BOB];
  const groupSenders = [ALICE, BOB, CAROL, DAVE];

  const dmMessages = Array.from({ length: 14 }, (_, i) => ({
    id:             `dm-msg-${String(i + 1).padStart(3, "0")}`,
    conversationId: DM,
    senderId:       dmSenders[i % 2]!,
    textBody:       `Direct message ${i + 1}`,
    createdAt:      minutesAgo((14 - i) * 90), // oldest first, ~21 h span
  }));

  const groupMessages = Array.from({ length: 18 }, (_, i) => ({
    id:             `gp-msg-${String(i + 1).padStart(3, "0")}`,
    conversationId: GROUP,
    senderId:       groupSenders[i % 4]!,
    textBody:       `Group message ${i + 1}`,
    createdAt:      minutesAgo((18 - i) * 240), // oldest first, ~3 day span
  }));

  const allMessages = [...dmMessages, ...groupMessages];
  await prisma.message.createMany({ data: allMessages });

  // -------------------------------------------------------------------------
  // 6. RECEIPTS — makes unread counts non-zero and interesting
  //
  //    DM:    Alice has read Bob's messages EXCEPT his last 2
  //           → Alice sees 2 unread in the DM
  //
  //    Group: Carol has read every non-Carol message in the group
  //           Bob and Dave have read nothing there
  //           → Bob and Dave each see several unread group messages
  // -------------------------------------------------------------------------
  const bobsDmMsgs      = dmMessages.filter((m) => m.senderId === BOB);
  const aliceHasRead    = bobsDmMsgs.slice(0, -2); // all but Bob's last 2

  const carolShouldRead = groupMessages.filter((m) => m.senderId !== CAROL);

  await prisma.receipt.createMany({
    data: [
      ...aliceHasRead.map((m)    => ({ messageId: m.id, userId: ALICE })),
      ...carolShouldRead.map((m) => ({ messageId: m.id, userId: CAROL })),
    ],
  });

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log(
    `✅  Seeded: 4 users · 2 conversations · 6 participants · ${allMessages.length} messages`,
  );
  console.log(`    Login: alice@example.com / ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error("❌  Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
