// chat.js — Realtime Chat System for Buyer/Seller/Admin
// Supabase Realtime + Presence + Typing + Conversations + Message UI
// ===============================================================

/*
  ROLES:
    1 = Admin
    2 = Seller
    3 = Buyer
*/

// ===============================================================
// INIT
// ===============================================================

const CHAT = {};
CHAT.url = window.SUPABASE_URL;
CHAT.key = window.SUPABASE_KEY;
if (window.supabase_client) {
  CHAT.sb = window.supabase_client;
} else if (window.supabase && typeof window.supabase.createClient === 'function') {
  window.supabase_client = window.supabase.createClient(CHAT.url, CHAT.key);
  if (!window.sb) window.sb = window.supabase_client;
  CHAT.sb = window.supabase_client;
} else {
  console.error('[chat] Supabase library not available (no createClient) — chat disabled');
  CHAT.sb = null;
}
// Prefer `window.me` (set by chat-loader) then fall back to localStorage
CHAT.me = window.me || JSON.parse(localStorage.getItem("currentUser")) || null;

if (!CHAT.me) {
  console.warn("Chat disabled: not logged in");
}

// ===============================================================
// GLOBAL toggleChatWindow (KHÔNG đặt trong injectChatUI)
// ===============================================================
function toggleChatWindow() {
  const win = document.getElementById("chat-window");
  const firstOpen = win.classList.contains("hidden");

  win.classList.toggle("hidden");

  if (!win.classList.contains("hidden")) {
    CHAT.scroll();

    // AUTO ROUTE PRODUCT → CHAT SHOP OWNER
    if (firstOpen && window.currentChatTarget?.type === "store") {
      const sellerId = window.currentChatTarget.storeOwnerId;
      if (sellerId) CHAT.openStoreChat(sellerId);
    }
  }
}

// ===============================================================
// DOM injection
// ===============================================================

function injectChatUI() {
  if (document.getElementById("chat-box")) return;

  const box = document.createElement("div");
  box.id = "chat-box";
  box.innerHTML = `
    <div id="chat-button">💬</div>

    <div id="chat-window" class="hidden">
      <div id="chat-header">
        <span id="chat-title">Đang tải...</span>
        <span id="chat-status" class="status-off">●</span>
        <button id="chat-close">×</button>
      </div>

      <div id="chat-messages"></div>
      <div id="typing-indicator" class="hidden">Đang nhập...</div>

      <div id="chat-input-area">
        <input id="chat-input" type="text" placeholder="Nhập tin nhắn..." />
        <button id="chat-send">➤</button>
      </div>
    </div>
  `;
  document.body.appendChild(box);

  document.getElementById("chat-button").onclick = toggleChatWindow;
  document.getElementById("chat-close").onclick = toggleChatWindow;
  document.getElementById("chat-send").onclick = sendMessage;

  document.getElementById("chat-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
    sendTypingSignal();
  });
}

// ===============================================================
// UPDATE HEADER — hiển thị tên SHOP hoặc tên BUYER
// ===============================================================

CHAT.updateHeader = () => {
  const title = document.getElementById("chat-title");

  // Buyer → chat với shop
  if (CHAT.me.role_id === 3 && window.currentChatTarget?.storeName) {
    title.textContent = window.currentChatTarget.storeName;
    return;
  }

  // Seller → thấy username buyer
  title.textContent = CHAT.partner?.username || "Đối tác";
};

// ===============================================================
// SCROLL
// ===============================================================

CHAT.scroll = () => {
  const m = document.getElementById("chat-messages");
  m.scrollTop = m.scrollHeight;
};

// ensure minimal unread styling so unread messages are visually distinct
if (typeof document !== 'undefined' && !document.getElementById('chat-unread-style')) {
  const s = document.createElement('style');
  s.id = 'chat-unread-style';
  s.textContent = `
    .bubble.unread{ background: rgba(255,245,230,0.95); font-weight:600; }
    .msg.other .bubble.unread{ border-left: 4px solid #ffc107; }
  `;
  document.head.appendChild(s);
}

// ===============================================================
// CONVERSATION HANDLING
// ===============================================================

CHAT.currentConversation = null;
CHAT.partner = null;

CHAT.openStoreChat = async function (seller_id) {
  const me = CHAT.me;
  if (!me) return;

  const buyer_id = me.role_id === 3 ? me.user_id : null;

  let { data } = await CHAT.sb
    .from("conversations")
    .select("*")
    .eq("buyer_id", buyer_id)
    .eq("seller_id", seller_id)
    .eq("type", "store")
    .maybeSingle();

  if (!data) {
    const ins = await CHAT.sb
      .from("conversations")
      .insert([{ type: "store", buyer_id, seller_id }])
      .select()
      .single();
    data = ins.data;
  }

  CHAT.loadConversation(data);
};

CHAT.openOrderChat = async function (order_id) {
  const me = CHAT.me;

  let { data } = await CHAT.sb
    .from("conversations")
    .select("*")
    .eq("order_id", order_id)
    .eq("type", "order")
    .maybeSingle();

  if (!data) {
    const order = await CHAT.sb.from("orders").select("*").eq("order_id", order_id).single();

    const ins = await CHAT.sb
      .from("conversations")
      .insert([
        {
          type: "order",
          order_id,
          buyer_id: order.data.buyer_id,
          seller_id: order.data.store_id || null,
          admin_id: 1,
        },
      ])
      .select()
      .single();

    data = ins.data;
  }

  CHAT.loadConversation(data);
};

// Seller mở chat với buyer (được gọi từ `seller.html`)
CHAT.openSellerChat = async function (buyer_id) {
  const me = CHAT.me;
  if (!me) return;

  const seller_id = me.role_id === 2 ? me.user_id : null;

  let { data } = await CHAT.sb
    .from("conversations")
    .select("*")
    .eq("buyer_id", buyer_id)
    .eq("seller_id", seller_id)
    .eq("type", "store")
    .maybeSingle();

  if (!data) {
    try {
      const ins = await CHAT.sb
        .from("conversations")
        .insert([{ type: "store", buyer_id, seller_id }])
        .select()
        .single();
      data = ins.data;
    } catch (e) {
      console.error('[chat] openSellerChat insert error', e);
      return;
    }
  }

  CHAT.loadConversation(data);
};

// Đánh dấu messages đã xem — cập nhật an toàn, ignore lỗi nếu cột không tồn tại
CHAT.markMessagesSeen = async function () {
  if (!CHAT.currentConversation || !CHAT.me) return;
  const conv = CHAT.currentConversation;
  const convId = conv.conversation_id || conv.id || null;

  // 1) Try to clear unread counter on conversations table (if column exists)
  try {
    if (convId) await CHAT.sb.from('conversations').update({ unread_seller: 0 }).eq('conversation_id', convId).maybeSingle();
  } catch (e) {
    console.debug('[chat] markMessagesSeen: conversations update failed (maybe column missing)', e?.message || e);
  }

  // 2) Prefer RPC call (secure server-side) if available: mark_conversation_read
  try {
    if (convId && typeof CHAT.sb.rpc === 'function') {
      const rpc = await CHAT.sb.rpc('mark_conversation_read', { p_conv_id: convId });
      if (!rpc || rpc.error) throw rpc.error || new Error('RPC failed');
      return;
    }
  } catch (e) {
    console.debug('[chat] markMessagesSeen: RPC mark_conversation_read failed, falling back', e?.message || e);
  }

  // 3) Fallback: direct update from client (works only if RLS allows it)
  try {
    if (convId) {
      const res = await CHAT.sb
        .from('chat_messages')
        .update({ is_read: true })
        .eq('conversation_id', convId)
        .eq('receiver_id', CHAT.me.user_id)
        .eq('is_read', false);
      if (!res || res.error) throw res?.error || new Error('update failed');
      return;
    }
  } catch (e) {
    console.debug('[chat] markMessagesSeen: update by conversation_id failed', e?.message || e);
  }

  // 4) Final fallback: update by sender/receiver pair (no conversation_id)
  try {
    await CHAT.sb
      .from('chat_messages')
      .update({ is_read: true })
      .eq('receiver_id', CHAT.me.user_id)
      .eq('sender_id', CHAT.partner ? CHAT.partner.user_id : null)
      .eq('is_read', false);
  } catch (e) {
    console.debug('[chat] markMessagesSeen: fallback update failed', e?.message || e);
  }
};

CHAT.loadConversation = async function (conv) {
  CHAT.currentConversation = conv;

  const me = CHAT.me;
  let partnerId = null;

  if (conv.type === "store") {
    partnerId = me.role_id === 3 ? conv.seller_id : conv.buyer_id;
  } else if (conv.type === "order") {
    partnerId = conv.buyer_id;
  }

  const user = await CHAT.sb
    .from("users")
    .select("username, user_id")
    .eq("user_id", partnerId)
    .maybeSingle();

  CHAT.partner = user.data;
  CHAT.updateHeader();

  injectChatUI();
  CHAT.subscribeRealtime();
  CHAT.loadMessages();
};

// ===============================================================
// LOAD MESSAGES
// ===============================================================

CHAT.loadMessages = async function () {
  const me = CHAT.me;
  const p = CHAT.partner;
  if (!p) return;

  const r = await CHAT.sb
    .from("chat_messages")
    .select("*")
    .or(`sender_id.eq.${me.user_id},receiver_id.eq.${me.user_id}`)
    .order("created_at", { ascending: true });

  const msgs = r.data.filter(
    (m) =>
      (m.sender_id === me.user_id && m.receiver_id === p.user_id) ||
      (m.sender_id === p.user_id && m.receiver_id === me.user_id)
  );
  CHAT.renderMessages(msgs);

  // Mark messages as seen/read for this user; after DB update, update UI to remove unread highlight
  try{
    await CHAT.markMessagesSeen();
    // Optimistically update local msgs to reflect they are now read by current user
    for (let m of msgs) {
      if (m.receiver_id === me.user_id) m.is_read = true;
    }
    // re-render so unread styles are cleared
    CHAT.renderMessages(msgs);
    if (CHAT.me && CHAT.me.role_id === 2) {
      if (window.loadBuyerChatList) try { window.loadBuyerChatList(); } catch (e) {}
    }
  } catch (e) {
    console.warn('[chat] loadMessages post-mark err', e);
  }
};

CHAT.renderMessages = (list) => {
  const box = document.getElementById("chat-messages");
  if (!box) return;

  box.innerHTML = list
    .map((m) => {
      const mine = m.sender_id === CHAT.me.user_id;
      // Determine unread incoming message for current user
      const isUnreadIncoming = !mine && (m.receiver_id === CHAT.me.user_id) && (m.is_read === false || m.is_read === null || typeof m.is_read === 'undefined' ? true : !m.is_read);
      return `
        <div class="msg ${mine ? "me" : "other"}">
          <div class="bubble ${isUnreadIncoming ? 'unread' : ''}">${m.content}</div>
          <div class="time">${new Date(m.created_at).toLocaleTimeString()}</div>
        </div>`;
    })
    .join("");

  CHAT.scroll();
};

// ===============================================================
// SEND
// ===============================================================

async function sendMessage() {
  const txt = document.getElementById("chat-input").value.trim();
  if (!txt) return;

  // include conversation_id when available so messages are linked to a conversation
  // Ensure we have a conversation_id. If none, try to create one (store-type conversation)
  let convId = CHAT.currentConversation?.conversation_id || CHAT.currentConversation?.id || null;
  if (!convId) {
    try {
      let buyer_id = null, seller_id = null;
      if (CHAT.me.role_id === 3) { // current user is buyer
        buyer_id = CHAT.me.user_id;
        seller_id = CHAT.partner ? CHAT.partner.user_id : null;
      } else if (CHAT.me.role_id === 2) { // current user is seller
        seller_id = CHAT.me.user_id;
        buyer_id = CHAT.partner ? CHAT.partner.user_id : null;
      }
      if (buyer_id && seller_id) {
        const ins = await CHAT.sb.from('conversations').insert([{ type: 'store', buyer_id, seller_id }]).select().maybeSingle();
        if (ins && !ins.error && ins.data) {
          convId = ins.data.conversation_id || ins.data.id;
          CHAT.currentConversation = ins.data;
        }
      }
    } catch (e) {
      console.debug('[chat] create conversation failed', e?.message || e);
    }
  }

  const payload = {
    sender_id: CHAT.me.user_id,
    receiver_id: CHAT.partner.user_id,
    content: txt,
  };
  if (convId) payload.conversation_id = convId;

  await CHAT.sb.from("chat_messages").insert([ payload ]);

  document.getElementById("chat-input").value = "";
}

// ===============================================================
// REALTIME
// ===============================================================

CHAT.channel = null;
CHAT.typingTimeout = null;

CHAT.subscribeRealtime = function () {
  if (!CHAT.partner) return;

  if (CHAT.channel) CHAT.sb.removeChannel(CHAT.channel);

  // Prefer using conversation id for channel name (more robust). If not
  // available, fallback to normalized user-id based name so both sides
  // still subscribe to the same channel.
  const convId = CHAT.currentConversation?.id || CHAT.currentConversation?.conversation_id || null;

  let channelName;
  if (convId) {
    channelName = `chat_conv_${convId}`;
  } else {
    const idA = Number(CHAT.me.user_id);
    const idB = Number(CHAT.partner.user_id);
    const uid1 = Math.min(idA, idB);
    const uid2 = Math.max(idA, idB);
    channelName = `chat_${uid1}_${uid2}`;
  }

  console.log('[chat] subscribing to channel', channelName);
  CHAT.channel = CHAT.sb.channel(channelName);

  // message listener
  CHAT.channel.on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "chat_messages" },
    (payload) => {
      const m = payload.new;
      const me = CHAT.me.user_id;
      const p = CHAT.partner.user_id;

      console.log('[chat] postgres_changes payload', payload);

      // If conversation_id exists on messages, prefer matching by conv id
      if (m.conversation_id && convId) {
        if (Number(m.conversation_id) === Number(convId)) CHAT.loadMessages();
        return;
      }

      if ((m.sender_id === me && m.receiver_id === p) || (m.sender_id === p && m.receiver_id === me)) {
        CHAT.loadMessages();
      }
    }
  );

  // typing
  CHAT.channel.on("broadcast", { event: "typing" }, (p) => {
    if (p.payload.user === CHAT.partner.user_id) showTyping();
  });

  // presence
  CHAT.channel.on("presence", { event: "sync" }, () => {
    const state = CHAT.channel.presenceState();
    const others = Object.keys(state).filter((x) => Number(x) === CHAT.partner.user_id);
    updateStatus(others.length > 0);
  });

  CHAT.channel.subscribe((status) => {
    console.log('[chat] channel subscribe status', status);
    if (status === "SUBSCRIBED") {
      CHAT.channel.track({ user: CHAT.me.user_id });
      console.log('[chat] tracked presence for', CHAT.me.user_id);
    }
  });
};

// ===============================================================
// TYPING
// ===============================================================

function sendTypingSignal() {
  if (!CHAT.channel) return;
  CHAT.channel.send({ type: "broadcast", event: "typing", payload: { user: CHAT.me.user_id } });
}

function showTyping() {
  const t = document.getElementById("typing-indicator");
  t.classList.remove("hidden");

  clearTimeout(CHAT.typingTimeout);
  CHAT.typingTimeout = setTimeout(() => t.classList.add("hidden"), 1000);
}

// ===============================================================
// PRESENCE
// ===============================================================

function updateStatus(isOnline) {
  const el = document.getElementById("chat-status");
  if (!el) return;

  el.className = isOnline ? "status-on" : "status-off";
}

// ===============================================================
// START
// ===============================================================

// Auto load
(function () {
  if (CHAT.me) {
    // load CSS if needed
    if (!document.getElementById("chat-css")) {
      const link = document.createElement("link");
      link.id = "chat-css";
      link.rel = "stylesheet";
      link.href = "chat.css";
      document.head.appendChild(link);
    }

    injectChatUI();
  }
})();

// Expose
// Expose CHAT and helper entrypoints to window so other pages (seller.html)
// can access chat state and call functions.
window.CHAT = CHAT;

window.openChatWithStore = (id) =>
  CHAT.openStoreChat ? CHAT.openStoreChat(id) : console.warn("Chat not ready");

window.openChatForOrder = (id) =>
  CHAT.openOrderChat ? CHAT.openOrderChat(id) : console.warn("Chat not ready");
