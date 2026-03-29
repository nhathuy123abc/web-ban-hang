// components.js - header/footer utilities
function renderHeader(active='home'){
  const nav = document.getElementById('nav-menu'); if(!nav) return;
  const user = window.me;
  const left = `<li class="nav-item"><a class="nav-link ${active==='home'?'active':''}" href="index.html">Trang chủ</a></li>`;
  let mid = '';
  if(user){
    if(user.role_id===1) mid += `<li class="nav-item"><a class="nav-link" href="admin_pro.html">Quản trị</a></li>`;
    if(user.role_id===2) mid += `<li class="nav-item"><a class="nav-link" href="seller.html">Cửa hàng</a></li>`;
    mid += `<li class="nav-item"><a class="nav-link ${active==='orders'?'active':''}" href="orders.html">Đơn của tôi</a></li>`;
    mid += `<li class="nav-item"><a class="nav-link ${active==='wishlist'?'active':''}" href="wishlist.html">Yêu thích</a></li>`;
    // Wheel / Spin link for buyers
    mid += `<li class="nav-item"><a class="nav-link ${active==='spin'?'active':''}" href="spin.html">Vòng quay</a></li>`;
  }
  const right = user ? 
   `<li class="nav-item"><a class="nav-link">👋 ${user.username||('User#'+user.user_id)}</a></li>
    <li class="nav-item cart-badge"><a class="nav-link ${active==='cart'?'active':''}" href="cart.html"><i class="fa fa-cart-shopping"></i> Giỏ <span id="cartCount" class="badge text-bg-danger">0</span></a></li>
    <li class="nav-item"><a class="nav-link" href="#" onclick="localStorage.removeItem('currentUser');location.reload()">Đăng xuất</a></li>` :
   `<li class="nav-item"><a class="nav-link" href="login.html">Đăng nhập</a></li>
    <li class="nav-item"><a class="nav-link" href="register.html">Đăng ký</a></li>`;
  nav.innerHTML = left + mid + right;
  updateCartBadge();
}
