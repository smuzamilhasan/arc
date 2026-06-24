// v2 routes — all gated behind requireAuth + activeClient by the parent router.

import { Router, type IRouter } from "express";
import voiceExtractorRouter from "./voiceExtractor";
import onboarderRouter from "./onboarder";
import ghostwriterRouter from "./ghostwriter";

const v2Router: IRouter = Router();

v2Router.use(voiceExtractorRouter);
v2Router.use(onboarderRouter);
v2Router.use(ghostwriterRouter);

export default v2Router;
