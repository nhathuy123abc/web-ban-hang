# E‑Shop — Buyer bundle

This package contains only the **Buyer**-facing pages, keeping your current logic intact.

## Files
- `index.html` — Trang chủ người mua (danh mục, sản phẩm, lọc)
- `product.html` — Trang chi tiết sản phẩm
- `wishlist.html` — Danh sách yêu thích (có nút thêm vào giỏ)
- `cart.html` — Giỏ hàng (đã dùng khóa user_id + product_id)
- `orders.html` — Đơn hàng của tôi
- `shop.html` — Trang cửa hàng
- `buyer.js` — Supabase client + helper
- `components.js` — Header/Footer/Toast
- `assets/favicon.png`, `assets/placeholder_400x300.png` — ảnh mẫu

## Hướng dẫn nhanh
1. Đặt nguyên thư mục **E-Shop-Buyer** lên hosting tĩnh (Live Server, Nginx, Vercel).
2. Mở `index.html`. Các trang còn lại sẽ được liên kết tự động.
3. Giữ nguyên Supabase URL/KEY như hiện tại.

> Lưu ý: Nếu RLS bật, cần policy SELECT/INSERT/UPDATE/DELETE phù hợp cho
> `cart_items`, `wishlists`, `orders`, `order_details`, `payments` theo môi trường DEV/PROD.