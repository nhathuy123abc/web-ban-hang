// buyer.js - shared helpers for buyer-facing pages
// Supabase
const SUPABASE_URL = "https://qpnqsvueowqtqnzqdyqh.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwbnFzdnVlb3dxdHFuenFkeXFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5ODg1NDMsImV4cCI6MjA3NTU2NDU0M30.dtNEnYlLLa9mTP9Oi6uvS7PkQ2IoH6SMhXemPa0uSfs";
window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Auth / user
window.me = JSON.parse(localStorage.getItem('currentUser')||'null');

// UI helpers
function VND(v){ return Number(v||0).toLocaleString('vi-VN')+' ₫'; }
function toast(msg,type='info'){ 
  let bg = type==='success'?'bg-success text-white':type==='danger'?'bg-danger text-white':type==='warning'?'bg-warning':'bg-light';
  const id='t'+Date.now(); const el=document.createElement('div');
  el.className = 'toast align-items-center '+bg+' border-0 mb-2'; 
  el.innerHTML = `<div class="d-flex"><div class="toast-body">${msg}</div><button type="button" class="btn-close me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
  const area = document.getElementById('toastArea') || (()=>{const d=document.createElement('div'); d.id='toastArea'; d.style='position:fixed;top:12px;right:12px;z-index:1080'; document.body.appendChild(d); return d;})();
  area.appendChild(el); new bootstrap.Toast(el,{delay:2500}).show(); setTimeout(()=>el.remove(),3000);
}

// Guard (require login)
async function requireLogin(){ if(!me){ location.href='login.html'; }}

// Check optional tables
async function tableExists(table){ try{ const r = await sb.from(table).select('*').limit(1); return !(r.error && r.error.message?.includes('does not exist')); }catch(e){ return false; }}

// Cart API (DB: cart_items) - per user
const CART_TABLE = 'cart_items';
async function addToCart(product_id, quantity=1){ 
  if(!me) return location.href='login.html';
  quantity = Number(quantity)||1;
  const ex = await sb.from(CART_TABLE).select('*').eq('user_id', me.user_id).eq('product_id', product_id).maybeSingle();
  if(ex.data){ const q = Number(ex.data.quantity||0)+quantity; const {error} = await sb.from(CART_TABLE).update({quantity:q}).eq('id', ex.data.id); if(error) return toast('Lỗi giỏ: '+error.message,'danger'); }
  else { const {error}=await sb.from(CART_TABLE).insert([{user_id:me.user_id, product_id, quantity}]); if(error) return toast('Lỗi giỏ: '+error.message,'danger'); }
  toast('Đã thêm vào giỏ','success'); updateCartBadge();
}

async function getCart(){ if(!me) return []; const r = await sb.from(CART_TABLE).select('id, product_id, quantity'); return r.data||[]; }
async function setCartQty(id, qty){ qty=Math.max(1, Number(qty)||1); const {error}=await sb.from(CART_TABLE).update({quantity:qty}).eq('id', id); if(error) toast('Lỗi: '+error.message,'danger'); }
async function removeCart(id){ const {error}=await sb.from(CART_TABLE).delete().eq('id', id); if(error) toast('Lỗi: '+error.message,'danger'); }

// Wishlist API (DB: wishlists)
const WISH_TABLE = 'wishlists';
async function toggleWish(product_id){ if(!me) return location.href='login.html';
  const ex = await sb.from(WISH_TABLE).select('*').eq('user_id', me.user_id).eq('product_id', product_id).maybeSingle();
  if(ex.data){ await sb.from(WISH_TABLE).delete().eq('id', ex.data.id); toast('Đã bỏ yêu thích','info'); return false; }
  else { const {error} = await sb.from(WISH_TABLE).insert([{user_id:me.user_id, product_id}]); if(error){ toast('Lỗi: '+error.message,'danger'); return null; } toast('Đã lưu yêu thích','success'); return true; }
}
async function getWishes(){ if(!me) return []; const r = await sb.from(WISH_TABLE).select('product_id'); return (r.data||[]).map(x=>x.product_id); }

// Reviews API (DB: reviews)
const REV_TABLE = 'reviews';

// Người mua tạo / cập nhật đánh giá cho 1 sản phẩm
async function createReview(product_id, rating, content){
  if(!me){
    location.href = 'login.html';
    return;
  }
  rating = Math.max(1, Math.min(5, Number(rating) || 5));
  const comment = (content || '').trim() || null;

  // Mỗi buyer chỉ 1 đánh giá / sản phẩm: nếu tồn tại thì cập nhật
  let existed = null;
  try{
    const res = await sb
      .from(REV_TABLE)
      .select('review_id')
      .eq('product_id', product_id)
      .eq('buyer_id', me.user_id)
      .maybeSingle();
    existed = res.data || null;
  }catch(e){
    existed = null;
  }

  let error;
  if(existed){
    ({ error } = await sb
      .from(REV_TABLE)
      .update({ rating, comment })
      .eq('review_id', existed.review_id));
  }else{
    ({ error } = await sb.from(REV_TABLE).insert([{
      product_id,
      buyer_id: me.user_id,
      rating,
      comment
    }]));
  }

  if(error){
    toast('Lỗi đánh giá: ' + error.message, 'danger');
    return;
  }
  toast('Đã gửi đánh giá', 'success');
}

// Lấy tất cả đánh giá của 1 sản phẩm (ai cũng xem được)
async function fetchReviews(product_id){
  const r = await sb
    .from(REV_TABLE)
    .select('*')
    .eq('product_id', product_id)
    .order('created_at', { ascending: false });
  if(r.error){
    console.error('Không tải được đánh giá', r.error);
    return [];
  }
  return r.data || [];
}

// Người bán phản hồi đánh giá (chỉ role seller mới được)
async function replyReview(review_id, replyText){
  if(!me){
    location.href = 'login.html';
    return;
  }
  if(me.role_id !== 2){
    toast('Chỉ người bán mới được phản hồi đánh giá', 'warning');
    return;
  }
  const payload = {
    seller_id: me.user_id,
    seller_reply: (replyText || '').trim() || null,
    seller_replied_at: new Date().toISOString()
  };
  const { error } = await sb
    .from(REV_TABLE)
    .update(payload)
    .eq('review_id', review_id);
  if(error){
    toast('Lỗi phản hồi: ' + error.message, 'danger');
  }else{
    toast('Đã lưu phản hồi', 'success');
  }
}

// Orders & payments (split by store)
const ORD_TABLE='orders'; const OI_TABLE='order_items'; const PAY_TABLE='payments';
async function createOrdersFromCart(cartRows, couponPercent=0){ 
  const ids = cartRows.map(x=>x.product_id);
  const pr = await sb.from('products').select('product_id, product_name, price, store_id, stock').in('product_id', ids);
  const map = new Map(); (pr.data||[]).forEach(p=>map.set(p.product_id, p));
  const byStore = new Map();
  cartRows.forEach(ci=>{ const p = map.get(ci.product_id); if(!p) return; const k=p.store_id; if(!byStore.has(k)) byStore.set(k, []); byStore.get(k).push({ci, p}); });
  const ordersCreated=[];
  for(const [store_id, list] of byStore.entries()){ 
    const subtotal = list.reduce((s,{ci,p})=> s + Number(p.price)*Number(ci.quantity), 0);
    const discount = couponPercent>0 ? Math.round(subtotal*couponPercent/100) : 0;
    const total = subtotal - discount;
    const or = await sb.from(ORD_TABLE).insert([{ store_id, buyer_id: me.user_id, total_price: total, order_status: 'pending', created_at: new Date().toISOString() }]).select('*').single();
    if(or.error) throw new Error(or.error.message);
    const order = or.data; ordersCreated.push(order);
    const itemsPayload = list.map(({ci,p})=>({ order_id: order.order_id, product_id: p.product_id, product_name: p.product_name, quantity: ci.quantity, price: p.price }));
    const oi = await sb.from(OI_TABLE).insert(itemsPayload);
    if(oi.error) throw new Error(oi.error.message);
    const tx = 'VNP'+Date.now()+Math.floor(Math.random()*1000).toString().padStart(3,'0');
    const pay = await sb.from(PAY_TABLE).insert([{ order_id: order.order_id, amount: total, method: 'vnpay', transaction_code: tx, status: 'completed', created_at: new Date().toISOString() }]);
    if(pay.error) throw new Error(pay.error.message);
    await sb.from(ORD_TABLE).update({order_status:'confirmed'}).eq('order_id', order.order_id);
  }
  const idsToDel = cartRows.map(x=>x.id);
  if(idsToDel.length) await sb.from(CART_TABLE).delete().in('id', idsToDel);
  return ordersCreated;
}

async function updateCartBadge(){ 
  const el=document.getElementById('cartCount'); if(!el) return;
  if(!me) return (el.textContent='0');
  const r=await sb.from(CART_TABLE).select('id',{count:'exact', head:true}); el.textContent = r.count||'0';
}

// Load store name map
async function getStoreMapByProducts(products){ 
  const sids=[...new Set(products.map(p=>p.store_id))];
  const rs = sids.length? await sb.from('stores').select('store_id, store_name').in('store_id', sids) : {data:[]};
  const m = new Map(); (rs.data||[]).forEach(s=>m.set(s.store_id, s.store_name)); return m;
}
