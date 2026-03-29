// Kết nối Supabase
const SUPABASE_URL = 'https://qpnqsvueowqtqnzqdyqh.supabase.co';
const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwbnFzdnVlb3dxdHFuenFkeXFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5ODg1NDMsImV4cCI6MjA3NTU2NDU0M30.dtNEnYlLLa9mTP9Oi6uvS7PkQ2IoH6SMhXemPa0uSfs';

// ✅ Kết nối Supabase (mặc định schema public)
if (!window.supabase_client) {
  window.supabase_client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  if (!window.sb) window.sb = window.supabase_client;
}
var supabase = window.supabase_client;

async function loadProducts() {
  const list = document.getElementById('product-list');
  list.innerHTML = '<p>Đang tải sản phẩm...</p>';

  const { data, error } = await supabase.from('products').select('*');
  if (error) {
    console.error('Supabase error:', error);
    list.innerHTML = `<p style="color:red">Lỗi: ${error.message}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    list.innerHTML = '<p>Chưa có sản phẩm nào!</p>';
    return;
  }

  list.innerHTML = data
    .map(
      (p) => `
      <div class="product-card">
        <img src="${p.image_url || 'https://via.placeholder.com/150'}" alt="${p.product_name}" />
        <h3>${p.product_name}</h3>
        <p>${p.price.toLocaleString()}₫</p>
      </div>`
    )
    .join('');
}

loadProducts();
async function checkRole() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data } = await supabase
    .from('users')
    .select('role_id, username')
    .eq('auth_id', user.id)
    .single();

  if (data) {
    if (data.role_id === 1) alert("Bạn là ADMIN");
    else if (data.role_id === 2) alert("Bạn là SELLER");
    else alert("Bạn là BUYER");
  }
}
