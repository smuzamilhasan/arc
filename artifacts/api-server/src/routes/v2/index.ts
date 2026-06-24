// v2 routes — all gated behind requireAuth + activeClient by the parent router.

import { Router, type IRouter } from "express";
import voiceExtractorRouter from "./voiceExtractor";
import onboarderRouter from "./onboarder";

const v2Router: IRouter = Router();

v2Router.use(voiceExtractorRouter);
v2Router.use(onboarderRouter);

export default v2Router;
