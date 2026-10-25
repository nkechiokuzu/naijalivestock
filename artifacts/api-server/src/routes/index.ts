import { Router, type IRouter } from "express";
import healthRouter from "./health";
import accountsRouter from "./accounts";
import adminRouter from "./admin";
import marketplaceRouter from "./marketplace";
import messagingRouter from "./messaging";
import storageRouter from "./storage";
import transactionsRouter from "./transactions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(accountsRouter);
router.use(adminRouter);
router.use(marketplaceRouter);
router.use(messagingRouter);
router.use(storageRouter);
router.use(transactionsRouter);

export default router;
