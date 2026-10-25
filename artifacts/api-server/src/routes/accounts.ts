import { Router, type IRouter } from "express";
import { and, eq, gt } from "drizzle-orm";
import {
  CheckPhoneVerificationBody,
  CheckPhoneVerificationResponse,
  GetMyProfileResponse,
  GetMySellerVerificationResponse,
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
  SaveMyProfileBody,
  SaveMyProfileResponse,
  StartPhoneVerificationBody,
  StartPhoneVerificationResponse,
  SubmitSellerVerificationBody,
  SubmitSellerVerificationResponse,
} from "@workspace/api-zod";
import {
  db,
  marketplaceProfiles,
  sellerVerifications,
  uploadGrants,
} from "@workspace/db";
import { currentUserId, getProfile, requireAuth } from "../lib/auth";

const router: IRouter = Router();

function verificationDto(
  verification: typeof sellerVerifications.$inferSelect,
  displayName: string,
) {
  return {
    id: verification.id,
    userId: verification.userId,
    status: verification.status,
    submittedAt: verification.submittedAt.toISOString(),
    displayName,
    state: verification.state,
    city: verification.city,
    reviewNote: verification.reviewNote,
    documentPath: verification.documentPath,
  };
}

router.get("/profiles/me", requireAuth, async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  const profile = await getProfile(userId);
  res.json(
    GetMyProfileResponse.parse(
      profile
        ? {
            userId: profile.userId,
            role: profile.role,
            displayName: profile.displayName,
            phone: profile.phone,
            phoneVerified: profile.phoneVerified,
            sellerVerification: profile.sellerVerification,
            state: profile.state,
            city: profile.city,
          }
        : null,
    ),
  );
});

router.put("/profiles/me", requireAuth, async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  const parsed = SaveMyProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await getProfile(userId);
  const role = existing?.role ?? parsed.data.role;
  const phoneVerified =
    existing?.phone === parsed.data.phone ? existing.phoneVerified : false;
  const [profile] = await db
    .insert(marketplaceProfiles)
    .values({
      userId,
      role,
      displayName: parsed.data.displayName,
      phone: parsed.data.phone,
      phoneVerified,
      state: parsed.data.state,
      city: parsed.data.city,
      sellerVerification: existing?.sellerVerification ?? "not_started",
    })
    .onConflictDoUpdate({
      target: marketplaceProfiles.userId,
      set: {
        displayName: parsed.data.displayName,
        phone: parsed.data.phone,
        phoneVerified,
        state: parsed.data.state,
        city: parsed.data.city,
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json(
    SaveMyProfileResponse.parse({
      userId: profile.userId,
      role: profile.role,
      displayName: profile.displayName,
      phone: profile.phone,
      phoneVerified: profile.phoneVerified,
      sellerVerification: profile.sellerVerification,
      state: profile.state,
      city: profile.city,
    }),
  );
});

function isMockPhoneVerificationAllowed(): boolean {
  // It MUST be impossible to enable in production
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  return process.env.MOCK_PHONE_VERIFICATION === "true";
}

router.post(
  "/verification/phone/start",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = StartPhoneVerificationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    if (isMockPhoneVerificationAllowed()) {
      res.status(202).json(
        StartPhoneVerificationResponse.parse({
          status: "pending",
          message:
            "Development mock verification active. Use code 123456 to verify.",
        }),
      );
      return;
    }

    res.status(503).json(
      StartPhoneVerificationResponse.parse({
        status: "unavailable",
        message:
          "SMS verification is not active yet. Connect the SMS provider before messaging or making offers.",
      }),
    );
  },
);

router.post(
  "/verification/phone/check",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = currentUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }

    const parsed = CheckPhoneVerificationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    if (isMockPhoneVerificationAllowed()) {
      if (parsed.data.code === "123456") {
        await db
          .insert(marketplaceProfiles)
          .values({
            userId,
            displayName: "User",
            phone: parsed.data.phone,
            phoneVerified: true,
          })
          .onConflictDoUpdate({
            target: marketplaceProfiles.userId,
            set: {
              phone: parsed.data.phone,
              phoneVerified: true,
              updatedAt: new Date(),
            },
          });

        res.json(
          CheckPhoneVerificationResponse.parse({
            status: "approved",
            message: "Phone number verified successfully (dev mock).",
          }),
        );
        return;
      }

      res.status(400).json(
        CheckPhoneVerificationResponse.parse({
          status: "rejected",
          message: "Invalid verification code. (Dev mock expects 123456)",
        }),
      );
      return;
    }

    res.status(503).json(
      CheckPhoneVerificationResponse.parse({
        status: "unavailable",
        message:
          "SMS verification is not active yet. No code has been verified.",
      }),
    );
  },
);

router.get(
  "/verification/seller",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = currentUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    const [verification] = await db
      .select()
      .from(sellerVerifications)
      .where(eq(sellerVerifications.userId, userId))
      .limit(1);
    if (!verification) {
      res.json(GetMySellerVerificationResponse.parse(null));
      return;
    }
    const profile = await getProfile(userId);
    res.json(
      GetMySellerVerificationResponse.parse(
        verificationDto(verification, profile?.displayName ?? "Seller"),
      ),
    );
  },
);

router.post(
  "/verification/seller",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = currentUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    const parsed = SubmitSellerVerificationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const profile = await getProfile(userId);
    if (!profile || profile.role !== "seller") {
      res.status(403).json({ error: "A seller account is required." });
      return;
    }
    const allowPilot = process.env.ALLOW_PILOT_VERIFICATION !== "false";
    if (!profile.phoneVerified && !allowPilot) {
      res.status(403).json({ error: "Verify your phone before applying." });
      return;
    }

    const [documentGrant] = await db
      .select()
      .from(uploadGrants)
      .where(
        and(
          eq(uploadGrants.userId, userId),
          eq(uploadGrants.objectPath, parsed.data.documentPath),
          eq(uploadGrants.purpose, "identity_document"),
          eq(uploadGrants.finalized, true),
        ),
      )
      .limit(1);
    if (!documentGrant) {
      res.status(400).json({ error: "Upload a valid identity document first." });
      return;
    }

    const verificationValues = {
      userId,
      legalName: parsed.data.legalName,
      state: parsed.data.state,
      city: parsed.data.city,
      idType: parsed.data.idType,
      documentPath: parsed.data.documentPath,
      status: "pending",
      reviewNote: null,
      submittedAt: new Date(),
      reviewedAt: null,
    };
    const [verification] = await db
      .insert(sellerVerifications)
      .values(verificationValues)
      .onConflictDoUpdate({
        target: sellerVerifications.userId,
        set: verificationValues,
      })
      .returning();
    await db
      .update(marketplaceProfiles)
      .set({
        sellerVerification: "pending",
        state: parsed.data.state,
        city: parsed.data.city,
        updatedAt: new Date(),
      })
      .where(eq(marketplaceProfiles.userId, userId));

    res.status(201).json(
      SubmitSellerVerificationResponse.parse(
        verificationDto(verification, profile.displayName),
      ),
    );
  },
);

export default router;
