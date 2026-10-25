import { Router, type IRouter } from "express";
import { and, count, desc, eq, sql } from "drizzle-orm";
import {
  GetAdminDashboardResponse,
  ListAdminDisputesResponse,
  ListAdminFlagsResponse,
  ListAdminVerificationsResponse,
  ResolveDisputeBody,
  ResolveDisputeParams,
  ResolveDisputeResponse,
  ReviewFlagBody,
  ReviewFlagParams,
  ReviewFlagResponse,
  ReviewSellerVerificationBody,
  ReviewSellerVerificationParams,
  ReviewSellerVerificationResponse,
} from "@workspace/api-zod";
import {
  db,
  disputes,
  fraudFlags,
  listings,
  marketplaceProfiles,
  sellerVerifications,
  transactions,
} from "@workspace/db";
import { requireAdmin } from "../lib/auth";

const router: IRouter = Router();
router.use("/admin", requireAdmin);

function verificationDto(
  row: typeof sellerVerifications.$inferSelect,
  displayName: string,
) {
  return {
    id: row.id,
    userId: row.userId,
    status: row.status,
    submittedAt: row.submittedAt.toISOString(),
    displayName,
    state: row.state,
    city: row.city,
    reviewNote: row.reviewNote,
    documentPath: row.documentPath,
  };
}

function disputeDto(row: typeof disputes.$inferSelect) {
  return {
    id: row.id,
    transactionId: row.transactionId,
    listingId: row.listingId,
    buyerId: row.buyerId,
    sellerId: row.sellerId,
    reason: row.reason,
    evidencePaths: row.evidencePaths,
    sellerResponse: row.sellerResponse,
    responseEvidencePaths: row.responseEvidencePaths,
    status: row.status,
    resolutionNote: row.resolutionNote,
    createdAt: row.createdAt.toISOString(),
  };
}

function flagDto(row: typeof fraudFlags.$inferSelect) {
  return {
    id: row.id,
    reportedUserId: row.reportedUserId,
    reporterId: row.reporterId,
    listingId: row.listingId,
    reason: row.reason,
    details: row.details,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/admin/dashboard", async (_req, res): Promise<void> => {
  const [activeListings] = await db
    .select({ value: count() })
    .from(listings)
    .where(eq(listings.status, "active"));
  const [pendingVerifications] = await db
    .select({ value: count() })
    .from(sellerVerifications)
    .where(eq(sellerVerifications.status, "pending"));
  const [openDisputes] = await db
    .select({ value: count() })
    .from(disputes)
    .where(
      sql`${disputes.status} in ('open', 'under_review')`,
    );
  const flagged = await db
    .selectDistinct({ userId: fraudFlags.reportedUserId })
    .from(fraudFlags)
    .where(eq(fraudFlags.status, "open"));
  const [totalTransactions] = await db
    .select({ value: count() })
    .from(transactions);
  res.json(
    GetAdminDashboardResponse.parse({
      activeListings: activeListings?.value ?? 0,
      pendingVerifications: pendingVerifications?.value ?? 0,
      openDisputes: openDisputes?.value ?? 0,
      flaggedAccounts: flagged.length,
      totalTransactions: totalTransactions?.value ?? 0,
    }),
  );
});

router.get("/admin/verifications", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ verification: sellerVerifications, profile: marketplaceProfiles })
    .from(sellerVerifications)
    .innerJoin(
      marketplaceProfiles,
      eq(sellerVerifications.userId, marketplaceProfiles.userId),
    )
    .where(eq(sellerVerifications.status, "pending"))
    .orderBy(desc(sellerVerifications.submittedAt));
  res.json(
    ListAdminVerificationsResponse.parse(
      rows.map(({ verification, profile }) =>
        verificationDto(verification, profile.displayName),
      ),
    ),
  );
});

router.patch(
  "/admin/verifications/:verificationId",
  async (req, res): Promise<void> => {
    const params = ReviewSellerVerificationParams.safeParse(req.params);
    const parsed = ReviewSellerVerificationBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: !params.success
          ? params.error.message
          : parsed.success
            ? "Invalid review."
            : parsed.error.message,
      });
      return;
    }
    if (parsed.data.status === "approved") {
      const [approvedCount] = await db
        .select({ value: count() })
        .from(marketplaceProfiles)
        .where(eq(marketplaceProfiles.sellerVerification, "approved"));
      const pilotLimit = Number(process.env.PILOT_FARMS_LIMIT || "50");
      if ((approvedCount?.value ?? 0) >= pilotLimit) {
        res.status(400).json({
          error: `Pilot limit reached (${pilotLimit} pilot farms already approved).`,
        });
        return;
      }
    }

    const [verification] = await db
      .update(sellerVerifications)
      .set({
        status: parsed.data.status,
        reviewNote: parsed.data.reviewNote,
        reviewedAt: new Date(),
      })
      .where(eq(sellerVerifications.id, params.data.verificationId))
      .returning();
    if (!verification) {
      res.status(404).json({ error: "Verification request not found." });
      return;
    }
    await db
      .update(marketplaceProfiles)
      .set({
        sellerVerification: parsed.data.status,
        ...(parsed.data.status === "approved" ? { phoneVerified: true } : {}),
        updatedAt: new Date(),
      })
      .where(eq(marketplaceProfiles.userId, verification.userId));
    const [profile] = await db
      .select()
      .from(marketplaceProfiles)
      .where(eq(marketplaceProfiles.userId, verification.userId))
      .limit(1);
    res.json(
      ReviewSellerVerificationResponse.parse(
        verificationDto(verification, profile?.displayName ?? "Seller"),
      ),
    );
  },
);

router.get("/admin/flags", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(fraudFlags)
    .where(eq(fraudFlags.status, "open"))
    .orderBy(desc(fraudFlags.createdAt))
    .limit(100);
  res.json(ListAdminFlagsResponse.parse(rows.map(flagDto)));
});

router.patch(
  "/admin/flags/:flagId",
  async (req, res): Promise<void> => {
    const params = ReviewFlagParams.safeParse(req.params);
    const parsed = ReviewFlagBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: !params.success
          ? params.error.message
          : parsed.success
            ? "Invalid flag review."
            : parsed.error.message,
      });
      return;
    }
    const [flag] = await db
      .update(fraudFlags)
      .set({
        status: parsed.data.status,
        reviewedAt: new Date(),
      })
      .where(eq(fraudFlags.id, params.data.flagId))
      .returning();
    if (!flag) {
      res.status(404).json({ error: "Flag not found." });
      return;
    }
    res.json(ReviewFlagResponse.parse(flagDto(flag)));
  },
);

router.get("/admin/disputes", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(disputes)
    .where(
      sql`${disputes.status} in ('open', 'under_review')`,
    )
    .orderBy(desc(disputes.createdAt));
  res.json(ListAdminDisputesResponse.parse(rows.map(disputeDto)));
});

router.patch(
  "/admin/disputes/:disputeId",
  async (req, res): Promise<void> => {
    const params = ResolveDisputeParams.safeParse(req.params);
    const parsed = ResolveDisputeBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: !params.success
          ? params.error.message
          : parsed.success
            ? "Invalid dispute decision."
            : parsed.error.message,
      });
      return;
    }
    const [dispute] = await db
      .update(disputes)
      .set({
        status: parsed.data.decision,
        resolutionNote: parsed.data.resolutionNote,
      })
      .where(
        and(
          eq(disputes.id, params.data.disputeId),
          sql`${disputes.status} in ('open', 'under_review')`,
        ),
      )
      .returning();
    if (!dispute) {
      res.status(404).json({ error: "Open dispute not found." });
      return;
    }
    // A review decision never changes the money state. Only a payment provider
    // confirmation may release or refund escrow funds.
    res.json(ResolveDisputeResponse.parse(disputeDto(dispute)));
  },
);

export default router;
