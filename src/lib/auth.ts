import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users, stores, storeMembers } from "@/db/schema";
import { and, eq } from "drizzle-orm";

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error("JWT_SECRET environment variable is required but not set");
}
const SECRET = new TextEncoder().encode(jwtSecret);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  storeId?: string;
  storeSlug?: string;
  storeName?: string;
  role?: "OWNER" | "ADMIN" | "STAFF_MANAGE_ORDERS" | "STAFF_VIEW_ORDERS";
}

const BCRYPT_ROUNDS = 12;

// Hash password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

// Verify password
export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// Create JWT token
export async function createToken(payload: SessionUser): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(SECRET);
}

// Verify JWT token
export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    const session = payload as unknown as SessionUser;
    if (typeof session.id !== "string" || !UUID_PATTERN.test(session.id)) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

// Get current session from cookies
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;
  const session = await verifyToken(token);
  if (session?.storeId && !session.role) {
    // Sessions minted by store-creation endpoints before `role` was included
    // carry storeId but no role claim — heal them instead of failing RBAC.
    const access = await resolveStoreAccess(session.id);
    if (access && access.store.id === session.storeId) {
      session.role = access.role;
      session.storeSlug = access.store.slug;
      session.storeName = access.store.name;
    }
  }

  if (session?.storeId && session.role && session.role !== "OWNER") {
    // Member (non-owner) sessions: re-validate the store_members row on every
    // request so removing a team member takes effect immediately instead of
    // waiting for the 7-day JWT to expire. On mismatch the session is
    // re-resolved — the user falls back to a store they still belong to, or
    // loses store context entirely (fail-closed).
    const membership = await db
      .select({ id: storeMembers.id })
      .from(storeMembers)
      .where(
        and(
          eq(storeMembers.storeId, session.storeId),
          eq(storeMembers.userId, session.id)
        )
      )
      .limit(1);

    if (membership.length === 0) {
      const access = await resolveStoreAccess(session.id);
      if (access) {
        session.storeId = access.store.id;
        session.storeSlug = access.store.slug;
        session.storeName = access.store.name;
        session.role = access.role;
      } else {
        session.storeId = undefined;
        session.storeSlug = undefined;
        session.storeName = undefined;
        session.role = undefined;
      }
    }
  }
  return session;
}

// Create session (set cookie)
export async function createSession(user: SessionUser): Promise<string> {
  const token = await createToken(user);
  return token;
}

export type StoreAccessRole = "OWNER" | "ADMIN";

export interface StoreAccess {
  store: typeof stores.$inferSelect;
  role: StoreAccessRole;
}

/**
 * Resolve which store a user can operate on and with which role.
 * The store owner wins first; otherwise the first `store_members` row
 * (role ADMIN) grants access to that member's store.
 */
export async function resolveStoreAccess(
  userId: string
): Promise<StoreAccess | null> {
  if (!UUID_PATTERN.test(userId)) return null;

  const owned = await db
    .select()
    .from(stores)
    .where(eq(stores.ownerId, userId))
    .limit(1);

  if (owned[0]) {
    return { store: owned[0], role: "OWNER" };
  }

  const membership = await db
    .select({ storeId: storeMembers.storeId })
    .from(storeMembers)
    .where(eq(storeMembers.userId, userId))
    .limit(1);

  if (!membership[0]) return null;

  const memberStore = await db
    .select()
    .from(stores)
    .where(eq(stores.id, membership[0].storeId))
    .limit(1);

  if (!memberStore[0]) return null;
  return { store: memberStore[0], role: "ADMIN" };
}

/**
 * Drop-in replacement for the legacy `stores.owner_id = session.id`
 * lookup: returns a single-element array with the accessible store so
 * existing `userStore[0]` / `userStore.length === 0` checks keep working
 * for both owners and invited admins.
 */
export async function getAccessibleStores(
  userId: string
): Promise<(typeof stores.$inferSelect)[]> {
  const access = await resolveStoreAccess(userId);
  return access ? [access.store] : [];
}

// Get session with store info
export async function getSessionWithStore(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session) return null;

  // If session doesn't have store info, try to fetch it (owner or member)
  if (!session.storeId) {
    const access = await resolveStoreAccess(session.id);

    if (access) {
      session.storeId = access.store.id;
      session.storeSlug = access.store.slug;
      session.storeName = access.store.name;
      session.role = access.role;
    }
  }

  return session;
}

// Login
export async function login(
  email: string,
  password: string
): Promise<{ user: SessionUser; token: string } | null> {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);

  if (result.length === 0) return null;

  const user = result[0];
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  // Get store info (owned store first, then team membership)
  const access = await resolveStoreAccess(user.id);

  const sessionUser: SessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: access?.role,
  };

  if (access) {
    sessionUser.storeId = access.store.id;
    sessionUser.storeSlug = access.store.slug;
    sessionUser.storeName = access.store.name;
  }

  const token = await createSession(sessionUser);
  return { user: sessionUser, token };
}

// Signup
export async function signup(
  email: string,
  password: string,
  name: string
): Promise<{ user: SessionUser; token: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const hashedPassword = await hashPassword(password);

  let result: (typeof users.$inferSelect)[];
  try {
    result = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        passwordHash: hashedPassword,
        name: name.trim(),
      })
      .returning();
  } catch (error) {
    console.error("[auth] signup insert failed:", error);
    throw error;
  }

  const user = result[0];
  if (!user) {
    throw new Error(
      "Signup failed: inserting into `users` returned no row. Verify the users table matches supabase/schema.sql."
    );
  }

  const sessionUser: SessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: "OWNER",
  };

  const token = await createSession(sessionUser);
  return { user: sessionUser, token };
}
