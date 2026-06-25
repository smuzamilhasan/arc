// v2 routes — all gated behind requireAuth + activeClient by the parent router.

import { Router, type IRouter } from "express";
import voiceExtractorRouter from "./voiceExtractor";
import onboarderRouter from "./onboarder";
import ghostwriterRouter from "./ghostwriter";
import calibrationRouter from "./calibration";
import profileRouter from "./profile";

const v2Router: IRouter = Router();

v2Router.use(voiceExtractorRouter);
v2Router.use(onboarderRouter);
v2Router.use(ghostwriterRouter);
v2Router.use(calibrationRouter);
v2Router.use(profileRouter);

export default v2Router;
