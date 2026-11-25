import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";

const PROJECT_ID = "demo-saathiya";
const [EMULATOR_HOST, EMULATOR_PORT] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");
let testEnv;

const fixedTimestamp = () => Timestamp.fromDate(new Date("2026-11-25T00:00:00.000Z"));

before(async () => {
  const rules = await readFile(new URL("./firestore.rules", import.meta.url), "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: EMULATOR_HOST,
      port: Number(EMULATOR_PORT),
      rules,
    },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

function signedIn(uid) {
  return testEnv.authenticatedContext(uid, { email_verified: true }).firestore();
}

async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

function profileFixture(uid, overrides = {}) {
  const now = fixedTimestamp();
  return {
    uid,
    fullName: "Test Guest",
    age: 25,
    gender: "Woman",
    city: "Pune",
    optedInDiscover: false,
    visibility: "hidden",
    identityVerified: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

async function seedWedding(overrides = {}) {
  await seed("weddings/wed1", {
    id: "wed1",
    plannerUid: "planner1",
    status: "active",
    expiresAtMs: Date.now() + 86_400_000,
    memoriesEnabled: true,
    memoriesUploadPermission: "all_guests",
    createdAt: fixedTimestamp(),
    updatedAt: fixedTimestamp(),
    ...overrides,
  });
}

function matchFixture(status = "active") {
  const now = fixedTimestamp();
  return {
    id: "userA_userB_wed1",
    user1Uid: "userA",
    user2Uid: "userB",
    participants: ["userA", "userB"],
    weddingId: "wed1",
    weddingName: "Test Wedding",
    status,
    matchedAt: now,
    updatedAt: now,
  };
}

test("DD-01 rejects an underage matchmaking profile", async () => {
  const db = signedIn("userA");
  await assertFails(
    setDoc(doc(db, "profiles/userA"), {
      ...profileFixture("userA", { age: 17 }),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
});

test("DD-02 prevents a user from reading another user's private account", async () => {
  await seed("users/userA", { uid: "userA", email: "private@example.test" });
  await assertFails(getDoc(doc(signedIn("userB"), "users/userA")));
});

test("DD-03 prevents self-promotion of the protected identityVerified field", async () => {
  await seed("profiles/userA", profileFixture("userA", { identityVerified: false }));
  await assertFails(
    updateDoc(doc(signedIn("userA"), "profiles/userA"), {
      bio: "Updated bio",
      identityVerified: true,
      updatedAt: serverTimestamp(),
    }),
  );
});

test("DD-04 prevents a planner from creating a membership for another guest", async () => {
  await seedWedding();
  await assertFails(
    setDoc(doc(signedIn("planner1"), "weddings/wed1/members/userB"), {
      uid: "userB",
      weddingId: "wed1",
      side: "Bride's Side",
      optedInMatchmaking: true,
      status: "active",
      joinedAt: serverTimestamp(),
    }),
  );
});

test("DD-05 prevents a wedding planner from listing match messages", async () => {
  await seed("matches/userA_userB_wed1", matchFixture());
  await seed("matches/userA_userB_wed1/messages/msgExisting", {
    id: "msgExisting",
    matchId: "userA_userB_wed1",
    senderUid: "userA",
    text: "Private conversation",
    type: "text",
    createdAt: fixedTimestamp(),
  });
  const messages = collection(signedIn("planner1"), "matches/userA_userB_wed1/messages");
  await assertFails(getDocs(messages));
});

test("DD-06 prevents a secret-crush recipient from peeking without a reciprocal swipe", async () => {
  await seed("swipes/userA_userB_wed1", {
    fromUid: "userA",
    toUid: "userB",
    weddingId: "wed1",
    action: "secret_crush",
    createdAt: fixedTimestamp(),
  });
  await assertFails(getDoc(doc(signedIn("userB"), "swipes/userA_userB_wed1")));
});

test("DD-07 prevents swipe identity spoofing", async () => {
  await seedWedding();
  await assertFails(
    setDoc(doc(signedIn("userA"), "swipes/userB_userC_wed1"), {
      fromUid: "userB",
      toUid: "userC",
      weddingId: "wed1",
      action: "like",
      createdAt: serverTimestamp(),
    }),
  );
});

test("DD-08 prevents non-participants from injecting match messages", async () => {
  await seed("matches/userA_userB_wed1", matchFixture());
  await assertFails(
    setDoc(doc(signedIn("userC"), "matches/userA_userB_wed1/messages/msg1"), {
      id: "msg1",
      matchId: "userA_userB_wed1",
      senderUid: "userC",
      text: "Unauthorized message",
      type: "text",
      createdAt: serverTimestamp(),
    }),
  );
});

test("DD-09 prevents an unmatched conversation from being reactivated", async () => {
  await seed("matches/userA_userB_wed1", matchFixture("unmatched"));
  await assertFails(
    updateDoc(doc(signedIn("userA"), "matches/userA_userB_wed1"), {
      status: "active",
      updatedAt: serverTimestamp(),
    }),
  );
});

test("DD-10 rejects a wedding document ID longer than the path limit", async () => {
  const longWeddingId = "a".repeat(300);
  await assertFails(setDoc(doc(signedIn("planner1"), `weddings/${longWeddingId}`), {}));
});

test("DD-11 rejects a backdated wedding memory timestamp", async () => {
  await seedWedding();
  await assertFails(
    setDoc(doc(signedIn("userA"), "weddings/wed1/memories/mem1"), {
      id: "mem1",
      weddingId: "wed1",
      authorUid: "userA",
      authorName: "Test Guest",
      mediaType: "photo",
      album: "Haldi",
      mediaUrl: "https://example.test/memory.jpg",
      likesCount: 0,
      commentsCount: 0,
      createdAt: Timestamp.fromDate(new Date("1999-01-01T00:00:00.000Z")),
    }),
  );
});

test("DD-12 prevents collection queries from scraping hidden profiles", async () => {
  await seed("profiles/userA", profileFixture("userA", {
    optedInDiscover: false,
    visibility: "hidden",
  }));
  const hiddenProfiles = query(
    collection(signedIn("userB"), "profiles"),
    where("visibility", "==", "hidden"),
  );
  await assertFails(getDocs(hiddenProfiles));
});

test("positive control: an adult can create their own hidden, opted-out profile", async () => {
  const db = signedIn("userA");
  await assertSucceeds(
    setDoc(doc(db, "profiles/userA"), {
      ...profileFixture("userA", { age: 18 }),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
});
