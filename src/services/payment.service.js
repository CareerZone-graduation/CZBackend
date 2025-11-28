import CryptoJS from 'crypto-js';
import moment from 'moment';
import axios from 'axios';
import config from '../config/index.js';
import CoinRecharge from '../models/CoinRecharge.js';
import User from '../models/User.js';
import { BadRequestError } from '../utils/AppError.js';
import logger from '../utils/logger.js';
import { recordCreditTransaction } from './creditHistory.service.js';
import { TRANSACTION_TYPES, TRANSACTION_CATEGORIES } from '../constants/index.js';

const { zalopay, momo } = config;
const COIN_CONVERSION_RATE = 100; // 1 coin = 100 VND
import * as momoService from './momo.service.js';
import mongoose from 'mongoose';


export const createZaloPayOrder = async (userId, coins) => {
    const amountVND = coins * COIN_CONVERSION_RATE;
    const orderTime = Date.now();
    const appTransId = `${moment(orderTime).format('YYMMDD')}_${orderTime}`;

    // Create a record using the original model structure
    const newRecharge = await CoinRecharge.create({
        userId,
        coinAmount: coins,
        amountPaid: amountVND,
        paymentMethod: 'ZALOPAY',
        transactionCode: appTransId,
        status: 'PENDING',
    });
    // lấy ra role từ userId
    const role= await User.findById(userId).select('role');
    const embed_data = JSON.stringify({
        redirecturl: zalopay.redirect_url,
    });

    const item = JSON.stringify([
        { itemid: 'coin', itemname: `Nạp ${coins} xu`, itemprice: amountVND, itemquantity: 1 },
    ]);

    const orderRequestData = {
        app_id: zalopay.app_id,
        app_trans_id: appTransId,
        app_user: userId.toString(),
        app_time: orderTime.toString(),
        amount: amountVND,
        item,
        description: `[CareerZone] Nạp ${coins} xu (trị giá ${amountVND} VNĐ)`,
        embed_data,
        bank_code: '',
    };

    const dataToMac = `${orderRequestData.app_id}|${orderRequestData.app_trans_id}|${orderRequestData.app_user}|${orderRequestData.amount}|${orderRequestData.app_time}|${orderRequestData.embed_data}|${orderRequestData.item}`;
    orderRequestData.mac = CryptoJS.HmacSHA256(dataToMac, zalopay.key1).toString();

    try {
        // === BẮT ĐẦU SỬA ===

        // 1. Chuyển đổi object thành chuỗi 'application/x-www-form-urlencoded'
        const formBody = new URLSearchParams();
        for (const key in orderRequestData) {
            formBody.append(key, orderRequestData[key]);
        }

        // 2. Gửi 'formBody' trong tham số THỨ HAI (data), không phải tham số thứ ba (config)
        const { data: zaloPayResponse } = await axios.post(
            zalopay.create_order_url,
            formBody, // Gửi data trong body
            {
                headers: {
                    // 3. Đặt Content-Type rõ ràng (mặc dù URLSearchParams thường tự làm điều này)
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            }
        );
        
        // === KẾT THÚC SỬA ===
        console.log("zaloPayResponse",orderRequestData,zaloPayResponse);
        if (zaloPayResponse.return_code !== 1) {
            logger.error('ZaloPay order creation failed:', zaloPayResponse);
            await CoinRecharge.findByIdAndUpdate(newRecharge._id, {
                status: 'FAILED',
                metadata: JSON.stringify(zaloPayResponse),
            });
            throw new BadRequestError(`Lỗi từ ZaloPay: ${zaloPayResponse.return_message}`);
        }

        // Update the record with gateway-specific tokens
        await CoinRecharge.findByIdAndUpdate(newRecharge._id, {
            metadata: JSON.stringify(zaloPayResponse),
        });

        return zaloPayResponse;
    } catch (error) {
        logger.error('Error creating ZaloPay order:', error);
        // Rollback the pending transaction if ZaloPay request fails
        await CoinRecharge.findByIdAndUpdate(newRecharge._id, { status: 'FAILED' });
        if (error instanceof BadRequestError) {
            throw error;
        }
        throw new BadRequestError('Không thể tạo đơn hàng ZaloPay do lỗi hệ thống.');
    }
};

export const createMomoOrder = async (userId, coins) => {
    const amountVND = coins * COIN_CONVERSION_RATE;
    const orderId = new mongoose.Types.ObjectId().toString();

    const newRecharge = await CoinRecharge.create({
        userId,
        coinAmount: coins,
        amountPaid: amountVND,
        paymentMethod: 'MOMO',
        transactionCode: orderId,
        status: 'PENDING',
    });

    try {
        const orderInfo = {
            amount: amountVND,
            orderId: orderId,
            orderDescription: `[CareerZone] Nap ${coins} xu`,
        };

        const momoResponse = await momoService.createMomoPayment(orderInfo);

        await CoinRecharge.findByIdAndUpdate(newRecharge._id, {
            metadata: JSON.stringify(momoResponse),
        });

        return momoResponse;
    } catch (error) {
        logger.error('Error creating MoMo order:', error);
        await CoinRecharge.findByIdAndUpdate(newRecharge._id, { status: 'FAILED' });
        if (error instanceof BadRequestError) {
            throw error;
        }
        throw new BadRequestError('Không thể tạo đơn hàng MoMo do lỗi hệ thống.');
    }
};

export const handleMomoCallback = async (callbackData) => {
    const { orderId, resultCode } = callbackData;

    const recharge = await CoinRecharge.findOne({ transactionCode: orderId });
    if (!recharge) {
        logger.error(`MoMo callback: CoinRecharge record not found for orderId: ${orderId}`);
        throw new BadRequestError('Không tìm thấy giao dịch nạp xu.');
    }

    if (recharge.status !== 'PENDING') {
        logger.warn(`MoMo callback: Order ${orderId} is not in PENDING state. Current state: ${recharge.status}. Ignoring callback.`);
    }

    if (resultCode === '0') {
        recharge.status = 'SUCCESS';
        recharge.metadata = JSON.stringify(callbackData);
        await recharge.save();

        await User.findByIdAndUpdate(recharge.userId, {
            $inc: { coinBalance: recharge.coinAmount },
        });

        try {
            await recordCreditTransaction({
                userId: recharge.userId,
                type: TRANSACTION_TYPES.DEPOSIT,
                category: TRANSACTION_CATEGORIES.RECHARGE,
                amount: recharge.coinAmount,
                description: `Nạp ${recharge.coinAmount} xu qua ${recharge.paymentMethod}`,
                referenceId: recharge._id,
                referenceModel: 'CoinRecharge',
                metadata: {
                    paymentMethod: recharge.paymentMethod,
                    amountPaid: recharge.amountPaid,
                    transactionCode: recharge.transactionCode
                }
            });
            logger.info(`Credit transaction recorded for user ${recharge.userId}, amount: ${recharge.coinAmount}`);
        } catch (transactionError) {
            logger.error('Failed to record credit transaction for MoMo payment:', {
                userId: recharge.userId,
                rechargeId: recharge._id,
                error: transactionError.message,
            });
        }
    } else {
        recharge.status = 'FAILED';
        recharge.metadata = JSON.stringify(callbackData);
        await recharge.save();
    }
    const role= await User.findById(recharge.userId).select('role');
    return {role: role}
};


//  tạm thời lấy redirect Url làm callback luôn
export const handleZaloPayCallback = async (apptransid, status) => {
    let recharge;
    if (status === '1') {
        // Handle success case
        logger.info(`ZaloPay callback: Transaction ${apptransid} completed successfully.`);
        recharge = await CoinRecharge.findOneAndUpdate({ transactionCode: apptransid }, { status: 'SUCCESS' });
        
        // cộng xu cho user
        await User.findByIdAndUpdate(recharge.userId, {
            $inc: { coinBalance: recharge.coinAmount },
        });

        // Record credit transaction (non-blocking)
        try {
            await recordCreditTransaction({
                userId: recharge.userId,
                type: TRANSACTION_TYPES.DEPOSIT,
                category: TRANSACTION_CATEGORIES.RECHARGE,
                amount: recharge.coinAmount,
                description: `Nạp ${recharge.coinAmount} xu qua ${recharge.paymentMethod}`,
                referenceId: recharge._id,
                referenceModel: 'CoinRecharge',
                metadata: {
                    paymentMethod: recharge.paymentMethod,
                    amountPaid: recharge.amountPaid,
                    transactionCode: recharge.transactionCode
                }
            });
            logger.info(`Credit transaction recorded for user ${recharge.userId}, amount: ${recharge.coinAmount}`);
        } catch (transactionError) {
            // Log error but don't block payment completion
            logger.error('Failed to record credit transaction:', {
                userId: recharge.userId,
                rechargeId: recharge._id,
                error: transactionError.message,
                stack: transactionError.stack
            });
        }
    } else {
        // Handle failure case
        logger.warn(`ZaloPay callback: Transaction ${apptransid} failed with status ${status}.`);
        recharge = await CoinRecharge.findOneAndUpdate({ transactionCode: apptransid }, { status: 'FAILED' });
    }
    const role= await User.findById(recharge.userId).select('role');
    return {role: role}
};
