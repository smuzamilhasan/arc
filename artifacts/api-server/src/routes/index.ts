import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clientRouter from "./client";
import auditRouter from "./audit";
import dossierRouter from "./dossier";
import narrativeRouter from "./narrative";
import portraitRouter from "./portrait";
import platformsRouter from "./platforms";
import industryOverviewRouter from "./industryOverview";
import contentStrategyRouter from "./contentStrategy";
import postsRouter from "./posts";
import ideasRouter from "./ideas";
import dashboardRouter from "./dashboard";
import onboardingRouter from "./onboarding";
import adminRouter from "./admin";
import assistantRouter from "./assistant";
import plannerRouter from "./planner";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(healthRouter);

router.use(requireAuth);
router.use(clientRouter);
router.use(auditRouter);
router.use(dossierRouter);
router.use(narrativeRouter);
router.use(portraitRouter);
router.use(platformsRouter);
router.use(industryOverviewRouter);
router.use(contentStrategyRouter);
router.use(postsRouter);
router.use(ideasRouter);
router.use(dashboardRouter);
router.use(onboardingRouter);
router.use(adminRouter);
router.use(assistantRouter);
router.use(plannerRouter);

export default router;
