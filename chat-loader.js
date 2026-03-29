// ...existing code...
(function () {
  if (window.__chat_loader_initialized) return;
  window.__chat_loader_initialized = true;

  console.log('[chat-loader] init');

  // === Load Supabase library first ===
  function ensureSupabaseLoaded(callback) {
    if (window.supabase) {
      console.log('[chat-loader] supabase already present');
      return callback();
    }

    const supa = document.createElement("script");
    supa.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    supa.onload = () => {
      console.log('[chat-loader] supabase script loaded');
      callback();
    };
    supa.onerror = () => console.error('[chat-loader] failed to load supabase script');
    document.head.appendChild(supa);
  }

  ensureSupabaseLoaded(startChatLoader);

  function startChatLoader() {
    console.log('[chat-loader] startChatLoader');

    // === Global config ===
    window.SUPABASE_URL = "https://qpnqsvueowqtqnzqdyqh.supabase.co";
    window.SUPABASE_KEY =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwbnFzdnVlb3dxdHFuenFkeXFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk5ODg1NDMsImV4cCI6MjA3NTU2NDU0M30.dtNEnYlLLa9mTP9Oi6uvS7PkQ2IoH6SMhXemPa0uSfs";

    // === Global currentUser (debug) ===
    try {
      window.me = JSON.parse(localStorage.getItem("currentUser") || "null");
    } catch (e) {
      window.me = null;
    }
    console.log('[chat-loader] currentUser from localStorage:', window.me);

    // === Load chat.css ===
    if (!document.getElementById("chat-css")) {
      const link = document.createElement("link");
      link.id = "chat-css";
      link.rel = "stylesheet";
      link.href = "chat.css";
      document.head.appendChild(link);
      console.log('[chat-loader] chat.css injected');
    }

    // === Load chat.js safely ===
    if (!window.__chatLoaded) {
      const wait = setInterval(() => {
        if (window.supabase && window.SUPABASE_URL) {
          clearInterval(wait);
          console.log('[chat-loader] supabase ready, injecting chat.js');

          const s = document.createElement("script");
          s.src = "chat.js";
          s.onload = () => {
            window.__chatLoaded = true;
            console.log('[chat-loader] chat.js loaded');
            // quick sanity checks
            setTimeout(() => {
              console.log('[chat-loader] window.CHAT =', window.CHAT);
              console.log('[chat-loader] CHAT.me =', window.CHAT?.me);
            }, 200);
          };
          s.onerror = () => console.error('[chat-loader] failed to load chat.js');
          document.body.appendChild(s);
        }
      }, 100);
    } else {
      console.log('[chat-loader] already marked __chatLoaded');
    }
  }
})();