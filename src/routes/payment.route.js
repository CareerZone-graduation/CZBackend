import express from 'express';
import * as paymentController from '../controllers/payment.controller.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { validateBody } from '../middleware/validation.middleware.js';
import { createOrderSchema } from '../schemas/payment.schema.js';

const router = express.Router();

// Create a new payment order
router.post(
    '/create-order',
    authenticate,
    validateBody(createOrderSchema),
    paymentController.createPaymentOrder
);
// tạm thời chưa xài cái này
router.post(
    '/zalopay-callback',
    paymentController.handleZaloPayCallback
);

//// xài tạm cái này  Handle the insecure redirect from ZaloPay for development
router.get(
    '/result',
    paymentController.handleZaloPayRedirect
);

export default router;
