import { Router, type IRouter } from "express";
import healthRouter from "./health";
import clientRouter from "./client";
import auditRouter from "./audit";
import narrativeRouter from "./narrative";
import postsRouter from "./posts";
import ideasRouter from "./ideas";
import dashboardRouter from "./dashboard";
import onboardingRouter from "./onboarding";

const router: IRouter = Router();

router.use(healthRouter);
router.use(clientRouter);
router.use(auditRouter);
router.use(narrativeRouter);
router.use(postsRouter);
router.use(ideasRouter);
router.use(dashboardRouter);
router.use(onboardingRouter);

export default router;
