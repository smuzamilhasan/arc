import { Router, type IRouter } from "express";
import healthRouter from "./health";
import brandRouter from "./brand";
import postsRouter from "./posts";
import ideasRouter from "./ideas";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(brandRouter);
router.use(postsRouter);
router.use(ideasRouter);
router.use(dashboardRouter);

export default router;
