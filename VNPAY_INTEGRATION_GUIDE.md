# 📋 HƯỚNG DẪN TÍCH HỢP & TEST VNPAY

## ✅ ĐÃ HOÀN TẤT

- ✏️ Update `server.js` với API endpoints VNPay
- ✏️ Update `.env` với credentials
- ✏️ Update `checkout_vnpay.html` để gọi backend thực
- ✏️ Tạo trang `payment-result.html` để hiển thị kết quả

---

## 🚀 CÁC BƯỚC CHẠY DỰ ÁN

### Bước 1: Cài đặt dependencies
```bash
cd "c:\Users\ADMIN\Desktop\Đồ án chuyên ngành"
npm install
```

### Bước 2: Kiểm tra .env
File `.env` đã được cập nhật với:
```env
VNPAY_TMN_CODE=OH79R4GU
VNPAY_SECRET=M5M97VRWI7MA4ZVSAJ6FAIKBABXKNKBY
VNPAY_HOST=https://sandbox.vnpayment.vn
VNPAY_TEST_MODE=true
APP_URL=http://localhost:3000
FRONTEND_URL=http://localhost:5500
SUPABASE_URL=https://qpnqsvueowqtqnzqdyqh.supabase.co
SUPABASE_KEY=...
PORT=3000
```

### Bước 3: Chạy server
```bash
npm start
```
Server sẽ chạy trên `http://localhost:3000`

### Bước 4: Mở frontend
Dùng Live Server hoặc http-server để chạy HTML files (port 5500)

---

## 🧪 TEST FLOW THANH TOÁN

### **Phương pháp 1: Test trực tiếp từ Frontend**

1. Đăng nhập vào trang buyer
2. Thêm sản phẩm vào giỏ hàng
3. Nhấn "Thanh toán VNPay"
4. Sẽ bị redirect tới VNPay Sandbox
5. Thanh toán xong → Redirect về `payment-result.html` với status

### **Phương pháp 2: Test bằng Postman**

#### Request 1: Tạo link thanh toán
```
POST http://localhost:3000/api/create-qr
Content-Type: application/json

{
  "amount": 500000,
  "orderId": 1,
  "userId": 1,
  "orderInfo": "Order #1"
}
```

**Response** (thành công):
```json
{
  "checkoutUrl": "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?...",
  "paymentUrl": "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?..."
}
```

Copy URL và dán vào trình duyệt để test thanh toán.

#### Request 2: Kiểm tra tình trạng payment
```
GET http://localhost:3000/api/check-payment-vnpay
```

Backend sẽ tự động handle callback từ VNPay.

---

## 📊 LUỒNG THANH TOÁN CHI TIẾT

```
┌─────────────────────────────────────┐
│ 1. User click "Thanh toán VNPay"   │
└──────────────┬──────────────────────┘
               │
        ┌──────▼──────┐
        │ Tạo Orders  │ (status: pending)
        │ Tạo Details │
        │ Xóa cart    │
        └──────┬──────┘
               │
        ┌──────▼──────────────────────────┐
        │ POST /api/create-qr             │
        │ {amount, orderId, userId, info} │
        └──────┬──────────────────────────┘
               │
        ┌──────▼─────────────────────────────┐
        │ Backend verify .env credentials    │
        │ VNPay.buildPaymentUrl()           │
        │ Lưu payment (status: pending)     │
        └──────┬─────────────────────────────┘
               │
        ┌──────▼──────────────────────┐
        │ Return checkoutUrl to FE   │
        └──────┬──────────────────────┘
               │
        ┌──────▼──────────────────────────┐
        │ 2. Redirect to VNPay Sandbox    │
        │    User thanh toán tại đây      │
        └──────┬──────────────────────────┘
               │
        ┌──────▼──────────────────────────────────────┐
        │ 3. VNPay callback /api/check-payment-vnpay │
        │    GET ?vnp_ResponseCode=00&vnp_TxnRef=1  │
        └──────┬──────────────────────────────────────┘
               │
        ┌──────▼────────────────────────────────┐
        │ Backend verify signature VNPay        │
        │ Update payments (status: completed)   │
        │ Update orders (status: confirmed)     │
        └──────┬────────────────────────────────┘
               │
        ┌──────▼───────────────────────────────┐
        │ Redirect /payment-result.html        │
        │ ?status=success&orderId=1            │
        └──────┬───────────────────────────────┘
               │
        ┌──────▼──────────────────────────┐
        │ 4. Show success page            │
        │    User có thể xem đơn hàng     │
        └──────────────────────────────────┘
```

---

## 🔐 BẢNG SỰ KIỆN CẬP NHẬT DB

| Bước | Bảng | Hành động | Status |
|------|------|----------|--------|
| 1 | orders | INSERT | pending |
| 1 | order_details | INSERT | - |
| 1 | cart_items | DELETE | - |
| 2 | payments | INSERT | pending |
| 3 | payments | UPDATE | completed/failed |
| 3 | orders | UPDATE | confirmed/cancelled |

---

## 🐛 CÁC VẤN ĐỀ THƯỜNG GẶP

### ❌ Lỗi "Thiếu thông tin: amount, orderId, userId"
- **Nguyên nhân**: Request body không đúng
- **Giải pháp**: Kiểm tra trong POST body có `amount`, `orderId`, `userId`

### ❌ Lỗi "Verify fail"
- **Nguyên nhân**: VNPay secret key sai hoặc signature không match
- **Giải pháp**: Kiểm tra `.env` VNPAY_SECRET đúng

### ❌ Redirect về payment-result.html nhưng không thấy status
- **Nguyên nhân**: URL params không được truyền đúng
- **Giải pháp**: Kiểm tra trong `server.js` redirectUrl có đúng format

### ❌ "Lỗi tạo đơn hàng"
- **Nguyên nhân**: Bảng orders, order_details, payment không tồn tại trong DB
- **Giải pháp**: Chạy SQL script từ `database .txt`

---

## 📝 TESTING CHECKLIST

- [ ] Server chạy trên port 3000
- [ ] Frontend chạy trên port 5500
- [ ] .env có đầy đủ credentials
- [ ] DB Supabase có bảng orders, payments, order_details
- [ ] Test POST /api/create-qr bằng Postman
- [ ] Test thanh toán thành công từ VNPay Sandbox
- [ ] DB tự động cập nhật sau thanh toán
- [ ] Redirect tới payment-result.html chính xác
- [ ] Xem được đơn hàng từ orders.html

---

## 🔄 PRODUCTION DEPLOYMENT

Khi deploy lên production:

1. **Cập nhật .env**:
   ```env
   VNPAY_TEST_MODE=false
   VNPAY_HOST=https://api.vnpay.vn
   FRONTEND_URL=https://yourdomain.com
   APP_URL=https://api.yourdomain.com
   ```

2. **Kiếm VNPAY_TMN_CODE & VNPAY_SECRET từ VNPay merchant portal**

3. **Test lại từ đầu trên production credentials**

---

## 📞 SUPPORT

Nếu gặp vấn đề:
1. Kiểm tra console backend (npm start)
2. Kiểm tra Network tab trong DevTools
3. Kiểm tra DB Supabase trong RLS policy
4. Xem logs từ VNPay
