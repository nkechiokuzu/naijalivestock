import { Router, type IRouter } from "express";
import { and, desc, eq, or } from "drizzle-orm";
import {
  ConfirmReceiptParams,
  ConfirmReceiptResponse,
  GetTransactionParams,
  GetTransactionResponse,
  GetTransactionDisputeResponse,
  MarkTransactionDeliveredResponse,
  OpenDisputeBody,
  OpenDisputeParams,
  OpenDisputeResponse,
  ReportMarketplaceUserBody,
  ReportMarketplaceUserResponse,
  RespondToDisputeBody,
  RespondToDisputeParams,
  RespondToDisputeResponse,
} from "@workspace/api-zod";
import {
  db,
  disputes,
  fraudFlags,
  listings,
  marketplaceProfiles,
  transactions,
  uploadGrants,
} from "@workspace/db";
import {
  currentUserId,
  getProfile,
  requireAuth,
  requireVerifiedPhone,
} from "../lib/auth";

const router: IRouter = Router();

function transactionDto(row: typeof transactions.$inferSelect) {
  return {
    id: row.id,
    listingId: row.listingId,
    buyerId: row.buyerId,
    sellerId: row.sellerId,
    amountNaira: row.amountNaira,
    feeNaira: row.feeNaira,
    status: row.status,
    paymentProvider: row.paymentProvider,
    createdAt: row.createdAt.toISOString(),
    receiptDeadline: row.receiptDeadline?.toISOString() ?? null,
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

async function getUserTransaction(transactionId: string, userId: string) {
  const [row] = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.id, transactionId),
        or(
          eq(transactions.buyerId, userId),
          eq(transactions.sellerId, userId),
        ),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function validateEvidencePaths(
  evidencePaths: string[],
  userId: string,
): Promise<boolean> {
  if (evidencePaths.length === 0) return true;
  const grants = await db
    .select({ objectPath: uploadGrants.objectPath })
    .from(uploadGrants)
    .where(
      and(
        eq(uploadGrants.userId, userId),
        eq(uploadGrants.purpose, "dispute_evidence"),
        eq(uploadGrants.finalized, true),
      ),
    );
  const allowedPaths = new Set(grants.map((grant) => grant.objectPath));
  return evidencePaths.every((path) => allowedPaths.has(path));
}

router.get("/transactions", requireAuth, async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  const rows = await db
    .select()
    .from(transactions)
    .where(
      or(
        eq(transactions.buyerId, userId),
        eq(transactions.sellerId, userId),
      ),
    )
    .orderBy(desc(transactions.createdAt));
  res.json(rows.map(transactionDto));
});

router.get(
  "/transactions/:transactionId",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = currentUserId(req);
    const params = GetTransactionParams.safeParse(req.params);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const row = await getUserTransaction(params.data.transactionId, userId);
    if (!row) {
      res.status(404).json({ error: "Transaction not found." });
      return;
    }
    res.json(GetTransactionResponse.parse(transactionDto(row)));
  },
);

router.get(
  "/transactions/:transactionId/disputes",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = currentUserId(req);
    const params = GetTransactionParams.safeParse(req.params);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const row = await getUserTransaction(params.data.transactionId, userId);
    if (!row) {
      res.status(404).json({ error: "Transaction not found." });
      return;
    }
    const [dispute] = await db
      .select()
      .from(disputes)
      .where(eq(disputes.transactionId, row.id))
      .limit(1);
    res.json(
      GetTransactionDisputeResponse.parse(
        dispute ? disputeDto(dispute) : null,
      ),
    );
  },
);

router.post(
  "/transactions/:transactionId/delivery",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = currentUserId(req);
    const params = GetTransactionParams.safeParse(req.params);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const row = await getUserTransaction(params.data.transactionId, userId);
    if (!row || row.sellerId !== userId) {
      res.status(404).json({ error: "Transaction not found." });
      return;
    }
    if (row.paymentProvider === "unconfigured") {
      res.status(503).json({
        error:
          "Escrow is not connected. A delivery confirmation window cannot start before funds are protected.",
      });
      return;
    }
    if (!["funds_held", "in_delivery"].includes(row.status)) {
      res.status(409).json({ error: "This transaction is not ready for delivery." });
      return;
    }
    const [updated] = await db
      .update(transactions)
      .set({
        status: "receipt_window",
        receiptDeadline: new Date(Date.now() + 72 * 60 * 60 * 1000),
      })
      .where(eq(transactions.id, row.id))
      .returning();
    res.json(
      MarkTransactionDeliveredResponse.parse(transactionDto(updated)),
    );
  },
);

router.post(
  "/transactions/:transactionId/receipt",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = currentUserId(req);
    const params = ConfirmReceiptParams.safeParse(req.params);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const row = await getUserTransaction(params.data.transactionId, userId);
    if (!row || row.buyerId !== userId) {
      res.status(404).json({ error: "Transaction not found." });
      return;
    }
    if (row.paymentProvider === "unconfigured") {
      res.status(503).json({
        error:
          "Escrow payments are not connected. No funds are held, so receipt cannot release payment.",
      });
      return;
    }
    if (!["funds_held", "in_delivery", "receipt_window"].includes(row.status)) {
      res.status(409).json({ error: "This transaction is not awaiting receipt." });
      return;
    }
    const [updated] = await db
      .update(transactions)
      .set({ status: "released" })
      .where(eq(transactions.id, row.id))
      .returning();
    res.json(ConfirmReceiptResponse.parse(transactionDto(updated)));
  },
);

router.post(
  "/transactions/:transactionId/disputes",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = currentUserId(req);
    const params = OpenDisputeParams.safeParse(req.params);
    const parsed = OpenDisputeBody.safeParse(req.body);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: !params.success
          ? params.error.message
          : parsed.success
            ? "Invalid dispute."
            : parsed.error.message,
      });
      return;
    }
    const row = await getUserTransaction(params.data.transactionId, userId);
    if (!row) {
      res.status(404).json({ error: "Transaction not found." });
      return;
    }
    if (!(await requireVerifiedPhone(userId))) {
      res.status(403).json({ error: "Verify your phone before opening a dispute." });
      return;
    }
    if (!(await validateEvidencePaths(parsed.data.evidencePaths, userId))) {
      res.status(400).json({ error: "Evidence must be uploaded to this dispute." });
      return;
    }
    if (row.status === "released" || row.status === "refunded") {
      res.status(409).json({ error: "This transaction is already closed." });
      return;
    }
    const [existing] = await db
      .select()
      .from(disputes)
      .where(eq(disputes.transactionId, row.id))
      .limit(1);
    if (existing) {
      res.status(409).json({ error: "A dispute is already open." });
      return;
    }
    const [listing] = await db
      .select()
      .from(listings)
      .where(eq(listings.id, row.listingId))
      .limit(1);
    const [dispute] = await db
      .insert(disputes)
      .values({
        transactionId: row.id,
        listingId: row.listingId,
        buyerId: row.buyerId,
        sellerId: row.sellerId,
        reason: parsed.data.reason,
        evidencePaths: parsed.data.evidencePaths,
        status: "open",
      })
      .returning();
    await db
      .update(transactions)
      .set({ status: "disputed" })
      .where(eq(transactions.id, row.id));
    if (listing) {
      await db.insert(fraudFlags).values({
        reportedUserId: row.sellerId,
        reporterId: userId,
        listingId: listing.id,
        reason: "seller_misconduct",
        details: `A buyer opened a transaction dispute: ${parsed.data.reason.slice(0, 500)}`,
      });
    }
    res.status(201).json(OpenDisputeResponse.parse(disputeDto(dispute)));
  },
);

router.post(
  "/disputes/:disputeId/response",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = currentUserId(req);
    const params = RespondToDisputeParams.safeParse(req.params);
    const parsed = RespondToDisputeBody.safeParse(req.body);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: !params.success
          ? params.error.message
          : parsed.success
            ? "Invalid dispute response."
            : parsed.error.message,
      });
      return;
    }
    const [dispute] = await db
      .select()
      .from(disputes)
      .where(eq(disputes.id, params.data.disputeId))
      .limit(1);
    if (!dispute || dispute.sellerId !== userId) {
      res.status(404).json({ error: "Dispute not found." });
      return;
    }
    if (!(await validateEvidencePaths(parsed.data.evidencePaths, userId))) {
      res.status(400).json({ error: "Evidence must be uploaded to this dispute." });
      return;
    }
    const [updated] = await db
      .update(disputes)
      .set({
        sellerResponse: parsed.data.message,
        responseEvidencePaths: parsed.data.evidencePaths,
        status: "under_review",
      })
      .where(eq(disputes.id, dispute.id))
      .returning();
    res.status(201).json(
      RespondToDisputeResponse.parse(disputeDto(updated)),
    );
  },
);

router.post(
  "/reports",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = currentUserId(req);
    const parsed = ReportMarketplaceUserBody.safeParse(req.body);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (!(await requireVerifiedPhone(userId))) {
      res.status(403).json({ error: "Verify your phone before sending a report." });
      return;
    }
    if (parsed.data.reportedUserId === userId) {
      res.status(400).json({ error: "You cannot report your own account." });
      return;
    }
    const target = await getProfile(parsed.data.reportedUserId);
    if (!target) {
      res.status(404).json({ error: "Account not found." });
      return;
    }
    if (parsed.data.listingId) {
      const [listing] = await db
        .select()
        .from(listings)
        .where(eq(listings.id, parsed.data.listingId))
        .limit(1);
      if (!listing || listing.sellerId !== parsed.data.reportedUserId) {
        res.status(400).json({ error: "The listing does not belong to this account." });
        return;
      }
    }
    const [flag] = await db
      .insert(fraudFlags)
      .values({
        reportedUserId: parsed.data.reportedUserId,
        reporterId: userId,
        listingId: parsed.data.listingId ?? null,
        reason: parsed.data.reason,
        details: parsed.data.details,
      })
      .returning();
    res.status(201).json(
      ReportMarketplaceUserResponse.parse({
        id: flag.id,
        reportedUserId: flag.reportedUserId,
        reporterId: flag.reporterId,
        listingId: flag.listingId,
        reason: flag.reason,
        details: flag.details,
        status: flag.status,
        createdAt: flag.createdAt.toISOString(),
      }),
    );
  },
);

export default router;
