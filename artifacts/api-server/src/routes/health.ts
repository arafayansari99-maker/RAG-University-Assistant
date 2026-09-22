import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getGroqStatus } from "../lib/groq";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json({ ...data, groq: await getGroqStatus() });
});

export default router;
