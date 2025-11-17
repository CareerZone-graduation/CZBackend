import crypto from "crypto";
import https from "https";
import config from "../config/index.js"; 

// Hàm tạo chữ ký HmacSHA256 (Giữ nguyên)
const createSignature = (rawSignature, secretKey) => {
  return crypto
    .createHmac("sha256", secretKey)
    .update(rawSignature)
    .digest("hex");
};

/**
 * Tạo yêu cầu thanh toán MoMo bằng https module
 * @param {object} orderInfo - Thông tin đơn hàng (amount, orderId, orderDescription)
 * @returns {Promise<object>} Chứa payUrl và các dữ liệu khác từ MoMo
 */
export const createMomoPayment = (orderInfo) => {
  return new Promise((resolve, reject) => {
    const { amount, orderId, orderDescription } = orderInfo;
    const partnerCode =  config.momo.partnerCode;
    const accessKey = config.momo.accessKey;
    const secretKey =
      config.momo.secretKey;
    const requestId = orderId;
    const orderInfoString =
      orderDescription || `Thanh toan don hang ${orderId}`;
    const redirectUrl = config.momo.redirectUrl;
    const ipnUrl = config.momo.ipnUrl;
    const requestType = "captureWallet"; // [Block 2]
    const extraData = "";
    var rawSignature =
      "accessKey=" +
      accessKey +
      "&amount=" +
      amount +
      "&extraData=" +
      extraData +
      "&ipnUrl=" +
      ipnUrl +
      "&orderId=" +
      orderId +
      "&orderInfo=" +
      orderInfoString +
      "&partnerCode=" +
      partnerCode +
      "&redirectUrl=" +
      redirectUrl +
      "&requestId=" +
      requestId +
      "&requestType=" +
      requestType;
    const signature = createSignature(rawSignature, secretKey);

    const requestBody = JSON.stringify({
      partnerCode,
      partnerName: "Test",
      storeId: "MomoTestStore",
      requestId,
      amount: amount.toString(),
      orderId,
      orderInfo: orderInfoString,
      redirectUrl,
      ipnUrl,
      lang: "vi",
      requestType,
      autoCapture: "true",
      extraData,
      orderGroupId: "",
      signature,
    });

    const options = {
      hostname: "test-payment.momo.vn", // [Block 2]
      port: 443,
      path: "/v2/gateway/api/create",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(requestBody),
      },
    };

    // Phần https.request giữ nguyên...
    const req = https.request(options, (res) => {
      console.log(`Status: ${res.statusCode}`);
      console.log(`Headers: ${JSON.stringify(res.headers)}`);
      res.setEncoding("utf8");
      let responseBody = "";

      res.on("data", (chunk) => {
        responseBody += chunk;
      });

      res.on("end", () => {
        try {
          console.log("Body: ", responseBody);
          const parsedBody = JSON.parse(responseBody);
          console.log("resultCode: ", parsedBody.resultCode);

          if (parsedBody.resultCode === 0) {
            resolve(parsedBody.payUrl);
          } else {
            reject(
              new Error(`MoMo Error: ${parsedBody.message || "Unknown error"}`)
            );
          }
        } catch (error) {
          reject(new Error("Failed to parse MoMo response"));
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.write(requestBody);
    req.end();
  });
};

