import express from 'express';
import passport from 'passport';
import * as paymentController from '../controllers/payment.controller.js';
import * as authMiddleware from '../middleware/auth.middleware.js';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as paymentSchema from '../schemas/payment.schema.js';

const router = express.Router();

// Create a new payment order
router.post(
    '/create-order',
    passport.authenticate('jwt', { session: false }),
    validationMiddleware.validateBody(paymentSchema.createOrderSchema),
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
