import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users, stores } from "@/db/schema";
import { eq } from "drizzle-orm";

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error("JWT_SECRET environment variable is required but not set");
}
const SECRET = new TextEncoder().encode(jwtSecret);

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  storeId?: string;
  storeSlug?: string;
  storeName?: string;
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
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
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

// Get current session from cookies
export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;
  return verifyToken(token);
}

// Create session (set cookie)
export async function createSession(user: SessionUser): Promise<string> {
  const token = await createToken(user);
  return token;
}

// Get session with store info
export async function getSessionWithStore(): Promise<SessionUser | null> {
  const session = await getSession();
  if (!session) return null;

  // If session doesn't have store info, try to fetch it
  if (!session.storeId) {
    const store = await db
      .select({ id: stores.id, slug: stores.slug, name: stores.name })
      .from(stores)
      .where(eq(stores.ownerId, session.id))
      .limit(1);

    if (store.length > 0) {
      session.storeId = store[0].id;
      session.storeSlug = store[0].slug;
      session.storeName = store[0].name;
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

  // Get store info
  const store = await db
    .select({ id: stores.id, slug: stores.slug, name: stores.name })
    .from(stores)
    .where(eq(stores.ownerId, user.id))
    .limit(1);

  const sessionUser: SessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
  };

  if (store.length > 0) {
    sessionUser.storeId = store[0].id;
    sessionUser.storeSlug = store[0].slug;
    sessionUser.storeName = store[0].name;
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
  };

  const token = await createSession(sessionUser);
  return { user: sessionUser, token };
}
