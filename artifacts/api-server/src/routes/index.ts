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
import connectionsRouter from "./connections";
import ideasRouter from "./ideas";
import dashboardRouter from "./dashboard";
import onboardingRouter from "./onboarding";
import adminRouter from "./admin";
import assistantRouter from "./assistant";
import plannerRouter from "./planner";
import plannerChatRouter from "./plannerChat";
import managerRouter from "./manager";
import marketingRouter from "./marketing";
import marketingPublicRouter from "./marketingPublic";
import waitlistRouter from "./waitlist";
import v2Router from "./v2";
import { requireAuth } from "../middlewares/requireAuth";
import { attachActiveClient } from "../middlewares/activeClient";
import agencyRouter from "./agency";

const router: IRouter = Router();

router.use(healthRouter);

// Public Marketing OS intake (shared-secret webhook + IP rate-limited form)
// must be mounted BEFORE requireAuth so external sources can post leads.
router.use(marketingPublicRouter);

// Public "Get early access" waitlist intake from the marketing landing.
router.use(waitlistRouter);

router.use(requireAuth);
router.use(agencyRouter);
router.use(attachActiveClient);
router.use(clientRouter);
router.use(auditRouter);
router.use(dossierRouter);
router.use(narrativeRouter);
router.use(portraitRouter);
router.use(platformsRouter);
router.use(industryOverviewRouter);
router.use(contentStrategyRouter);
router.use(postsRouter);
router.use(connectionsRouter);
router.use(ideasRouter);
router.use(dashboardRouter);
router.use(onboardingRouter);
router.use(adminRouter);
router.use(assistantRouter);
router.use(plannerRouter);
router.use(plannerChatRouter);
router.use(managerRouter);
router.use(marketingRouter);

// v2 routes (foundation: voice-extractor trigger). Behind requireAuth +
// activeClient by virtue of mount order above.
router.use(v2Router);

export default router;
