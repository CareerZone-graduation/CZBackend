import CryptoJS from 'crypto-js';
import moment from 'moment';
import axios from 'axios';
import config from '../config/index.js';
import CoinRecharge from '../models/CoinRecharge.js';
import User from '../models/User.js';
import { BadRequestError } from '../utils/AppError.js';
import logger from '../utils/logger.js';

const { zalopay } = config;
const COIN_CONVERSION_RATE = 100; // 1 coin = 100 VND

/**
 * Create a ZaloPay order for recharging coins.
 * @param {string} userId - The ID of the user.
 * @param {number} coins - The number of coins to recharge.
 * @returns {Promise<object>} - The ZaloPay order response.
 */
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
        description: `[CareerZone] Nạp ${coins} xu (trị giá ${amountVND} VND)`,
        embed_data,
        bank_code: '',
    };

    const dataToMac = `${orderRequestData.app_id}|${orderRequestData.app_trans_id}|${orderRequestData.app_user}|${orderRequestData.amount}|${orderRequestData.app_time}|${orderRequestData.embed_data}|${orderRequestData.item}`;
    orderRequestData.mac = CryptoJS.HmacSHA256(dataToMac, zalopay.key1).toString();

    try {
        const { data: zaloPayResponse } = await axios.post(zalopay.create_order_url, null, {
            params: orderRequestData,
        });

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


//  tạm thời lấy redirect Url làm callback luôn
export const handleZaloPayCallback = async (apptransid, status) => {
    // const { data, mac } = callbackData;
    // const result = {};

    // try {
    //     const key2 = zalopay.key2;
    //     const calculatedMac = CryptoJS.HmacSHA256(data, key2).toString();

    //     if (calculatedMac !== mac) {
    //         logger.warn('ZaloPay callback: Invalid MAC');
    //         result.return_code = -1;
    //         result.return_message = 'mac not equal';
    //         return result;
    //     }

    //     const dataJSON = JSON.parse(data);
    //     const { app_trans_id, status } = dataJSON;

    //     const recharge = await CoinRecharge.findOne({ transactionCode: app_trans_id });

    //     if (!recharge) {
    //         logger.error(`ZaloPay callback: Recharge with transactionCode ${app_trans_id} not found.`);
    //         result.return_code = 1; // Acknowledge receipt even if not found
    //         result.return_message = 'Transaction not found';
    //         return result;
    //     }

    //     // If already processed, just acknowledge.
    //     if (recharge.status === 'SUCCESS' || recharge.status === 'FAILED') {
    //         logger.info(`ZaloPay callback: Transaction ${app_trans_id} already processed with status ${recharge.status}.`);
    //         result.return_code = 1;
    //         result.return_message = 'success';
    //         return result;
    //     }


    //     // status = 1 means success
    //     if (status === 1) {
    //         recharge.status = 'SUCCESS';
    //         await recharge.save();

    //         await User.findByIdAndUpdate(recharge.userId, {
    //             $inc: { coins: recharge.coinAmount },
    //         });

    //         logger.info(`User ${recharge.userId} successfully recharged ${recharge.coinAmount} coins via callback.`);
    //     } else {
    //         recharge.status = 'FAILED';
    //         await recharge.save();
    //         logger.warn(`Transaction ${app_trans_id} failed via callback with status from ZaloPay.`);
    //     }

    //     result.return_code = 1;
    //     result.return_message = 'success';
    //     return result;

    // } catch (error) {
    //     logger.error('ZaloPay callback processing error:', error);
    //     result.return_code = 0; // ZaloPay will retry if it receives 0
    //     result.return_message = 'error';
    //     return result;
    // }
    let recharge;
    if (status === '1') {
        // Handle success case
        logger.info(`ZaloPay callback: Transaction ${apptransid} completed successfully.`);
        recharge = await CoinRecharge.findOneAndUpdate({ transactionCode: apptransid }, { status: 'SUCCESS' });
        // cộng xu cho user
        await User.findByIdAndUpdate(recharge.userId, {
            $inc: { coinBalance: recharge.coinAmount },
        });
    } else {
        // Handle failure case
        logger.warn(`ZaloPay callback: Transaction ${apptransid} failed with status ${status}.`);
        recharge = await CoinRecharge.findOneAndUpdate({ transactionCode: apptransid }, { status: 'FAILED' });
    }
    const role= await User.findById(recharge.userId).select('role');
    return {role: role}
};
