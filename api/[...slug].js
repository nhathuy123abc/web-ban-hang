require('dotenv').config();
const { VNPay, ignoreLogger, ProductCode, VnpLocale, dateFormat } = require('vnpay');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

function getFrontendUrl(req) {
  const envUrl = process.env.FRONTEND_URL;
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

function jsonResponse(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

module.exports = async (req, res) => {
  const slug = req.query.slug;
  const routeParts = Array.isArray(slug) ? slug : slug ? [slug] : [];
  const route = routeParts[0] || '';
  const param = routeParts[1];
  const method = req.method;

  try {
    if (route === 'create-qr' && method === 'POST') {
      const { amount, orderId, userId, orderInfo } = req.body || {};
      if (!amount || !orderId || !userId) {
        return jsonResponse(res, 400, { error: 'Thiếu thông tin: amount, orderId, userId' });
      }

      const vnpay = new VNPay({
        tmnCode: process.env.VNPAY_TMN_CODE,
        secureSecret: process.env.VNPAY_SECRET,
        vnpHost: process.env.VNPAY_HOST,
        testMode: process.env.VNPAY_TEST_MODE === 'true',
        hashAlgorithm: 'SHA512',
        loggerFn: ignoreLogger,
      });

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const frontendUrl = getFrontendUrl(req);

      const vnpayResponse = await vnpay.buildPaymentUrl({
        vnp_Amount: Math.round(Number(amount)),
        vnp_IpAddr: getClientIp(req),
        vnp_TxnRef: orderId.toString(),
        vnp_OrderInfo: orderInfo || `Order #${orderId}`,
        vnp_OrderType: ProductCode.Other,
        vnp_ReturnUrl: `${frontendUrl}/payment-result.html`,
        vnp_Locale: VnpLocale.VN,
        vnp_CreateDate: dateFormat(new Date()),
        vnp_ExpireDate: dateFormat(tomorrow),
      });

      console.log('VNPay Response:', JSON.stringify(vnpayResponse, null, 2));

      const { error: dbError } = await supabase.from('payments').insert([{
        order_id: orderId,
        amount,
        method: 'VNPay',
        status: 'pending',
        transaction_code: orderId.toString(),
        created_at: new Date().toISOString(),
      }]);

      if (dbError) {
        console.error('DB Error:', dbError);
        return jsonResponse(res, 500, { error: 'Lỗi lưu thông tin thanh toán' });
      }

      return jsonResponse(res, 200, { paymentUrl: vnpayResponse });
    }

    if (route === 'check-payment-status' && method === 'GET') {
      const target = req.query.orderId || param;
      if (!target) {
        return jsonResponse(res, 400, { error: 'Thiếu orderId' });
      }

      const { data: payment, error } = await supabase
        .from('payments')
        .select('*')
        .eq('order_id', target)
        .single();

      if (error || !payment) {
        return jsonResponse(res, 404, { error: 'Payment not found' });
      }

      return jsonResponse(res, 200, {
        order_id: target,
        status: payment.status,
        amount: payment.amount,
        method: payment.method,
        transaction_code: payment.transaction_code,
      });
    }

    if (route === 'mark-payment-completed' && method === 'POST') {
      const orderId = param;
      if (!orderId) {
        return jsonResponse(res, 400, { error: 'Thiếu orderId' });
      }

      const { error: payError } = await supabase
        .from('payments')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('order_id', orderId);

      if (payError) {
        console.error('Error updating payment:', payError);
        return jsonResponse(res, 500, { error: 'Lỗi cập nhật payment' });
      }

      const { error: ordError } = await supabase
        .from('orders')
        .update({ order_status: 'confirmed', updated_at: new Date().toISOString() })
        .eq('order_id', orderId);

      if (ordError) {
        console.error('Error updating order:', ordError);
      }

      return jsonResponse(res, 200, { success: true, message: 'Payment marked as completed' });
    }

    if (route === 'check-payment-vnpay' && method === 'GET') {
      const vnpay = new VNPay({
        tmnCode: process.env.VNPAY_TMN_CODE,
        secureSecret: process.env.VNPAY_SECRET,
        vnpHost: process.env.VNPAY_HOST,
        testMode: process.env.VNPAY_TEST_MODE === 'true',
        hashAlgorithm: 'SHA512',
        loggerFn: ignoreLogger,
      });

      const verify = await vnpay.verifyReturnUrl(req.query);
      if (!verify.isSuccess) {
        return res.writeHead(302, { Location: `${getFrontendUrl(req)}/checkout_vnpay.html?status=failed&message=Verify+fail` }).end();
      }

      const orderId = req.query.vnp_TxnRef;
      const responseCode = req.query.vnp_ResponseCode;
      const transactionCode = req.query.vnp_TransactionNo;
      const paymentStatus = responseCode === '00' ? 'completed' : 'failed';
      const orderStatus = responseCode === '00' ? 'confirmed' : 'cancelled';

      const { error: payError } = await supabase
        .from('payments')
        .update({ status: paymentStatus, transaction_code: transactionCode, updated_at: new Date().toISOString() })
        .eq('order_id', orderId);

      if (payError) {
        console.error('Error updating payment:', payError);
        return res.writeHead(302, { Location: `${getFrontendUrl(req)}/checkout_vnpay.html?status=error&message=Database+error` }).end();
      }

      if (responseCode === '00') {
        const { error: ordError } = await supabase
          .from('orders')
          .update({ order_status: orderStatus, updated_at: new Date().toISOString() })
          .eq('order_id', orderId);

        if (ordError) {
          console.error('Error updating order:', ordError);
        }
      }

      const redirectUrl = `${getFrontendUrl(req)}/payment-result.html?status=${responseCode === '00' ? 'success' : 'failed'}&orderId=${orderId}`;
      return res.writeHead(302, { Location: redirectUrl }).end();
    }

    if (route === 'verify-return' && method === 'POST') {
      const params = req.body || {};
      const vnpay = new VNPay({
        tmnCode: process.env.VNPAY_TMN_CODE,
        secureSecret: process.env.VNPAY_SECRET,
        vnpHost: process.env.VNPAY_HOST,
        testMode: process.env.VNPAY_TEST_MODE === 'true',
        hashAlgorithm: 'SHA512',
        loggerFn: ignoreLogger,
      });

      const verify = await vnpay.verifyReturnUrl(params);
      console.log('✅ VNPay Verify Result:', JSON.stringify(verify, null, 2));
      if (!verify.isSuccess) {
        return jsonResponse(res, 400, { success: false, message: 'Verify failed', verify });
      }

      const orderId = params.vnp_TxnRef;
      const responseCode = params.vnp_ResponseCode;
      const transactionCode = params.vnp_TransactionNo || null;
      const paymentStatus = responseCode === '00' ? 'completed' : 'failed';
      const orderStatus = responseCode === '00' ? 'confirmed' : 'cancelled';

      const { error: payError } = await supabase
        .from('payments')
        .update({ status: paymentStatus, transaction_code: transactionCode, updated_at: new Date().toISOString() })
        .eq('order_id', orderId);

      if (payError) {
        console.error('❌ Error updating payment table:', JSON.stringify(payError, null, 2));
        return jsonResponse(res, 500, { success: false, message: 'DB update payment error', error: payError });
      }

      if (responseCode === '00') {
        const { error: ordError } = await supabase
          .from('orders')
          .update({ order_status: orderStatus, updated_at: new Date().toISOString() })
          .eq('order_id', orderId);

        if (ordError) {
          console.error('❌ Error updating orders table:', JSON.stringify(ordError, null, 2));
        }
      }

      return jsonResponse(res, 200, { success: true, orderId, status: paymentStatus, message: 'Payment verified and DB updated' });
    }

    return jsonResponse(res, 404, { error: 'Endpoint not found' });
  } catch (error) {
    console.error('API error:', error);
    return jsonResponse(res, 500, { error: error.message });
  }
};
