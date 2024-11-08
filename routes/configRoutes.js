import express from "express"
import { protect } from "../middleware/authMiddleware.js";
import { clearDB } from "../controllers/configController.js";

const router = express.Router();

router.delete('/clearData', protect, clearDB);

export default router;

