import express from 'express';
import passport from 'passport';
import * as paymentController from '../controllers/payment.controller.js';
import * as validationMiddleware from '../middleware/validation.middleware.js';
import * as paymentSchema from '../schemas/payment.schema.js';

const router = express.Router();

// Create a new payment order (unified for all methods)
router.post(
    '/create-order',
    passport.authenticate('jwt', { session: false }),
    validationMiddleware.validateBody(paymentSchema.createOrderSchema),
    paymentController.createPaymentOrder
);


router.get(
    '/momo-redirect',
    paymentController.handleMomoRedirect
);


router.get(
    '/zalopay-redirect',
    paymentController.handleZaloPayRedirect
);

// VNPay routes
router.get('/vnpay-redirect', paymentController.handleVNPayReturn); // User redirect back

export default router;
