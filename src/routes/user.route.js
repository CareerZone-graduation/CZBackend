import express from 'express';
import passport from 'passport';
import * as userController from '../controllers/user.controller.js';
import { validate } from '../middleware/validation.middleware.js';
import { updateUserProfileSchema as updateUserSchema, getRechargeHistorySchema } from '../schemas/user.schema.js';

const router = express.Router();

const jwtAuth = passport.authenticate('jwt', { session: false });

router.route('/me')
  .get(jwtAuth, userController.getMe);

router.route('/change-password')
    .put(jwtAuth, userController.changePassword);

router.route('/me/coins')
    .get(jwtAuth, userController.getCoinBalance);
// router.route('/me/recharge-history')
//     .get(jwtAuth, validate({ query: getRechargeHistorySchema }), userController.getRechargeHistory);
router.route('/me/recharge-history')
    .get(jwtAuth, validate(getRechargeHistorySchema,"query"), userController.getRechargeHistory);

router.route('/register-device')
    .post(jwtAuth, userController.registerDevice);

export default router;
