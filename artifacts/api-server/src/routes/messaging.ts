import { Router, type IRouter } from "express";
import { and, desc, eq, or } from "drizzle-orm";
import {
  CreateOfferBody,
  CreateOfferParams,
  CreateOfferResponse,
  ListConversationOffersResponse,
  ListConversationsResponse,
  ListMessagesParams,
  ListMessagesResponse,
  RespondToOfferBody,
  RespondToOfferParams,
  RespondToOfferResponse,
  SendMessageBody,
  SendMessageParams,
  SendMessageResponse,
  StartConversationBody,
  StartConversationResponse,
} from "@workspace/api-zod";
import {
  conversations,
  db,
  listings,
  marketplaceProfiles,
  messages,
  offers,
  transactions,
} from "@workspace/db";
import {
  currentUserId,
  getProfile,
  requireAuth,
  requireVerifiedPhone,
} from "../lib/auth";

const router: IRouter = Router();

async function getConversationForUser(conversationId: string, userId: string) {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        or(
          eq(conversations.buyerId, userId),
          eq(conversations.sellerId, userId),
        ),
      ),
    )
    .limit(1);
  return conversation ?? null;
}

router.get(
  "/conversations",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = currentUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    const rows = await db
      .select({ conversation: conversations, listing: listings })
      .from(conversations)
      .innerJoin(listings, eq(conversations.listingId, listings.id))
      .where(
        or(
          eq(conversations.buyerId, userId),
          eq(conversations.sellerId, userId),
        ),
      )
      .orderBy(desc(conversations.updatedAt));

    const results = [];
    for (const row of rows) {
      const otherUserId =
        row.conversation.buyerId === userId
          ? row.conversation.sellerId
          : row.conversation.buyerId;
      const [otherProfile] = await db
        .select()
        .from(marketplaceProfiles)
        .where(eq(marketplaceProfiles.userId, otherUserId))
        .limit(1);
      const [lastMessage] = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, row.conversation.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);
      results.push({
        id: row.conversation.id,
        listingId: row.listing.id,
        listingBreed: row.listing.breed,
        otherParticipantName: otherProfile?.displayName ?? "Marketplace member",
        lastMessage: lastMessage?.text ?? "",
        updatedAt: row.conversation.updatedAt.toISOString(),
        unreadCount: 0,
      });
    }
    res.json(ListConversationsResponse.parse(results));
  },
);

router.post(
  "/conversations",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = currentUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    const parsed = StartConversationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (!(await requireVerifiedPhone(userId))) {
      res.status(403).json({
        error: "Verify your phone before contacting a seller.",
      });
      return;
    }
    const profile = await getProfile(userId);
    if (!profile || profile.role !== "buyer") {
      res.status(403).json({ error: "A buyer account is required." });
      return;
    }
    const [listing] = await db
      .select()
      .from(listings)
      .where(
        and(
          eq(listings.id, parsed.data.listingId),
          eq(listings.status, "active"),
        ),
      )
      .limit(1);
    if (!listing) {
      res.status(404).json({ error: "This listing is no longer available." });
      return;
    }
    if (listing.sellerId === userId) {
      res.status(400).json({ error: "You cannot message yourself." });
      return;
    }

    let [conversation] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.buyerId, userId),
          eq(conversations.listingId, listing.id),
        ),
      )
      .limit(1);
    if (!conversation) {
      [conversation] = await db
        .insert(conversations)
        .values({
          listingId: listing.id,
          buyerId: userId,
          sellerId: listing.sellerId,
        })
        .returning();
    }
    const [message] = await db
      .insert(messages)
      .values({
        conversationId: conversation.id,
        senderId: userId,
        text: parsed.data.message,
      })
      .returning();
    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversation.id));

    const [seller] = await db
      .select()
      .from(marketplaceProfiles)
      .where(eq(marketplaceProfiles.userId, listing.sellerId))
      .limit(1);
    res.status(201).json(
      StartConversationResponse.parse({
        id: conversation.id,
        listingId: listing.id,
        listingBreed: listing.breed,
        otherParticipantName: seller?.displayName ?? "Seller",
        lastMessage: message.text,
        updatedAt: message.createdAt.toISOString(),
        unreadCount: 0,
      }),
    );
  },
);

router.get(
  "/conversations/:conversationId/messages",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = currentUserId(req);
    const params = ListMessagesParams.safeParse(req.params);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const conversation = await getConversationForUser(
      params.data.conversationId,
      userId,
    );
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found." });
      return;
    }
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversation.id))
      .orderBy(messages.createdAt);
    res.json(
      ListMessagesResponse.parse(
        rows.map((message) => ({
          id: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          text: message.text,
          createdAt: message.createdAt.toISOString(),
        })),
      ),
    );
  },
);

router.get(
  "/conversations/:conversationId/offers",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = currentUserId(req);
    const params = CreateOfferParams.safeParse(req.params);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const conversation = await getConversationForUser(
      params.data.conversationId,
      userId,
    );
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found." });
      return;
    }
    const rows = await db
      .select()
      .from(offers)
      .where(eq(offers.conversationId, conversation.id))
      .orderBy(desc(offers.createdAt));
    res.json(
      ListConversationOffersResponse.parse(
        rows.map((offer) => ({
          id: offer.id,
          conversationId: offer.conversationId,
          buyerId: offer.buyerId,
          amountNaira: offer.amountNaira,
          quantity: offer.quantity,
          status: offer.status,
          createdAt: offer.createdAt.toISOString(),
        })),
      ),
    );
  },
);

router.post(
  "/conversations/:conversationId/messages",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = currentUserId(req);
    const params = SendMessageParams.safeParse(req.params);
    const parsed = SendMessageBody.safeParse(req.body);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: !params.success
          ? params.error.message
          : parsed.success
            ? "Invalid message."
            : parsed.error.message,
      });
      return;
    }
    if (!(await requireVerifiedPhone(userId))) {
      res.status(403).json({
        error: "Verify your phone before sending a message.",
      });
      return;
    }
    const conversation = await getConversationForUser(
      params.data.conversationId,
      userId,
    );
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found." });
      return;
    }
    const [message] = await db
      .insert(messages)
      .values({
        conversationId: conversation.id,
        senderId: userId,
        text: parsed.data.text,
      })
      .returning();
    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversation.id));
    res.status(201).json(
      SendMessageResponse.parse({
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        text: message.text,
        createdAt: message.createdAt.toISOString(),
      }),
    );
  },
);

router.post(
  "/conversations/:conversationId/offers",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = currentUserId(req);
    const params = CreateOfferParams.safeParse(req.params);
    const parsed = CreateOfferBody.safeParse(req.body);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: !params.success
          ? params.error.message
          : parsed.success
            ? "Invalid offer."
            : parsed.error.message,
      });
      return;
    }
    if (!(await requireVerifiedPhone(userId))) {
      res.status(403).json({
        error: "Verify your phone before making an offer.",
      });
      return;
    }
    const conversation = await getConversationForUser(
      params.data.conversationId,
      userId,
    );
    if (!conversation || conversation.buyerId !== userId) {
      res.status(403).json({ error: "Only the buyer can make an offer." });
      return;
    }
    const [listing] = await db
      .select()
      .from(listings)
      .where(eq(listings.id, conversation.listingId))
      .limit(1);
    if (
      !listing ||
      listing.status !== "active" ||
      parsed.data.quantity > listing.quantity
    ) {
      res.status(409).json({
        error: "The requested quantity is no longer available.",
      });
      return;
    }
    const [offer] = await db
      .insert(offers)
      .values({
        conversationId: conversation.id,
        buyerId: userId,
        sellerId: conversation.sellerId,
        amountNaira: parsed.data.amountNaira,
        quantity: parsed.data.quantity,
      })
      .returning();
    res.status(201).json(
      CreateOfferResponse.parse({
        id: offer.id,
        conversationId: offer.conversationId,
        buyerId: offer.buyerId,
        amountNaira: offer.amountNaira,
        quantity: offer.quantity,
        status: offer.status,
        createdAt: offer.createdAt.toISOString(),
      }),
    );
  },
);

router.patch(
  "/offers/:offerId",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = currentUserId(req);
    const params = RespondToOfferParams.safeParse(req.params);
    const parsed = RespondToOfferBody.safeParse(req.body);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: !params.success
          ? params.error.message
          : parsed.success
            ? "Invalid offer response."
            : parsed.error.message,
      });
      return;
    }
    const [offer] = await db
      .select()
      .from(offers)
      .where(eq(offers.id, params.data.offerId))
      .limit(1);
    if (!offer || offer.sellerId !== userId) {
      res.status(404).json({ error: "Offer not found." });
      return;
    }
    if (offer.status !== "pending") {
      res.status(409).json({ error: "This offer has already been answered." });
      return;
    }
    const [updated] = await db
      .update(offers)
      .set({ status: parsed.data.status })
      .where(eq(offers.id, offer.id))
      .returning();

    if (parsed.data.status === "accepted") {
      const [conversation] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, offer.conversationId))
        .limit(1);
      if (conversation) {
        const [alreadyCreated] = await db
          .select({ id: transactions.id })
          .from(transactions)
          .where(eq(transactions.offerId, offer.id))
          .limit(1);
        if (!alreadyCreated) {
          await db.insert(transactions).values({
            listingId: conversation.listingId,
            conversationId: conversation.id,
            offerId: offer.id,
            buyerId: offer.buyerId,
            sellerId: offer.sellerId,
            amountNaira: offer.amountNaira,
            feeNaira: Math.round(offer.amountNaira * 0.1),
            status: "payment_setup_required",
            paymentProvider: "unconfigured",
          });
        }
      }
    }
    res.json(
      RespondToOfferResponse.parse({
        id: updated.id,
        conversationId: updated.conversationId,
        buyerId: updated.buyerId,
        amountNaira: updated.amountNaira,
        quantity: updated.quantity,
        status: updated.status,
        createdAt: updated.createdAt.toISOString(),
      }),
    );
  },
);

export default router;
