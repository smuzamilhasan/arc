import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clientRouter from "./client";
import auditRouter from "./audit";
import narrativeRouter from "./narrative";
import platformsRouter from "./platforms";
import contentStrategyRouter from "./contentStrategy";
import postsRouter from "./posts";
import ideasRouter from "./ideas";
import dashboardRouter from "./dashboard";
import onboardingRouter from "./onboarding";
import adminRouter from "./admin";
import assistantRouter from "./assistant";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(healthRouter);

router.use(requireAuth);
router.use(clientRouter);
router.use(auditRouter);
router.use(narrativeRouter);
router.use(platformsRouter);
router.use(contentStrategyRouter);
router.use(postsRouter);
router.use(ideasRouter);
router.use(dashboardRouter);
router.use(onboardingRouter);
router.use(adminRouter);
router.use(assistantRouter);

export default router;
