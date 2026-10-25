import { Router, type IRouter } from "express";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  type SQL,
} from "drizzle-orm";
import {
  CreateListingBody,
  CreateListingResponse,
  DeleteListingParams,
  GetListingParams,
  GetListingResponse,
  GetMarketplaceSummaryResponse,
  ListListingsQueryParams,
  ListListingsResponse,
  ListMyListingsResponse,
  UpdateListingBody,
  UpdateListingParams,
  UpdateListingResponse,
} from "@workspace/api-zod";
import {
  db,
  fraudFlags,
  listings,
  marketplaceProfiles,
  uploadGrants,
} from "@workspace/db";
import { currentUserId, getProfile, requireApprovedSeller, requireAuth, requireVerifiedPhone } from "../lib/auth";

const router: IRouter = Router();

type ListingJoin = {
  listing: typeof listings.$inferSelect;
  seller: typeof marketplaceProfiles.$inferSelect;
};

function listingDto({ listing, seller }: ListingJoin) {
  return {
    id: listing.id,
    category: listing.category,
    breed: listing.breed,
    ageMonths: listing.ageMonths,
    weightKg: listing.weightKg,
    healthStatus: listing.healthStatus,
    priceNaira: listing.priceNaira,
    quantity: listing.quantity,
    state: listing.state,
    city: listing.city,
    fulfillment: listing.fulfillment,
    photos: listing.photos,
    seller: {
      id: seller.userId,
      name: seller.displayName,
      verified: seller.sellerVerification === "approved",
      location: [seller.city, seller.state].filter(Boolean).join(", "),
      memberSince: seller.createdAt.toISOString(),
    },
    featured: listing.featured,
    sample: listing.isSample,
    status: listing.status,
    createdAt: listing.createdAt.toISOString(),
  };
}

async function getListingJoin(listingId: string): Promise<ListingJoin | null> {
  const [row] = await db
    .select({ listing: listings, seller: marketplaceProfiles })
    .from(listings)
    .innerJoin(
      marketplaceProfiles,
      eq(listings.sellerId, marketplaceProfiles.userId),
    )
    .where(eq(listings.id, listingId))
    .limit(1);
  return row ?? null;
}

async function validateListingPhotos(
  photos: string[],
  userId: string,
): Promise<boolean> {
  for (const photo of photos) {
    if (photo.startsWith("/images/")) continue;
    if (!photo.startsWith("/objects/")) return false;
    const [grant] = await db
      .select({ id: uploadGrants.id })
      .from(uploadGrants)
      .where(
        and(
          eq(uploadGrants.userId, userId),
          eq(uploadGrants.objectPath, photo),
          eq(uploadGrants.purpose, "listing_photo"),
          eq(uploadGrants.finalized, true),
        ),
      )
      .limit(1);
    if (!grant) return false;
  }
  return true;
}

router.get("/marketplace/summary", async (_req, res): Promise<void> => {
  const [activeCount] = await db
    .select({ value: count() })
    .from(listings)
    .where(eq(listings.status, "active"));
  const [verifiedCount] = await db
    .select({ value: count() })
    .from(marketplaceProfiles)
    .where(eq(marketplaceProfiles.sellerVerification, "approved"));
  const grouped = await db
    .select({ category: listings.category, value: count() })
    .from(listings)
    .where(eq(listings.status, "active"))
    .groupBy(listings.category);
  const categoryCounts: Record<string, number> = {
    cattle: 0,
    goats: 0,
    sheep: 0,
    poultry: 0,
    fish: 0,
    other: 0,
  };
  for (const group of grouped) categoryCounts[group.category] = group.value;

  const featuredRows = await db
    .select({ listing: listings, seller: marketplaceProfiles })
    .from(listings)
    .innerJoin(
      marketplaceProfiles,
      eq(listings.sellerId, marketplaceProfiles.userId),
    )
    .where(and(eq(listings.status, "active"), eq(listings.featured, true)))
    .orderBy(desc(listings.createdAt))
    .limit(4);

  res.json(
    GetMarketplaceSummaryResponse.parse({
      activeListings: activeCount?.value ?? 0,
      verifiedSellers: verifiedCount?.value ?? 0,
      categoryCounts,
      featuredListings: featuredRows.map(listingDto),
    }),
  );
});

router.get(
  "/seller/listings",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = currentUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    const profile = await getProfile(userId);
    if (!profile || profile.role !== "seller") {
      res.status(403).json({ error: "A seller account is required." });
      return;
    }
    const rows = await db
      .select({ listing: listings, seller: marketplaceProfiles })
      .from(listings)
      .innerJoin(
        marketplaceProfiles,
        eq(listings.sellerId, marketplaceProfiles.userId),
      )
      .where(eq(listings.sellerId, userId))
      .orderBy(desc(listings.createdAt));
    res.json(
      ListMyListingsResponse.parse({
        listings: rows.map(listingDto),
        total: rows.length,
      }),
    );
  },
);

router.get("/listings", async (req, res): Promise<void> => {
  const parsed = ListListingsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const params = parsed.data;
  const conditions: SQL[] = [eq(listings.status, "active")];
  if (params.category) conditions.push(eq(listings.category, params.category));
  if (params.location) {
    const location = `%${params.location}%`;
    const locationFilter = or(
      ilike(listings.state, location),
      ilike(listings.city, location),
    );
    if (locationFilter) conditions.push(locationFilter);
  }
  if (params.q) {
    const query = `%${params.q}%`;
    const textFilter = or(
      ilike(listings.breed, query),
      ilike(listings.category, query),
      ilike(listings.state, query),
      ilike(listings.city, query),
    );
    if (textFilter) conditions.push(textFilter);
  }
  if (params.minPrice !== undefined) {
    conditions.push(gte(listings.priceNaira, params.minPrice));
  }
  if (params.maxPrice !== undefined) {
    conditions.push(lte(listings.priceNaira, params.maxPrice));
  }
  if (params.featured !== undefined) {
    conditions.push(eq(listings.featured, params.featured));
  }

  const order =
    params.sort === "price-low"
      ? asc(listings.priceNaira)
      : params.sort === "price-high"
        ? desc(listings.priceNaira)
        : desc(listings.createdAt);
  const whereClause = and(...conditions);
  const rows = await db
    .select({ listing: listings, seller: marketplaceProfiles })
    .from(listings)
    .innerJoin(
      marketplaceProfiles,
      eq(listings.sellerId, marketplaceProfiles.userId),
    )
    .where(whereClause)
    .orderBy(order)
    .limit(60);
  const [total] = await db
    .select({ value: count() })
    .from(listings)
    .where(whereClause);

  res.json(
    ListListingsResponse.parse({
      listings: rows.map(listingDto),
      total: total?.value ?? 0,
    }),
  );
});

router.post(
  "/listings",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = currentUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    const parsed = CreateListingBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (!(await requireVerifiedPhone(userId))) {
      res.status(403).json({ error: "Verify your phone before posting." });
      return;
    }
    if (!(await requireApprovedSeller(userId))) {
      res.status(403).json({
        error: "Seller identity review must be approved before posting.",
      });
      return;
    }
    if (!(await validateListingPhotos(parsed.data.photos, userId))) {
      res.status(400).json({
        error: "Each listing photo must be an approved image upload.",
      });
      return;
    }

    const profile = await getProfile(userId);
    if (!profile) {
      res.status(404).json({ error: "Complete account setup first." });
      return;
    }
    const data = parsed.data;
    const [duplicate] = await db
      .select({ id: listings.id })
      .from(listings)
      .where(
        and(
          eq(listings.sellerId, userId),
          eq(listings.status, "active"),
          eq(listings.category, data.category),
          eq(listings.breed, data.breed),
          eq(listings.priceNaira, data.priceNaira),
          eq(listings.state, data.state),
          eq(listings.city, data.city),
        ),
      )
      .limit(1);
    const [created] = await db
      .insert(listings)
      .values({
        sellerId: userId,
        ...data,
        featured: false,
        status: "active",
      })
      .returning();
    if (duplicate) {
      await db.insert(fraudFlags).values({
        reportedUserId: userId,
        reason: "duplicate_listing",
        details:
          "Automatically flagged because this seller already has an active listing with matching animal, location, and price details.",
        listingId: created.id,
      });
    }
    const joined = await getListingJoin(created.id);
    res.status(201).json(
      CreateListingResponse.parse(joined ? listingDto(joined) : created),
    );
  },
);

router.get("/listings/:listingId", async (req, res): Promise<void> => {
  const params = GetListingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const row = await getListingJoin(params.data.listingId);
  if (!row || row.listing.status === "archived") {
    res.status(404).json({ error: "Listing not found." });
    return;
  }
  res.json(GetListingResponse.parse(listingDto(row)));
});

router.patch(
  "/listings/:listingId",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = currentUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    const params = UpdateListingParams.safeParse(req.params);
    const parsed = UpdateListingBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({
        error: !params.success
          ? params.error.message
          : parsed.success
            ? "Invalid listing."
            : parsed.error.message,
      });
      return;
    }
    const existing = await getListingJoin(params.data.listingId);
    if (!existing) {
      res.status(404).json({ error: "Listing not found." });
      return;
    }
    if (existing.listing.sellerId !== userId) {
      res.status(403).json({ error: "You cannot edit this listing." });
      return;
    }
    if (
      parsed.data.photos &&
      !(await validateListingPhotos(parsed.data.photos, userId))
    ) {
      res.status(400).json({
        error: "Each listing photo must be an approved image upload.",
      });
      return;
    }
    const [updated] = await db
      .update(listings)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(listings.id, existing.listing.id))
      .returning();
    const joined = await getListingJoin(updated.id);
    res.json(
      UpdateListingResponse.parse(joined ? listingDto(joined) : updated),
    );
  },
);

router.delete(
  "/listings/:listingId",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = currentUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    const params = DeleteListingParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [updated] = await db
      .update(listings)
      .set({ status: "archived", updatedAt: new Date() })
      .where(
        and(eq(listings.id, params.data.listingId), eq(listings.sellerId, userId)),
      )
      .returning({ id: listings.id });
    if (!updated) {
      res.status(404).json({ error: "Listing not found." });
      return;
    }
    res.status(204).end();
  },
);

export default router;
