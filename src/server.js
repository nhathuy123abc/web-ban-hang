
const express = require('express')
const app = express()
const port = 3000
require('dotenv').config();

const { VNPay, ignoreLogger, ProductCode, VnpLocale, dateFormat } = require('vnpay');
const { createClient } = require('@supabase/supabase-js');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ============================================
// Endpoint: Tạo link thanh toán VNPay
// ============================================
app.post('/api/create-qr', async (req, res) => {
  try {
    const { amount, orderId, userId, orderInfo } = req.body;

    if (!amount || !orderId || !userId) {
      return res.status(400).json({ error: 'Thiếu thông tin: amount, orderId, userId' });
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

    const vnpayResponse = await vnpay.buildPaymentUrl({
      vnp_Amount: Math.round(Number(amount)),
      vnp_IpAddr: req.ip || '127.0.0.1',
      vnp_TxnRef: orderId.toString(),
      vnp_OrderInfo: orderInfo || `Order #${orderId}`,
      vnp_OrderType: ProductCode.Other,
      // Return URL should point to frontend so browser receives VNPay params
      vnp_ReturnUrl: `${process.env.FRONTEND_URL}/payment-result.html`,
      vnp_Locale: VnpLocale.VN,
      vnp_CreateDate: dateFormat(new Date()),
      vnp_ExpireDate: dateFormat(tomorrow),
    });

    console.log('VNPay Response:', JSON.stringify(vnpayResponse, null, 2));

    // Lưu payment vào DB với status: pending
    const { error: dbError } = await supabase.from('payments').insert([{
      order_id: orderId,
      amount: amount,
      method: 'VNPay',
      status: 'pending',
      transaction_code: orderId.toString(),
      created_at: new Date().toISOString(),
    }]);

    if (dbError) {
      console.error('DB Error:', dbError);
      return res.status(500).json({ error: 'Lỗi lưu thông tin thanh toán' });
    }

    // Return payment URL dưới dạng object để frontend xử lý
    return res.status(200).json({
      paymentUrl: vnpayResponse
    });
  } catch (error) {
    console.error('Error creating payment:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Endpoint: Kiểm tra trạng thái thanh toán
// ============================================
app.get('/api/check-payment-status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    // Kiểm tra payment status từ DB
    const { data: payment, error } = await supabase
      .from('payments')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (error || !payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.status(200).json({
      order_id: orderId,
      status: payment.status,
      amount: payment.amount,
      method: payment.method,
      transaction_code: payment.transaction_code
    });
  } catch (error) {
    console.error('Error checking payment status:', error);
    res.status(500).json({ error: error.message });
  }
});

  // ============================================
  // Endpoint: Mark payment as completed (simulate VNPay success)
  // ============================================
  app.post('/api/mark-payment-completed/:orderId', async (req, res) => {
    try {
      const { orderId } = req.params;

      // Update payment status
      const { error: payError } = await supabase
        .from('payments')
        .update({
          status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('order_id', orderId);

      if (payError) {
        console.error('Error updating payment:', payError);
        return res.status(500).json({ error: 'Lỗi cập nhật payment' });
      }

      // Update order status
      const { error: ordError } = await supabase
        .from('orders')
        .update({
          order_status: 'confirmed',
          updated_at: new Date().toISOString(),
        })
        .eq('order_id', orderId);

      if (ordError) {
        console.error('Error updating order:', ordError);
      }

      res.status(200).json({
        success: true,
        message: 'Payment marked as completed'
      });
    } catch (error) {
      console.error('Error marking payment:', error);
      res.status(500).json({ error: error.message });
    }
  });

// ============================================
// Endpoint: Callback từ VNPay (check payment result)
// ============================================
app.get('/api/check-payment-vnpay', async (req, res) => {
  try {
    console.log('VNPay Callback:', req.query);

    const vnpay = new VNPay({
      tmnCode: process.env.VNPAY_TMN_CODE,
      secureSecret: process.env.VNPAY_SECRET,
      vnpHost: process.env.VNPAY_HOST,
      testMode: process.env.VNPAY_TEST_MODE === 'true',
      hashAlgorithm: 'SHA512',
      loggerFn: ignoreLogger,
    });

    // Verify signature từ VNPay
    const verify = await vnpay.verifyReturnUrl(req.query);

    if (!verify.isSuccess) {
      console.log('Verify failed:', verify);
      return res.redirect(`${process.env.FRONTEND_URL}/checkout_vnpay.html?status=failed&message=Verify+fail`);
    }

    const orderId = req.query.vnp_TxnRef;
    const responseCode = req.query.vnp_ResponseCode;
    const transactionCode = req.query.vnp_TransactionNo;

    // Cập nhật payment status trong DB
    const paymentStatus = responseCode === '00' ? 'completed' : 'failed';
    const orderStatus = responseCode === '00' ? 'confirmed' : 'cancelled';

    // Update payments table
    const { error: payError } = await supabase
      .from('payments')
      .update({
        status: paymentStatus,
        transaction_code: transactionCode,
        updated_at: new Date().toISOString(),
      })
      .eq('order_id', orderId);

    if (payError) {
      console.error('Error updating payment:', payError);
      return res.redirect(`${process.env.FRONTEND_URL}/checkout_vnpay.html?status=error&message=Database+error`);
    }

    // Update orders table
    if (responseCode === '00') {
      const { error: ordError } = await supabase
        .from('orders')
        .update({
          order_status: 'confirmed',
          updated_at: new Date().toISOString(),
        })
        .eq('order_id', orderId);

      if (ordError) {
        console.error('Error updating order:', ordError);
      }
    }

    // Redirect back to frontend with status
    const redirectUrl = `${process.env.FRONTEND_URL}/payment-result.html?status=${responseCode === '00' ? 'success' : 'failed'}&orderId=${orderId}`;
    return res.redirect(redirectUrl);

  } catch (error) {
    console.error('Error in callback:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// Endpoint: Verify return params sent from frontend
// Frontend will POST VNPay query params to this endpoint after redirect
// This helps when VNPay cannot call server directly (localhost)
// ============================================
app.post('/api/verify-return', async (req, res) => {
  try {
    const params = req.body || {};
    console.log('Verify return params:', params);

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
      console.log('❌ Verify failed:', verify);
      return res.status(400).json({ success: false, message: 'Verify failed', verify });
    }

    const orderId = params.vnp_TxnRef;
    const responseCode = params.vnp_ResponseCode;
    const transactionCode = params.vnp_TransactionNo || null;

    console.log(`📋 Processing payment - OrderId: ${orderId}, ResponseCode: ${responseCode}, TxnNo: ${transactionCode}`);

    const paymentStatus = responseCode === '00' ? 'completed' : 'failed';
    const orderStatus = responseCode === '00' ? 'confirmed' : 'cancelled';

    // Update payments table
    const { error: payError } = await supabase
      .from('payments')
      .update({
        status: paymentStatus,
        transaction_code: transactionCode,
        updated_at: new Date().toISOString(),
      })
      .eq('order_id', orderId);

    if (payError) {
      console.error('❌ Error updating payment table:', JSON.stringify(payError, null, 2));
      return res.status(500).json({ success: false, message: 'DB update payment error', error: payError });
    }

    console.log(`✅ Payments table updated: status=${paymentStatus}, transaction_code=${transactionCode}`);

    // Update orders table when payment is successful
    if (responseCode === '00') {
      const { error: ordError } = await supabase
        .from('orders')
        .update({ order_status: orderStatus, updated_at: new Date().toISOString() })
        .eq('order_id', orderId);
      
      if (ordError) {
        console.error('❌ Error updating orders table:', JSON.stringify(ordError, null, 2));
      } else {
        console.log(`✅ Orders table updated: order_status=${orderStatus} for orderId=${orderId}`);
      }
    }

    return res.status(200).json({ success: true, orderId, status: paymentStatus, message: 'Payment verified and DB updated' });
  } catch (error) {
    console.error('Error verify-return:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// Health check endpoint
// ============================================
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
  console.log(`📝 VNPay Mode: ${process.env.VNPAY_TEST_MODE === 'true' ? 'SANDBOX' : 'PRODUCTION'}`);
});


