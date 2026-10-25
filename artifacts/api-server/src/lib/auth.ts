import { getAuth } from "@clerk/express";
import type { Request, RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db, marketplaceProfiles } from "@workspace/db";

export function currentUserId(req: Request): string | null {
  return getAuth(req).userId ?? null;
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!currentUserId(req)) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  next();
};

export async function getProfile(userId: string) {
  const [profile] = await db
    .select()
    .from(marketplaceProfiles)
    .where(eq(marketplaceProfiles.userId, userId))
    .limit(1);
  return profile ?? null;
}

export async function isMarketplaceAdmin(userId: string): Promise<boolean> {
  const configuredIds = (process.env.MARKETPLACE_ADMIN_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (configuredIds.includes(userId)) return true;
  const profile = await getProfile(userId);
  return profile?.role === "admin";
}

export const requireAdmin: RequestHandler = async (req, res, next) => {
  const userId = currentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  if (!(await isMarketplaceAdmin(userId))) {
    res.status(403).json({ error: "Admin access is required." });
    return;
  }
  next();
};

export async function requireVerifiedPhone(userId: string): Promise<boolean> {
  const profile = await getProfile(userId);
  return profile?.phoneVerified === true;
}

export async function requireApprovedSeller(userId: string): Promise<boolean> {
  const profile = await getProfile(userId);
  return profile?.role === "seller" && profile.sellerVerification === "approved";
}
