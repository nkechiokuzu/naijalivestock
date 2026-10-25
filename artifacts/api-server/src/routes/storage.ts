import { Readable } from 'stream';
import { randomUUID } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import {
  FinalizeUploadBody,
  FinalizeUploadResponse,
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from '@workspace/api-zod';
import { Router, type IRouter, type Request, type Response } from 'express';
import { db, uploadGrants } from '@workspace/db';

import { currentUserId, isMarketplaceAdmin, requireAuth } from '../lib/auth';
import {
  localUploadExists,
  localUploadReadStream,
  localUploadStorageEnabled,
  saveLocalUpload,
} from '../lib/localUploadStorage';
import { ObjectPermission } from '../lib/objectAcl';
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from '../lib/objectStorage';

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 * Requires auth middleware so public callers cannot mint write-capable URLs.
 */
router.post(
  '/storage/uploads/request-url',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = currentUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Sign in to continue.' });
      return;
    }

    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing or invalid required fields' });
      return;
    }

    try {
      const { size, contentType, purpose } = parsed.data;
      const allowedTypes: Record<string, string[]> = {
        listing_photo: ['image/jpeg', 'image/png', 'image/webp'],
        identity_document: [
          'image/jpeg',
          'image/png',
          'image/webp',
          'application/pdf',
        ],
        dispute_evidence: [
          'image/jpeg',
          'image/png',
          'image/webp',
          'video/mp4',
        ],
      };
      const maxBytes =
        purpose === 'dispute_evidence' ? 12_000_000 : 8_000_000;
      if (!allowedTypes[purpose]?.includes(contentType) || size > maxBytes) {
        res.status(400).json({ error: 'That file type or size is not allowed.' });
        return;
      }

      const grantId = randomUUID();
      const uploadURL = localUploadStorageEnabled
        ? `/api/storage/dev-upload/${grantId}`
        : await objectStorageService.getObjectEntityUploadURL();
      const objectPath = localUploadStorageEnabled
        ? `/objects/uploads/${randomUUID()}`
        : objectStorageService.normalizeObjectEntityPath(uploadURL);
      await db.insert(uploadGrants).values({
        id: grantId,
        userId,
        purpose,
        objectPath,
        contentType,
        size,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      });

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, 'Error generating upload URL');
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  },
);

router.put(
  '/storage/dev-upload/:grantId',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    if (!localUploadStorageEnabled) {
      res.status(404).json({ error: 'Local upload mode is disabled.' });
      return;
    }
    const userId = currentUserId(req);
    const grantId = req.params.grantId;
    if (!userId) {
      res.status(401).json({ error: 'Sign in to continue.' });
      return;
    }
    if (typeof grantId !== 'string') {
      res.status(400).json({ error: 'Invalid upload grant.' });
      return;
    }
    const [grant] = await db
      .select()
      .from(uploadGrants)
      .where(
        and(
          eq(uploadGrants.id, grantId),
          eq(uploadGrants.userId, userId),
          eq(uploadGrants.finalized, false),
          gt(uploadGrants.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!grant) {
      res.status(404).json({ error: 'Upload permission expired or not found.' });
      return;
    }
    if (req.header('content-type') !== grant.contentType) {
      res.status(415).json({ error: 'Uploaded file type does not match.' });
      return;
    }
    try {
      await saveLocalUpload(req, grant.id, grant.size);
      res.status(204).end();
    } catch (error) {
      req.log.warn({ err: error, grantId: grant.id }, 'Local upload rejected');
      res.status(400).json({ error: 'Uploaded file did not match its request.' });
    }
  },
);

router.post(
  '/storage/uploads/finalize',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const userId = currentUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Sign in to continue.' });
      return;
    }
    const parsed = FinalizeUploadBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const [grant] = await db
      .select()
      .from(uploadGrants)
      .where(
        and(
          eq(uploadGrants.userId, userId),
          eq(uploadGrants.objectPath, parsed.data.objectPath),
          eq(uploadGrants.purpose, parsed.data.purpose),
          eq(uploadGrants.finalized, false),
          gt(uploadGrants.expiresAt, new Date()),
        ),
      )
      .limit(1);
    if (!grant) {
      res.status(404).json({ error: 'Upload permission expired or not found.' });
      return;
    }

    try {
      if (localUploadStorageEnabled) {
        if (!(await localUploadExists(grant.id, grant.size))) {
          res.status(404).json({ error: 'Uploaded file was not found.' });
          return;
        }
      } else {
        await objectStorageService.trySetObjectEntityAclPolicy(grant.objectPath, {
          owner: userId,
          visibility:
            parsed.data.purpose === 'listing_photo' ? 'public' : 'private',
        });
      }
      await db
        .update(uploadGrants)
        .set({ finalized: true })
        .where(eq(uploadGrants.id, grant.id));
      res.json(
        FinalizeUploadResponse.parse({
          objectPath: grant.objectPath,
          status: 'ready',
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, 'Error finalizing uploaded object');
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ error: 'Uploaded file was not found.' });
        return;
      }
      res.status(500).json({ error: 'Could not finalize the uploaded file.' });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get(
  '/storage/public-objects/*filePath',
  async (req: Request, res: Response) => {
    try {
      const raw = req.params.filePath;
      const filePath = Array.isArray(raw) ? raw.join('/') : raw;
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        res.status(404).json({ error: 'File not found' });
        return;
      }

      const response = await objectStorageService.downloadObject(file);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(
          response.body as ReadableStream<Uint8Array>,
        );
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      req.log.error({ err: error }, 'Error serving public object');
      res.status(500).json({ error: 'Failed to serve public object' });
    }
  },
);

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get('/storage/objects/*path', async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join('/') : raw;
    const objectPath = `/objects/${wildcardPath}`;
    if (localUploadStorageEnabled) {
      const [grant] = await db
        .select()
        .from(uploadGrants)
        .where(
          and(
            eq(uploadGrants.objectPath, objectPath),
            eq(uploadGrants.finalized, true),
          ),
        )
        .limit(1);
      if (!grant) {
        res.status(404).json({ error: 'Object not found.' });
        return;
      }
      const userId = currentUserId(req);
      const publicImage = grant.purpose === 'listing_photo';
      const isOwner = userId === grant.userId;
      const isAdmin = userId ? await isMarketplaceAdmin(userId) : false;
      if (!publicImage && !isOwner && !isAdmin) {
        res.status(userId ? 403 : 401).json({ error: 'Access denied.' });
        return;
      }
      if (!(await localUploadExists(grant.id, grant.size))) {
        res.status(404).json({ error: 'Object not found.' });
        return;
      }
      res.setHeader('Content-Type', grant.contentType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader(
        'Cache-Control',
        publicImage ? 'public, max-age=3600' : 'private, no-store',
      );
      localUploadReadStream(grant.id).pipe(res);
      return;
    }
    const objectFile =
      await objectStorageService.getObjectEntityFile(objectPath);
    const userId = currentUserId(req) ?? undefined;
    const canAccess = await objectStorageService.canAccessObjectEntity({
      userId,
      objectFile,
      requestedPermission: ObjectPermission.READ,
    });
    const isAdmin = userId ? await isMarketplaceAdmin(userId) : false;
    if (!canAccess && !isAdmin) {
      res.status(userId ? 403 : 401).json({ error: 'Access denied.' });
      return;
    }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(
        response.body as ReadableStream<Uint8Array>,
      );
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, 'Object not found');
      res.status(404).json({ error: 'Object not found' });
      return;
    }
    req.log.error({ err: error }, 'Error serving object');
    res.status(500).json({ error: 'Failed to serve object' });
  }
});

export default router;
