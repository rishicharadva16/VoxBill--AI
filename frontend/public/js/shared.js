/**
 * VoxBill Shared Data Layer
 * All localStorage get/set helpers used across all pages.
 */
/**
* VoxBill Shared Data Layer
* All localStorage get/set helpers used across all pages.
*/

// ── Anthropic API Key ──────────────────────
// Removed: See config.js which is gitignored
// ───────────────────────────────────────────

/* ─────────────────────────────────────────
   RESTAURANT SETTINGS
───────────────────────────────────────── */
/* ─────────────────────────────────────────
   RESTAURANT SETTINGS
───────────────────────────────────────── */
const DEFAULT_SETTINGS = {
    restaurantName: 'VoxBill Restaurant',
    address: '123 Culinary Hub, Cyber City',
    gstNumber: '27AABCV1234M1Z1',
    phone: '',
    email: '',
    upiId: '',
    footerMsg: 'Thank you for dining with us!',
    invoiceTemplate: 'modern',
    gstEnabled: true,
    gstPercent: 5,
    logoDataUrl: ''
};

function getSettings() {
    try {
        const raw = localStorage.getItem('vb_settings');
        return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch { return { ...DEFAULT_SETTINGS }; }
}

function saveSettings(data) {
    // 1. Always update localStorage immediately
    localStorage.setItem('vb_settings', JSON.stringify(data));
    // 2. Async sync to MongoDB if backend available and user logged in
    if (window.VoxAPI && VoxAPI.isLoggedIn()) {
        VoxAPI.saveSettings(data).catch(() => { });
    }
}

/* ─────────────────────────────────────────
   MENU MANAGEMENT
───────────────────────────────────────── */
const DEFAULT_MENU = [
    { id: 1, name: 'Paneer Butter Masala', category: 'Main Course', price: 250 },
    { id: 2, name: 'Butter Naan', category: 'Breads', price: 40 },
    { id: 3, name: 'Coke', category: 'Beverages', price: 60 },
    { id: 4, name: 'Dal Tadka', category: 'Main Course', price: 180 },
    { id: 5, name: 'Garlic Naan', category: 'Breads', price: 50 },
    { id: 6, name: 'Mango Lassi', category: 'Beverages', price: 90 },
    { id: 7, name: 'Veg Biryani', category: 'Rice', price: 220 },
    { id: 8, name: 'Gulab Jamun', category: 'Desserts', price: 80 },
    { id: 9, name: 'Masala Chai', category: 'Beverages', price: 30 },
    { id: 10, name: 'Chicken Tikka', category: 'Starters', price: 320 },
];

function getMenu() {
    try {
        const raw = localStorage.getItem('vb_menu');
        return raw ? JSON.parse(raw) : [...DEFAULT_MENU];
    } catch { return [...DEFAULT_MENU]; }
}

// Refresh menu from DB in background on every page load
// Does not block — just keeps localStorage up to date silently
async function refreshMenuFromDB() {
    try {
        const token = sessionStorage.getItem('vb_jwt');
        if (!token) return;
        const res = await fetch('/api/menu', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success && data.data && data.data.length > 0) {
            localStorage.setItem('vb_menu', JSON.stringify(
                data.data.map(item => ({
                    id: item._id,
                    name: item.name,
                    category: item.category,
                    price: item.price
                }))
            ));
        }
    } catch (e) {
        // Silent fail — cached menu will be used
    }
}
// Call on every page load silently
refreshMenuFromDB();

function saveMenu(items) {
    // 1. Always update localStorage immediately
    localStorage.setItem('vb_menu', JSON.stringify(items));
    // 2. Async sync to MongoDB if backend available and user is manager
    if (window.VoxAPI && VoxAPI.isManager()) {
        VoxAPI.bulkSyncMenu(items).catch(() => { });
    }
}

function getNextMenuId() {
    const menu = getMenu();
    return menu.length > 0 ? Math.max(...menu.map(i => i.id)) + 1 : 1;
}

/* ─────────────────────────────────────────
   ORDER HISTORY
───────────────────────────────────────── */
function getOrders() {
    try {
        const raw = localStorage.getItem('vb_orders');
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveOrder(order) {
    // 1. Always update localStorage cache immediately
    const orders = getOrders();
    order.id = Date.now();
    order.timestamp = new Date().toISOString();
    orders.unshift(order); // newest first
    if (orders.length > 500) orders.splice(500);
    localStorage.setItem('vb_orders', JSON.stringify(orders));
    // 2. Async sync to MongoDB if backend available and user logged in
    if (window.VoxAPI && VoxAPI.isLoggedIn()) {
        VoxAPI.saveOrder(order).then(r => {
            if (r.ok && r.data && r.data.data && r.data.data._id) {
                // Store the MongoDB _id alongside so orders.html can use it
                order.mongoId = r.data.data._id;
                const updated = getOrders();
                const idx = updated.findIndex(o => o.id === order.id);
                if (idx >= 0) { updated[idx] = order; localStorage.setItem('vb_orders', JSON.stringify(updated)); }
            }
        }).catch(() => { });
    }
    return order;
}

function clearOrders() {
    localStorage.removeItem('vb_orders');
}

/* ─────────────────────────────────────────
   NOTIFICATION SYSTEM
───────────────────────────────────────── */
function getNotifications() {
    try {
        const raw = localStorage.getItem('vb_notifications');
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

/* ─────────────────────────────────────────
   NOTIFICATION SOUND SYSTEM
   Uses Web Audio API — no files needed
───────────────────────────────────────── */

function playNotificationSound(soundType) {
    try {
        const AudioCtx = window.AudioContext
            || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();

        function tone(freq, start, dur, vol, type) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            // Add compressor for loudness
            const comp = ctx.createDynamicsCompressor();
            comp.threshold.value = -10;
            comp.knee.value = 3;
            comp.ratio.value = 4;
            comp.attack.value = 0.001;
            comp.release.value = 0.1;

            osc.connect(gain);
            gain.connect(comp);
            comp.connect(ctx.destination);

            osc.type = type || 'sine';
            osc.frequency.setValueAtTime(
                freq, ctx.currentTime + start);

            // Higher volume — was 0.3, now 0.8
            gain.gain.setValueAtTime(
                vol || 0.8,
                ctx.currentTime + start);
            gain.gain.exponentialRampToValueAtTime(
                0.001,
                ctx.currentTime + start + dur);
            osc.start(ctx.currentTime + start);
            osc.stop(ctx.currentTime + start + dur);
        }

        if (soundType === 'new_order') {
            tone(880, 0.0, 0.3, 0.8);
            tone(1100, 0.25, 0.3, 0.8);

        } else if (soundType === 'ready_billing') {
            tone(880, 0.0, 0.2, 0.9);
            tone(1100, 0.2, 0.2, 0.9);
            tone(1320, 0.4, 0.4, 0.9);

        } else if (soundType === 'paid') {
            tone(523, 0.0, 0.1, 0.7);
            tone(659, 0.1, 0.1, 0.7);
            tone(784, 0.2, 0.1, 0.7);
            tone(1047, 0.3, 0.5, 0.8);

        } else if (soundType === 'priority') {
            tone(440, 0.0, 0.15, 0.9, 'square');
            tone(880, 0.2, 0.15, 0.9, 'square');
            tone(440, 0.4, 0.15, 0.9, 'square');
            tone(880, 0.6, 0.3, 0.9, 'square');

        } else if (soundType === 'error') {
            tone(200, 0.0, 0.25, 0.9, 'sawtooth');
            tone(150, 0.3, 0.35, 0.9, 'sawtooth');

        } else {
            tone(880, 0.0, 0.35, 0.7);
        }

        setTimeout(() => {
            ctx.close();
        }, 2000);

    } catch (e) {
        console.warn('Sound error:', e.message);
    }
}

function addNotification(message, type = 'info') {
    const notifications = getNotifications();
    const newNoti = {
        id: Date.now(),
        message,
        type,
        time: new Date().toISOString(),
        read: false
    };
    notifications.unshift(newNoti);
    // Keep last 50
    if (notifications.length > 50) notifications.splice(50);
    localStorage.setItem('vb_notifications', JSON.stringify(notifications));

    // Play sound AND speak for manager only
    if (window.VoxAPI && VoxAPI.isManager()) {
        if (type === 'priority') {
            playNotificationSound('ready_billing');
        } else if (type === 'success') {
            playNotificationSound('paid');
        } else if (type === 'error') {
            playNotificationSound('error');
        } else {
            playNotificationSound('new_order');
        }
    }

    // Update UI if exists
    updateNotificationBadge();
    renderNotifPanel();

    // Also show a toast for immediate feedback if on dashboard or if priority
    if (window.location.pathname.endsWith('index.html') || type === 'priority') {
        showToast(message, type === 'priority' ? 'info' : 'success');
    }
}

function clearNotifications() {
    localStorage.setItem('vb_notifications', JSON.stringify([]));
    updateNotificationBadge();
    renderNotifPanel();
}

function updateNotificationBadge() {
    const badge = document.getElementById('notiBadge');
    if (!badge) return;
    const unread = getNotifications().filter(n => !n.read).length;
    if (unread > 0) {
        badge.textContent = unread > 9 ? '9+' : unread;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

function renderNotifPanel() {
    const list = document.getElementById('notifPanelBody');
    if (!list) return;
    const notis = getNotifications();

    if (notis.length === 0) {
        list.innerHTML = `<div class="notif-empty">No new notifications</div>`;
        return;
    }

    list.innerHTML = notis.map(n => {
        const timeVal = new Date(n.time);
        const diff = Math.floor((Date.now() - timeVal) / 60000);
        const timeStr = diff < 1 ? 'Just now' : diff < 60 ? `${diff}m ago` : `${Math.floor(diff / 60)}h ago`;

        // Map type to class
        let typeClass = '';
        if (n.type === 'new_order') typeClass = 'type-order';
        else if (n.type === 'ready_billing' || n.type === 'ready') typeClass = 'type-ready';
        else if (n.type === 'paid' || n.type === 'order_paid') typeClass = 'type-paid';

        return `
        <div class="notif-item ${n.read ? '' : 'unread'} ${typeClass}">
            <div class="notif-content">
                <div class="notif-text">${n.message}</div>
                <div class="notif-time">${timeStr}</div>
            </div>
        </div>
        `;
    }).join('');
}

/* ─────────────────────────────────────────
   ANALYTICS HELPERS
───────────────────────────────────────── */
function todayStr() {
    return new Date().toISOString().slice(0, 10);
}

function getOrdersForDay(dateStr) {
    return getOrders().filter(o => o.timestamp.startsWith(dateStr));
}

function getOrdersForRange(daysBack) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    return getOrders().filter(o => new Date(o.timestamp) >= cutoff);
}

function getMostOrderedItem(orders) {
    const counts = {};
    orders.forEach(o => {
        (o.items || []).forEach(item => {
            counts[item.item] = (counts[item.item] || 0) + item.qty;
        });
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? { name: sorted[0][0], count: sorted[0][1] } : null;
}

function getTopItems(orders, limit = 5) {
    const counts = {};
    orders.forEach(o => {
        (o.items || []).forEach(item => {
            counts[item.item] = (counts[item.item] || 0) + item.qty;
        });
    });
    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([name, qty]) => ({ name, qty }));
}

function getRevenueByDay(daysBack = 7) {
    const result = [];
    for (let i = daysBack - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const ds = d.toISOString().slice(0, 10);
        const orders = getOrdersForDay(ds);
        const rev = orders.reduce((s, o) => s + (o.grandTotal || 0), 0);
        result.push({ date: ds, label: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), revenue: rev, count: orders.length });
    }
    return result;
}

function getOrdersByHour(dateStr) {
    const buckets = Array(24).fill(0);
    getOrdersForDay(dateStr).forEach(o => {
        const h = new Date(o.timestamp).getHours();
        buckets[h]++;
    });
    return buckets;
}

/* ─────────────────────────────────────────
   SIDEBAR BUILDER (reusable across pages)
───────────────────────────────────────── */
function buildSidebar(activePage) {
    const isManager = window.VoxAPI && VoxAPI.isManager();
    const user = window.VoxAPI ? VoxAPI.getUser() : null;
    const role = user ? user.role : 'waiter';

    const menu = [
        { name: 'Dashboard', icon: 'fa-gauge-high', link: '../pages/index.html' }
    ];

    if (role === 'manager') {
        menu.push({ name: 'Tables', icon: 'fa-table-cells', link: '../pages/tables.html' });
    } else {
        menu.push({ name: 'New Order', icon: 'fa-plus-circle', link: '../pages/tables.html' });
    }

    menu.push({ name: 'Orders', icon: 'fa-receipt', link: '../pages/orders.html' });

    if (isManager) {
        menu.push(
            { name: 'Rush Mode', icon: 'fa-camera', link: '../pages/rush.html' },
            { name: 'Menu', icon: 'fa-utensils', link: '../pages/menu.html' },
            { name: 'Analytics', icon: 'fa-chart-line', link: '../pages/analytics.html' },
            { name: 'Staff', icon: 'fa-users-gear', link: '../pages/staff.html' },
            { name: 'Settings', icon: 'fa-gear', link: '../pages/settings.html' }
        );
    }

    const settings = getSettings();

    return `
    <aside class="sidebar" id="sidebar">
        <div class="sidebar-header">
            <div class="sidebar-logo">
                <div class="logo-icon"><i class="fa-solid fa-microphone-lines"></i></div>
                <div class="logo-text-group">
                    <span class="logo-text" id="sidebarRestaurantName">${settings.restaurantName.split(' ')[0] || 'VoxBill'}</span>
                    <span class="logo-subtext">AI Billing System</span>
                </div>
            </div>
            <button class="sidebar-toggle" id="sidebarToggle"><i class="fa-solid fa-bars"></i></button>
        </div>
        <nav class="sidebar-nav">
            ${menu.map(item => `
            <a href="${item.link}" class="nav-item ${item.name === activePage ? 'active' : ''}" data-label="${item.name}">
                <i class="fa-solid ${item.icon}"></i>
                <span>${item.name}</span>
            </a>`).join('')}
            <div class="ui-mode-toggle" id="ui-mode-toggle" title="Toggle UI Mode">
                <i class="fa-solid fa-wand-magic-sparkles"></i>
                <span class="ui-mode-label">Smart Mode</span>
            </div>
            
            <div class="lang-switcher" id="lang-switcher">
                <button class="lang-btn" data-lang="en-IN" title="English">EN</button>
                <button class="lang-btn" data-lang="hi-IN" title="Hindi">HI</button>
                <button class="lang-btn" data-lang="gu-IN" title="Gujarati">GU</button>
            </div>
            <a href="#" class="nav-item" id="logoutBtn" style="color: #f87171;">
                <i class="fas fa-sign-out-alt"></i>
                <span>Logout</span>
            </a>
        </nav>
        <div class="sidebar-footer">
            <div class="user-chip">
                <div class="user-avatar"><i class="fa-solid fa-user-circle"></i></div>
                <div class="user-info">
                    <span class="user-name">${user ? user.name : 'Guest'}</span>
                    <span class="user-role">${user ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Logged Out'}</span>
                </div>
            </div>
        </div>
    </aside>
    <div class="sidebar-overlay" id="sidebarOverlay"></div>`;
}

async function updateSidebarRestaurantName() {
    if (!window.VoxAPI || !VoxAPI.isLoggedIn()) return;
    const user = VoxAPI.getUser();
    if (!user || !user.restaurantId) return;

    try {
        const res = await VoxAPI.getRestaurantById(user.restaurantId);
        if (res.ok && res.data.data) {
            const el = document.getElementById('sidebarRestaurantName');
            if (el) el.innerText = res.data.data.name;
        }
    } catch (e) { console.error('Failed to sync restaurant name:', e); }
}

function initSidebarBehavior() {
    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('sidebarToggle');
    const overlay = document.getElementById('sidebarOverlay');
    const mobileBtn = document.getElementById('mobileMenu');
    const mainEl = document.getElementById('main');

    if (!sidebar) return;

    // Trigger name sync
    updateSidebarRestaurantName();

    // UI Mode Toggle Logic
    const uiModeToggle = document.getElementById('ui-mode-toggle');
    if (uiModeToggle) {
        // Set correct label on load
        const savedMode = localStorage.getItem('vb_ui_mode') || 'classic';
        const label = uiModeToggle.querySelector('.ui-mode-label');
        if (label) {
            label.textContent = savedMode === 'smart' ? 'Classic Mode' : 'Smart Mode';
        }

        uiModeToggle.addEventListener('click', () => {
            const current = document.body.classList.contains('ui-smart') ? 'smart' : 'classic';
            const next = current === 'smart' ? 'classic' : 'smart';

            if (next === 'smart') {
                document.body.classList.add('ui-smart');
            } else {
                document.body.classList.remove('ui-smart');
            }

            localStorage.setItem('vb_ui_mode', next);

            if (label) {
                label.textContent = next === 'smart' ? 'Classic Mode' : 'Smart Mode';
            }
        });
    }

    // Language Switcher Logic
    const langBtns = document.querySelectorAll('.lang-btn');
    if (langBtns.length > 0) {
        const savedLang = localStorage.getItem('vb_voice_language') || 'en-IN';
        langBtns.forEach(btn => {
            if (btn.dataset.lang === savedLang) {
                btn.classList.add('active');
            }

            btn.addEventListener('click', (e) => {
                const targetLang = e.target.dataset.lang;
                localStorage.setItem('vb_voice_language', targetLang);

                langBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');

                // If speech recognition is active, we might want to restart it immediately
                if (window.managerRecognition && typeof window.managerRecognition.stop === 'function') {
                    window.managerRecognition.lang = targetLang;
                }
                if (window.waiterRecognition && typeof window.waiterRecognition.stop === 'function') {
                    window.waiterRecognition.lang = targetLang;
                }

                if (typeof showToast === 'function') {
                    showToast(`Language changed to ${e.target.innerText}`);
                }
            });
        });
    }

    // ── Restore persisted expanded state ──────────────────
    if (localStorage.getItem('vb_sidebar_expanded') === 'true' && window.innerWidth > 720) {
        sidebar.classList.add('expanded');
        mainEl && mainEl.classList.add('shifted');
    }

    // ── Desktop toggle ────────────────────────────────────
    if (toggle) {
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const expanded = sidebar.classList.toggle('expanded');
            mainEl && mainEl.classList.toggle('shifted', expanded);
            localStorage.setItem('vb_sidebar_expanded', expanded);
        });
    }

    // ── Mobile hamburger ──────────────────────────────────
    if (mobileBtn) {
        mobileBtn.addEventListener('click', () => {
            const open = sidebar.classList.toggle('mobile-open');
            overlay && overlay.classList.toggle('active', open);
        });
    }

    // ── Overlay close ─────────────────────────────────────
    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('mobile-open');
            overlay.classList.remove('active');
        });
    }

    // ── Highlight active nav by filename ──────────────────
    const currentFile = window.location.pathname.split('/').pop() || 'index.html';
    sidebar.querySelectorAll('.nav-item').forEach(item => {
        const href = (item.getAttribute('href') || '').split('#')[0].split('/').pop();
        if (href && href === currentFile) item.classList.add('active');
    });

    // ── Responsive resize handler ─────────────────────────
    window.addEventListener('resize', () => {
        if (window.innerWidth <= 720) {
            sidebar.classList.remove('expanded');
            mainEl && mainEl.classList.remove('shifted');
        } else {
            sidebar.classList.remove('mobile-open');
            overlay && overlay.classList.remove('active');
            if (localStorage.getItem('vb_sidebar_expanded') === 'true') {
                sidebar.classList.add('expanded');
                mainEl && mainEl.classList.add('shifted');
            }
        }
    });
}

/* ─────────────────────────────────────────
   TOPBAR BUILDER
───────────────────────────────────────── */
function buildTopbar(pageTitle) {
    return `
    <header class="topbar">
        <div class="topbar-left">
            <button class="mobile-menu-btn" id="mobileMenu"><i class="fa-solid fa-bars"></i></button>
            <div class="page-breadcrumb">
                <span class="breadcrumb-root">VoxBill</span>
                <i class="fa-solid fa-chevron-right"></i>
                <span class="breadcrumb-current">${pageTitle}</span>
            </div>
        </div>
        <div class="topbar-right">
            <div class="status-badge">
                <span class="status-dot"></span>
                <span>Online</span>
            </div>
            
            ${(window.VoxAPI && VoxAPI.isManager()) ? `
            <!-- Notifications Bell -->
            <div class="noti-wrapper" style="position: relative;">
                <button class="icon-btn-top" id="notiBell" title="Notifications">
                    <i class="fa-solid fa-bell"></i>
                    <span class="noti-badge" id="notiBadge" style="display:none">0</span>
                </button>
            </div>
            ` : ''}

            <a href="../pages/index.html" class="icon-btn-top" title="Go to Dashboard"><i class="fa-solid fa-house"></i></a>
        </div>
    </header>`;
}

/* ─────────────────────────────────────────
   TOAST NOTIFICATIONS
───────────────────────────────────────── */
function showToast(msg, type = 'success') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;display:flex;flex-direction:column;gap:0.5rem;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    const colors = { success: '#22D3EE', error: '#f87171', info: '#8B5CF6' };
    toast.style.cssText = `
        background: #111827; border: 1px solid ${colors[type] || colors.success};
        color: #f1f5f9; padding: 0.75rem 1.25rem; border-radius: 10px;
        font-size: 0.875rem; font-family: Inter, sans-serif;
        box-shadow: 0 4px 20px rgba(0,0,0,0.4);
        animation: slideInToast 0.3s ease both;
        display: flex; align-items: center; gap: 0.5rem;
    `;
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
    container.appendChild(toast);

    const style = document.getElementById('toastStyle');
    if (!style) {
        const s = document.createElement('style');
        s.id = 'toastStyle';
        s.textContent = '@keyframes slideInToast{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}';
        document.head.appendChild(s);
    }

    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 400); }, 3000);
}

/* ─────────────────────────────────────────
   SSE REAL-TIME NOTIFICATIONS (Fix 12)
───────────────────────────────────────── */
function initSSENotifications() {
    if (!window.VoxAPI || !VoxAPI.isLoggedIn()) return;
    const token = sessionStorage.getItem('vb_jwt');
    if (!token) return;

    const evtSource = new EventSource(
        `/api/notifications/stream?token=${encodeURIComponent(token)}`
    );

    evtSource.onopen = () => {
        console.log('%c🔔 Real-time notifications active', 'color:#22D3EE');
    };

    evtSource.onmessage = (e) => {
        try {
            const event = JSON.parse(e.data);

            // Only speak for managers
            const isManager = window.VoxAPI &&
                VoxAPI.isManager();

            function announceSSE(text) {
                if (!isManager) return;
                if (!window.speechSynthesis) return;
                // Don't interrupt manager voice
                // commands — only speak if not
                // already talking
                if (window.speechSynthesis
                    .speaking) return;
                const u = new SpeechSynthesisUtterance(
                    text);
                u.lang = 'en-IN';
                u.rate = 1.0;
                u.pitch = 1.1;
                u.volume = 1.0;
                window.speechSynthesis.speak(u);
            }

            // ── New order received ──────────────
            if (event.type === 'new_order') {
                const custPart = event.customerName
                    ? ` for ${event.customerName}`
                    : '';
                const waiterPart = event.waiterName
                    ? ` from ${event.waiterName}`
                    : '';
                const displayMsg = event.customerName
                    ? `New order: Table ${event.tableNumber} — ${event.customerName}`
                    : `New order: Table ${event.tableNumber} by ${event.waiterName}`;

                addNotification(
                    displayMsg, 'priority');

                // Speak the announcement
                announceSSE(
                    `Order received${custPart} ` +
                    `for Table ${event.tableNumber}` +
                    `${waiterPart}.`);

                if (typeof loadStatuses === 'function')
                    loadStatuses();
                if (typeof loadOrders === 'function')
                    loadOrders();
            }

            // ── Bill paid ───────────────────────
            if (event.type === 'order_paid') {
                const amount = event.total
                    ? event.total.toFixed(0) : 0;
                const displayMsg =
                    `Table ${event.tableNumber} ` +
                    `settled — ₹${amount}`;

                addNotification(
                    displayMsg, 'success');

                // Speak the announcement
                announceSSE(
                    `Bill paid for ` +
                    `Table ${event.tableNumber}. ` +
                    `Amount ${amount} rupees.`);

                if (typeof loadStatuses === 'function')
                    loadStatuses();
                if (typeof loadOrders === 'function')
                    loadOrders();
            }

            // ── Table ready for billing ─────────
            if (event.type === 'ready_for_billing') {
                const custPart = event.customerName
                    ? ` for ${event.customerName}` : '';
                const displayMsg =
                    `Table ${event.tableNumber}` +
                    `${custPart} ready for billing`;

                addNotification(
                    displayMsg, 'priority');

                announceSSE(
                    `Table ${event.tableNumber}` +
                    `${custPart} is ready for billing.`);

                if (typeof loadStatuses === 'function')
                    loadStatuses();
                if (typeof loadOrders === 'function')
                    loadOrders();
            }

        } catch (err) { }
    };

    evtSource.onerror = () => {
        console.warn('SSE disconnected. Will auto-reconnect.');
    };

    window._sseSource = evtSource;
}

function initManagerVoice() {
    if (!window.VoxAPI || !VoxAPI.isManager()) return;

    const btn = document.createElement('div');
    btn.id = 'managerVoiceBtn';
    btn.innerHTML = `
        <button id="mvBtn" title="Voice Command"
            style="
                position:fixed; bottom:2rem; right:2rem;
                width:56px; height:56px;
                background:linear-gradient(
                    135deg,#22D3EE,#8B5CF6);
                border:none; border-radius:50%;
                color:white; font-size:1.3rem;
                cursor:pointer; z-index:9998;
                box-shadow:0 4px 20px 
                    rgba(34,211,238,0.4);
                display:flex; align-items:center;
                justify-content:center;
                transition:all 0.3s ease;">
            <i class="fa-solid fa-microphone" 
               id="mvIcon"></i>
        </button>
        <div id="mvFeedback" style="
            position:fixed; bottom:6.5rem; right:1rem;
            background:#111827;
            border:1px solid rgba(34,211,238,0.3);
            color:#f1f5f9;
            padding:0.75rem 1rem;
            border-radius:12px;
            font-size:0.85rem;
            font-family:Inter,sans-serif;
            box-shadow:0 4px 20px rgba(0,0,0,0.4);
            max-width:300px; text-align:center;
            display:none; z-index:9997;
            line-height:1.5;">
        </div>
    `;
    document.body.appendChild(btn);

    const SpeechAPI = window.SpeechRecognition
        || window.webkitSpeechRecognition;
    if (!SpeechAPI) return;

    // ── Command recognition (main) ──────────
    const recognition = new SpeechAPI();
    window.managerRecognition = recognition;
    // Do NOT set window.recognition here —
    // voice_script.js uses window.recognition 
    // for waiter ordering and would conflict.
    // Manager recognition is accessed via 
    // window.managerRecognition only.
    recognition.continuous = false;
    recognition.interimResults = false;
    // Support 3 language modes
    const sysLang = localStorage.getItem('vb_voice_language') || 'en-IN';
    recognition.lang = sysLang;

    // ── Wake word recognition (always on) ───
    const wakeRecognition = new SpeechAPI();
    wakeRecognition.continuous = true;
    wakeRecognition.interimResults = true;
    // Pin wake listener to en-IN for best wake-word catch rate
    // (command recognition still follows user-selected language)
    wakeRecognition.lang = 'en-IN';

    let listening = false;
    let wakeActive = false;
    let commandTimeout = null;
    let wakeRestarting = false;

    const mvBtn = document.getElementById('mvBtn');
    const mvIcon = document.getElementById('mvIcon');
    const mvFeedback =
        document.getElementById('mvFeedback');

    /* ── Voice share state ── */
    let waitingForPhone = false;
    let pendingShareTableNum = null;

    /* ── Helpers ── */
    function showFeedback(msg, color) {
        color = color || '#22D3EE';
        mvFeedback.textContent = msg;
        mvFeedback.style.borderColor = color;
        mvFeedback.style.display = 'block';
        clearTimeout(mvFeedback._t);
        mvFeedback._t = setTimeout(() => {
            mvFeedback.style.display = 'none';
        }, 5000);
    }

    function getVoiceLanguage() {
        return localStorage.getItem(
            'vb_voice_language'
        ) || 'en-IN';
    }

    function speak(msg, callback) {
        if (!window.speechSynthesis) {
            console.warn('Vox: SpeechSynthesis not supported.');
            if (callback) callback();
            return;
        }
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(msg);
        u.lang = getVoiceLanguage();
        u.rate = 1.0;
        u.pitch = 1.0;

        let called = false;
        const done = () => {
            if (called) return;
            called = true;
            if (callback) callback();
        };

        u.onend = done;
        u.onerror = (e) => {
            console.error('Vox: Speech error:', e);
            done();
        };

        // Fallback for silence/blocked audio
        setTimeout(done, 3000);

        window.speechSynthesis.speak(u);
    }
    window.speak = speak;

    function go(path, label) {
        speak('Opening ' + label);
        showFeedback('Opening ' + label + '...', '#22D3EE');
        setTimeout(() => {
            window.location.href = path;
        }, 1200);
    }

    function has(t) {
        const words = Array.from(arguments).slice(1);
        return words.some(w => t.includes(w));
    }

    // ── Transcript normalizer ────────────────
    function normalizeTranscript(raw) {
        return raw
            .toLowerCase()
            .trim()
            .replace(/[.,!?'"]/g, '')
            .replace(/\s+/g, ' ');
    }

    // ── Wake phrase matcher ──────────────────
    // Multi-word phrases checked via .includes()
    // Single words checked via \b word-boundary
    // regex to avoid false positives (e.g.
    // "innovative" should NOT trigger "nova")
    const WAKE_PHRASES = [
        // Nova
        'hey nova', 'ok nova', 'hi nova',
        'hey nova ai', 'nova ai',
        // Voxi / Voxie  
        'hey voxi', 'ok voxi', 'hi voxi',
        'hey voxie', 'ok voxie', 'hi voxie',
        // VB fallback
        'hey vb', 'ok vb', 'hi vb',
        // Legacy
        'hey voxbill', 'ok voxbill',
        // Easy triggers
        'listen', 'suno', 'hey listen',
        'are you there', 'wake up'
    ];

    const WAKE_WORDS_SINGLE = [
        'nova', 'voxi', 'voxie',
        'vb', 'voxbill', 'assistant',
        'listen', 'suno'
    ];
    // Pre-compile regexes for single words
    const WAKE_WORD_REGEXES = WAKE_WORDS_SINGLE.map(
        w => new RegExp('\\b' + w + '\\b'));

    function isWakePhrase(normalized) {
        // 1. Check multi-word phrases first
        for (const phrase of WAKE_PHRASES) {
            if (normalized.includes(phrase)) return true;
        }
        // 2. Check single words with word boundaries
        for (const rx of WAKE_WORD_REGEXES) {
            if (rx.test(normalized)) return true;
        }
        return false;
    }

    // ── Wake word listener ───────────────────

    function startWakeListener() {
        if (wakeActive || listening) return;
        try {
            console.log('Vox: Starting Wake Listener...');
            wakeRecognition.start();
            wakeActive = true;
        } catch (e) {
            console.error('Vox: Wake start error:', e);
        }
    }

    function stopWakeListener() {
        try {
            console.log('Vox: Stopping Wake Listener...');
            wakeRecognition.stop();
            wakeActive = false;
        } catch (e) { }
    }

    wakeRecognition.onresult = (e) => {
        // Only use the LATEST result, not all
        // accumulated results joined together
        const latest = e.results[e.results.length - 1];
        const raw = latest[0].transcript;
        const transcript = normalizeTranscript(raw);

        // Debug log for manager to see what mic hears
        console.log('Vox Wake Listener:', transcript);

        // Stop command — stop speaking immediately
        if (transcript.includes('stop') ||
            transcript.includes('ruko') ||
            transcript.includes('bas') ||
            transcript.includes('chup') ||
            transcript.includes('band karo') ||
            transcript.includes('quiet') ||
            transcript.includes('silence')) {
            if (window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
            showFeedback(
                'Stopped.', '#94a3b8');
            return;
        }

        // Detect wake word using reliable matcher
        if (isWakePhrase(transcript)) {
            console.log('Vox: Wake word detected! Activating command mode.');
            stopWakeListener();
            activateCommandMode();
        }
    };

    wakeRecognition.onend = () => {
        console.log('Vox: Wake Listener ended.');
        wakeActive = false;
        // Auto restart wake listener after 500ms
        // unless command mode is active
        if (!listening && !wakeRestarting) {
            wakeRestarting = true;
            setTimeout(() => {
                wakeRestarting = false;
                startWakeListener();
            }, 500);
        }
    };

    wakeRecognition.onerror = (e) => {
        console.warn('Vox: Wake Listener error:', e.error);
        wakeActive = false;
        if (e.error === 'not-allowed' ||
            e.error === 'service-not-allowed') {
            console.warn('Vox: Mic permission denied. ' +
                'Cannot restart wake listener.');
            return;
        }
        // Restart on ALL other errors
        setTimeout(() => {
            if (!listening) startWakeListener();
        }, 1000);
    };

    // ── Activate command mode ────────────────

    function activateCommandMode() {
        if (listening) return;
        listening = true;

        // Visual feedback — button glows
        mvIcon.className = 'fa-solid fa-ear';
        mvBtn.style.background =
            'linear-gradient(135deg,#22c55e,#16a34a)';
        mvBtn.style.boxShadow =
            '0 4px 25px rgba(34,197,94,0.6)';
        mvBtn.style.transform = 'scale(1.15)';

        showFeedback(
            '👂 Listening for command...',
            '#22c55e');

        console.log('Vox: Speaking acknowledgement...');
        speak('Yes, I am listening', () => {
            console.log('Vox: Acknowledgement finished. Waiting 500ms before starting recognition...');

            // Short delay to ensure mic is free and user is ready
            setTimeout(() => {
                if (!listening) {
                    console.log('Vox: Not listening anymore, skipping recognition start.');
                    return;
                }
                console.log('Vox: Starting recognition now...');
                recognition.lang = getVoiceLanguage();
                try {
                    recognition.start();
                }
                catch (e) {
                    console.error('Vox: Command start error:', e);
                    deactivateCommandMode();
                }
            }, 500);
        });

        // Auto timeout after 10 seconds
        commandTimeout = setTimeout(() => {
            if (listening) {
                console.log('Vox: Command mode timed out.');
                deactivateCommandMode();
                showFeedback(
                    'No command heard. Say "Hey Nova" or "Hey Voxi" to activate again.',
                    '#94a3b8');
            }
        }, 10000);
    }

    function deactivateCommandMode() {
        console.log('Vox: Deactivating command mode.');
        listening = false;
        clearTimeout(commandTimeout);

        // Reset button appearance
        mvIcon.className = 'fa-solid fa-microphone';
        mvBtn.style.background =
            'linear-gradient(135deg,#22D3EE,#8B5CF6)';
        mvBtn.style.boxShadow =
            '0 4px 20px rgba(34,211,238,0.4)';
        mvBtn.style.transform = 'scale(1)';

        // Restart wake listener
        setTimeout(() => {
            startWakeListener();
        }, 800);
    }

    // ── Manual mic button click ──────────────
    // Manager can still click button manually

    mvBtn.addEventListener('click', () => {
        console.log('Vox: Manual button clicked.');
        if (listening) {
            // Stop command mode
            try { recognition.stop(); } catch (e) { }
            deactivateCommandMode();
            showFeedback(
                'Stopped. Say "Hey Nova" or "Hey Voxi" to activate.',
                '#94a3b8');
        } else {
            // Manually activate command mode
            stopWakeListener();
            activateCommandMode();
        }
    });

    // ── Command recognition events ───────────

    recognition.onstart = () => {
        console.log('Vox: Command recognition started.');
        mvIcon.className = 'fa-solid fa-stop';
        mvBtn.style.background =
            'linear-gradient(135deg,#f59e0b,#ef4444)';
        mvBtn.style.boxShadow =
            '0 4px 20px rgba(239,68,68,0.5)';
        mvBtn.style.transform = 'scale(1.1)';
    };

    recognition.onresult = (e) => {
        clearTimeout(commandTimeout);
        let t = e.results[0][0].transcript
            .toLowerCase().trim().replace(/[.,!?]/g, '');

        // Strip wake words if they bled into command
        // (longest phrases first so "hey nova ai" is
        // stripped before "nova")
        const wakeStrip = [
            'hey nova ai', 'nova ai',
            'hey nova', 'ok nova', 'hi nova',
            'hey voxi', 'ok voxi', 'hi voxi',
            'hey voxie', 'ok voxie', 'hi voxie',
            'hey vb', 'ok vb', 'hi vb',
            'hey voxbill', 'ok voxbill',
            'nova', 'voxi', 'voxie',
            'vb', 'voxbill', 'assistant'
        ];
        for (const w of wakeStrip) {
            if (t.startsWith(w)) {
                t = t.slice(w.length).trim();
            }
            t = t.replace(w, '').trim();
        }

        // If nothing left after stripping,
        // it means mic caught the wake word itself
        // as a command — ignore it
        if (!t || t.length < 2) {
            console.log(
                'Vox: Empty command after strip, ignoring');
            return;
        }

        console.log(
            'Vox Command Recognition Result:', t);
        showFeedback('"' + t + '"', '#8B5CF6');
        handleCommand(t);

        // Stay active for 5 seconds so manager
        // can say another command immediately
        listening = false;
        clearTimeout(commandTimeout);

        // Show green ready state
        mvIcon.className = 'fa-solid fa-ear';
        mvBtn.style.background =
            'linear-gradient(135deg,#22c55e,#16a34a)';
        mvBtn.style.boxShadow =
            '0 4px 25px rgba(34,197,94,0.6)';
        mvBtn.style.transform = 'scale(1.1)';
        showFeedback(
            '👂 Say another command or wait 5 seconds...',
            '#22c55e');

        // Use a flag to track the stay-active window
        let stayActiveWindow = true;

        // After 5 seconds go back to sleep
        commandTimeout = setTimeout(() => {
            stayActiveWindow = false;
            mvIcon.className = 'fa-solid fa-microphone';
            mvBtn.style.background =
                'linear-gradient(135deg,#22D3EE,#8B5CF6)';
            mvBtn.style.boxShadow =
                '0 4px 20px rgba(34,211,238,0.4)';
            mvBtn.style.transform = 'scale(1)';
            mvFeedback.style.display = 'none';
            startWakeListener();
        }, 5000);

        // After a short delay, listen for
        // the next command automatically
        setTimeout(() => {
            if (stayActiveWindow &&
                !listening && !wakeActive) {
                recognition.lang = localStorage.getItem('vb_voice_language') || 'en-IN';
                try {
                    // Use a separate flag so
                    // onend does not deactivate
                    recognition._stayActive = true;
                    recognition.start();
                } catch (e) {
                    console.log(
                        'Vox: Could not restart for ' +
                        'stay-active window');
                }
            }
        }, 1200);
    };

    recognition.onend = () => {
        console.log('Vox: Command recognition ended.');
        if (recognition._stayActive) {
            // This was the stay-active listen —
            // do not deactivate, just clear flag
            recognition._stayActive = false;
            return;
        }
        if (listening) {
            deactivateCommandMode();
        }
    };

    recognition.onerror = (e) => {
        console.warn('Vox: Command recognition error:', 
            e.error);
        // Ignore aborted — happens normally
        if (e.error === 'aborted') return;
        showFeedback('Mic error: ' + e.error, '#f87171');
        deactivateCommandMode();
    };

    // ── Start wake listener on load ──────────
    // Small delay to let page fully load first
    setTimeout(() => {
        startWakeListener();
    }, 2000);

    // Health check — restart if wake listener dies
    setInterval(() => {
        if (!listening && !wakeActive && !wakeRestarting) {
            console.log('Vox: Health check — ' +
                'restarting dead wake listener');
            startWakeListener();
        }
    }, 10000);

    /* ════════════════════════════════════════
       COMMAND HANDLER
    ════════════════════════════════════════ */
    function handleCommand(t) {
        // Normalize using VoxIntentParser if available
        if (window.VoxIntentParser && 
            typeof VoxIntentParser.normalize === 'function') {
            t = VoxIntentParser.normalize(t);
        }

        // ── PHONE NUMBER COLLECTION (step 2) ─────
        if (waitingForPhone) {
            // Cancel escape
            if (/cancel|never mind|ruko|band karo/i.test(t)) {
                waitingForPhone = false;
                pendingShareTableNum = null;
                speak('Cancelled.');
                showFeedback('Cancelled.', '#94a3b8');
                return;
            }

            waitingForPhone = false;
            // Convert spoken word-numbers to digits
            const wordToDigit = {
                'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
                'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9'
            };
            let raw = t.trim().toLowerCase();
            raw = raw.replace(
                /\b(zero|one|two|three|four|five|six|seven|eight|nine)\b/g,
                m => wordToDigit[m]);
            const digits = raw.replace(/\D/g, '');

            if (digits.length < 10) {
                speak('I could not get a valid phone number. ' +
                    'Please try again and say share bill.');
                showFeedback(
                    'Invalid number. Say "share bill" to retry.',
                    '#f87171');
                pendingShareTableNum = null;
                return;
            }

            // Take last 10 digits (handles country code)
            const phone = digits.slice(-10);
            const tableNum = pendingShareTableNum;
            pendingShareTableNum = null;

            speak(`Sharing bill for Table ${tableNum} to ` +
                `${phone.split('').join(' ')}.`);
            showFeedback(
                `Sending to ${phone}...`, '#25D366');

            // Fetch the order and share as image
            VoxAPI.getOrders('today').then(async r => {
                if (!r.ok || !r.data || !r.data.data) {
                    speak('Could not fetch the bill. Please try again.');
                    showFeedback('Error fetching bill.', '#f87171');
                    return;
                }
                const order = r.data.data.find(o =>
                    String(o.tableNumber) === String(tableNum) &&
                    o.status !== 'paid');
                if (!order) {
                    speak(`No open bill found for Table ${tableNum}.`);
                    showFeedback(
                        `No open bill for Table ${tableNum}`,
                        '#f87171');
                    return;
                }

                // Use image sharing if available, fall back to text
                if (window.shareInvoiceToWhatsApp) {
                    await window.shareInvoiceToWhatsApp(order, phone, 'png');
                    showFeedback('Bill shared via WhatsApp ✅', '#22c55e');
                } else {
                    // Fallback: plain text WhatsApp
                    const settings = VB.getSettings();
                    let msg = `*${settings.restaurantName || 'VoxBill'} — Bill*\n`;
                    msg += `Table: ${tableNum}\n`;
                    if (order.customerName)
                        msg += `Customer: ${order.customerName}\n`;
                    msg += `\n*Items:*\n`;
                    (order.items || []).forEach(item => {
                        msg += `${item.item} ×${item.qty}  ₹${item.price * item.qty}\n`;
                    });
                    msg += `\n*Total: ₹${order.total}*\n`;
                    msg += `\nThank you for dining with us!`;
                    window.open(`https://wa.me/91${phone}?text=` +
                        encodeURIComponent(msg), '_blank');
                    speak(`Bill sent to ${phone.slice(-4).split('').join(' ')}.`);
                    showFeedback('Bill shared via WhatsApp ✅', '#22c55e');
                }
            }).catch(() => {
                speak('Could not fetch the bill. Please try again.');
                showFeedback('Error fetching bill.', '#f87171');
            });

            return;
        }

        // ── INTRO / SYSTEM COMMANDS ──────────────
        const isIntro = has(t,
            'what is your name', 'who are you', 'are you voxbill', 'what is voxbill ai',
            'tum kaun ho', 'tame kon cho', 'aap kaun hain', 'tera naam kya hai', 'tamaru naam su chhe',
            'who built you', 'who made you', 'what do you do', 'what is your work', 'how do you work',
            'how can you help', 'what can you do for my restaurant', 'what commands do you understand',
            'which languages do you support', 'introduce yourself', 'tell me about yourself',
            'how do waiters use you', 'how do managers use you', 'why should i use voxbill');

        if (isIntro) {
            let reply = '';
            const curLang = localStorage.getItem('vb_voice_language');

            if (curLang === 'hi-IN') {
                if (has(t, 'who built you', 'who made you', 'kisne banaya')) {
                    reply = 'Mujhe Rishi Charadva ne banaya hai.';
                } else if (has(t, 'what do you do', 'why should i use', 'kya kaam')) {
                    reply = 'Main voice commands ke zariye restaurant orders lene aur billing ko aasan banane ka kaam karta hoon.';
                } else if (has(t, 'languages', 'kaunsi bhasha', 'bhasha')) {
                    reply = 'Main English, Hindi, aur Gujarati samajh sakta hoon.';
                } else {
                    reply = 'Main VoxBill ka voice assistant hoon. Main aapke restaurant manage karne mein madad karunga.';
                }
            } else if (curLang === 'gu-IN') {
                if (has(t, 'who built you', 'who made you', 'kone banavyo')) {
                    reply = 'Mane Rishi Charadva e banavyo chhe.';
                } else if (has(t, 'what do you do', 'why should i use', 'su kaam')) {
                    reply = 'Hu voice orders lau chhu ane billing ne saral banavu chhu.';
                } else if (has(t, 'languages', 'kai bhasha', 'bhasha')) {
                    reply = 'Hu English, Hindi, ane Gujarati samji saku chhu.';
                } else {
                    reply = 'Hu VoxBill no voice assistant chhu. Hu tamara restaurant ne manage karvama madad karish.';
                }
            } else {
                if (has(t, 'who built you', 'who made you')) {
                    reply = 'I am built by Rishi Charadva.';
                } else if (has(t, 'what do you do', 'introduce yourself', 'about yourself', 'why should i use')) {
                    reply = 'My work is to take restaurant orders by voice and make billing easier for restaurant owners and waiters.';
                } else if (has(t, 'how do you work', 'how do waiters use', 'how do managers use')) {
                    reply = 'I work by listening to voice commands, understanding orders, and helping manage tables, billing, staff, and menu operations.';
                } else if (has(t, 'how can you help', 'what commands')) {
                    reply = 'I can help with taking orders, checking table status, managing bills, tracking staff, and answering restaurant workflow questions.';
                } else if (has(t, 'languages')) {
                    reply = 'I support English, Hindi, and Gujarati voice interaction.';
                } else {
                    reply = 'I am the voice assistant of VoxBill. I am here to help you manage the restaurant.';
                }
            }

            speak(reply);
            showFeedback(reply, '#22D3EE');
            return;
        }

        // ── ON THE FLY LANGUAGE SWITCHING ────────
        const isSwitchHi = has(t, 'switch to hindi', 'hindi me bolo', 'speak in hindi', 'use hindi');
        const isSwitchGu = has(t, 'switch to gujarati', 'gujarati ma bolo', 'speak in gujarati', 'use gujarati');
        const isSwitchEn = has(t, 'switch to english', 'english me bolo', 'english ma bolo', 'speak in english', 'use english');

        if (isSwitchHi || isSwitchGu || isSwitchEn) {
            let targetLang = isSwitchHi ? 'hi-IN' : (isSwitchGu ? 'gu-IN' : 'en-IN');

            localStorage.setItem('vb_voice_language', targetLang);
            if (window.managerRecognition) window.managerRecognition.lang = targetLang;

            // Sync UI toggle buttons if they exist
            document.querySelectorAll('.lang-btn').forEach(b => {
                b.classList.remove('active');
                if (b.dataset.lang === targetLang) b.classList.add('active');
            });

            if (targetLang === 'hi-IN') {
                speak('Theek hai, ab main Hindi mein baat karunga.');
                showFeedback('Switched to Hindi', '#8B5CF6');
            } else if (targetLang === 'gu-IN') {
                speak('Barabar, have hu Gujarati ma vaat karish.');
                showFeedback('Switched to Gujarati', '#8B5CF6');
            } else {
                speak('Alright, I will now speak in English.');
                showFeedback('Switched to English', '#8B5CF6');
            }
            return;
        }

        // ── MARK PAID / SETTLE / CLOSE ───────────
        const markPaidMatch = t.match(/mark\s+table\s+(\d+)\s+paid/i) || t.match(/table\s+(\d+)\s+paid/i)
            || t.match(/settle\s+table\s+(\d+)/i) || t.match(/close\s+table\s+(\d+)\s+bill/i);
        if (markPaidMatch) {
            const tableNum = markPaidMatch[1];
            speak(`Marking table ${tableNum} as paid.`);
            showFeedback(`Marking Table ${tableNum} Paid...`, '#22c55e');
            VoxAPI.getOrders('today').then(r => {
                const order = (r?.data?.data || []).find(o => String(o.tableNumber) === String(tableNum) && o.status !== 'paid');
                if (order && order._id) {
                    VoxAPI.settleOrder(order._id, { paymentMethod: 'cash' }).then(res => {
                        if (res.ok) {
                            speak(`Table ${tableNum} is now paid.`);
                            showFeedback(`Table ${tableNum} Paid`, '#22c55e');
                            if (typeof loadStatuses === 'function') loadStatuses();
                            if (typeof loadOrders === 'function') loadOrders();
                        } else {
                            speak(`Failed to mark table ${tableNum} paid.`);
                            showFeedback(`Failed to update`, '#f87171');
                        }
                    });
                } else {
                    let localOrders = [];
                    try { localOrders = JSON.parse(localStorage.getItem('vb_orders') || '[]'); } catch (e) { }
                    const localOrder = localOrders.find(o => String(o.tableNumber) === String(tableNum) && o.status !== 'paid');
                    if (localOrder) {
                        localOrder.status = 'paid';
                        localStorage.setItem('vb_orders', JSON.stringify(localOrders));
                        speak(`Table ${tableNum} is now paid locally.`);
                        showFeedback(`Table ${tableNum} Paid (Local)`, '#22c55e');
                        if (typeof loadStatuses === 'function') loadStatuses();
                        if (typeof loadOrders === 'function') loadOrders();
                    } else {
                        speak(`No unpaid order found for table ${tableNum}.`);
                        showFeedback(`No unpaid order for Table ${tableNum}`, '#f87171');
                    }
                }
            });
            return;
        }

        // ── OPEN TABLE BILL ──────────────────────
        const openBillMatch = t.match(/open\s+table\s+(\d+)\s+bill/i) || t.match(/open\s+bill\s+for\s+table\s+(\d+)/i)
            || t.match(/(?:show|view)\s+table\s+(\d+)\s+invoice/i) || t.match(/view\s+bill\s+(?:of|for)\s+table\s+(\d+)/i);
        if (openBillMatch && !has(t, 'generate', 'print', 'share')) {
            const tableNum = openBillMatch[1];
            speak(`Opening bill for table ${tableNum}`);
            showFeedback(`Opening Table ${tableNum} Bill...`, '#22D3EE');
            setTimeout(() => {
                window.location.href = `../pages/orders.html?table=${tableNum}`;
            }, 1200);
            return;
        }

        // ── TABLES NEED ATTENTION / DELAYED ──────
        if (has(t, 'tables need attention', 'which tables need attention', 'which orders are delayed', 'delayed orders')) {
            VoxAPI.getOrders('today').then(r => {
                if (!r.ok || !r.data || !r.data.data) {
                    speak('Could not fetch orders');
                    return;
                }
                const active = r.data.data.filter(o => o.status !== 'paid');
                if (active.length === 0) {
                    speak('No active orders right now');
                    showFeedback('No active orders', '#94a3b8');
                    return;
                }
                const delayed = active.filter(o => {
                    const mins = Math.floor((Date.now() - new Date(o.createdAt)) / 60000);
                    return mins > 15;
                });

                if (delayed.length === 0) {
                    speak('No orders are currently delayed beyond 15 minutes.');
                    showFeedback('No delayed orders', '#22c55e');
                } else {
                    const tables = delayed.map(o => `Table ${o.tableNumber}`).join(', ');
                    speak(`${delayed.length} tables need attention: ${tables}`);
                    showFeedback(`${delayed.length} Delayed: ${tables}`, '#f59e0b');
                }
            });
            return;
        }

        /* ── 0. SHORT NATURAL COMMANDS ─────────── */

        // Stop — cancel any ongoing speech
        if (t === 'stop' || t === 'ruko' ||
            t === 'bas karo' || t === 'chup' ||
            t === 'quiet' || t === 'silence' ||
            t === 'band karo') {
            if (window.speechSynthesis) {
                window.speechSynthesis.cancel();
            }
            showFeedback('Stopped.', '#94a3b8');
            return;
        }

        /* ── 1. NAVIGATION ──────────────────────── */

        // Tables page
        if (has(t, 'table page', 'tables page',
            'open table', 'open tables',
            'go to table', 'go to tables',
            'table status', 'floor')) {
            // Only navigate — don't confuse with
            // "which tables" info queries below
            if (!has(t, 'which', 'available', 'free',
                'ready', 'pending', 'booked',
                'busy', 'active', 'occupied',
                'staff', 'working')) {
                go('../pages/tables.html', 'Tables');
                return;
            }
        }

        // Dashboard
        if (has(t, 'dashboard', 'home page',
            'open dashboard', 'go to dashboard',
            'main page', 'back to home')) {
            go('../pages/index.html', 'Dashboard');
            return;
        }

        // Analytics
        if (has(t, 'open analytics',
            'go to analytics', 'analytics page',
            'business report')) {
            go('../pages/analytics.html', 'Analytics');
            return;
        }

        // Settings
        if (has(t, 'open settings',
            'go to settings',
            'settings page')) {
            go('../pages/settings.html', 'Settings');
            return;
        }

        // Orders
        if (has(t, 'orders page', 'open orders',
            'go to orders', 'billing page',
            'go to billing', 'open billing')) {
            go('../pages/orders.html', 'Orders');
            return;
        }

        // Menu
        if (has(t, 'menu page', 'open menu',
            'go to menu', 'food menu',
            'menu management')) {
            go('../pages/menu.html', 'Menu');
            return;
        }

        // Staff
        if (has(t, 'staff page', 'open staff',
            'go to staff', 'staff management')) {
            // Avoid conflict with "which staff" below
            if (!has(t, 'which', 'working',
                'who', 'kaun')) {
                go('../pages/staff.html', 'Staff');
                return;
            }
        }

        /* ── 2. TABLE STATUS QUERIES ────────────── */

        // Which tables are AVAILABLE / FREE
        const availTableMatch = t.match(/(?:which|what|how\s+many)?\s*tables?\s*(?:are|is)?\s*(?:available|free|empty|vacant|khali)/i) ||
            t.match(/(?:available|free|empty|vacant|khali)\s*tables?/i);
        if (availTableMatch) {
            VoxAPI.getTablesStatus().then(r => {
                if (!r.ok || !r.data || !r.data.data) {
                    speak('Could not fetch table status');
                    return;
                }
                const statuses = r.data.data;
                const available = [];
                for (let i = 1; i <= 20; i++) {
                    const s = statuses[i];
                    const status = typeof s === 'object'
                        ? s.status : s;
                    if (!s || status === 'available') {
                        available.push(i);
                    }
                }
                if (available.length === 0) {
                    speak('No tables are available right now. All tables are occupied.');
                    showFeedback(
                        'No tables available right now',
                        '#f87171');
                } else {
                    const list = available.join(', ');
                    speak(`${available.length} tables are available: Table ${list}`);
                    showFeedback(
                        `Available tables: ${list}`,
                        '#22c55e');
                }
            });
            return;
        }

        // Which tables are READY FOR BILLING
        if (has(t, 'ready for billing', 'ready to bill',
            'bill ready', 'billing ready',
            'waiting for bill', 'need bill',
            'tables ready')) {
            VoxAPI.getOrders('today').then(r => {
                if (!r.ok || !r.data || !r.data.data) {
                    speak('Could not fetch orders');
                    return;
                }
                const ready = r.data.data.filter(
                    o => o.status === 'ready_for_billing');
                if (ready.length === 0) {
                    speak('No tables are ready for billing right now.');
                    showFeedback(
                        'No tables ready for billing',
                        '#94a3b8');
                } else {
                    const tables = ready.map(
                        o => `Table ${o.tableNumber}`)
                        .join(', ');
                    speak(`${ready.length} table${ready.length > 1 ? 's are' : ' is'} ready for billing: ${tables}`);
                    showFeedback(
                        `Ready for billing: ${tables}`,
                        '#22c55e');
                }
            });
            return;
        }

        // Which tables are PENDING / ORDERING / DRAFT
        if (has(t, 'pending tables', 'pending orders',
            'still ordering', 'in progress orders',
            'which tables are ordering', 'draft tables',
            'in progress', 'ordering tables')) {
            VoxAPI.getOrders('today').then(r => {
                if (!r.ok || !r.data || !r.data.data) {
                    speak('Could not fetch orders');
                    return;
                }
                const pending = r.data.data.filter(
                    o => o.status === 'ordering' ||
                        o.status === 'draft');
                if (pending.length === 0) {
                    speak('No tables are currently ordering or have drafts.');
                    showFeedback(
                        'No pending orders right now',
                        '#94a3b8');
                } else {
                    const tables = pending.map(
                        o => `Table ${o.tableNumber} (${o.status})`)
                        .join(', ');
                    speak(`${pending.length} table${pending.length > 1 ? 's are' : ' is'} in progress: ${tables}`);
                    showFeedback(
                        `In progress: ${tables}`,
                        '#f59e0b');
                }
            });
            return;
        }

        // Which tables are BOOKED / OCCUPIED / BUSY
        if (has(t, 'occupied tables', 'booked tables',
            'busy tables', 'all tables',
            'kitni tables', 'how many tables')) {
            VoxAPI.getTablesStatus().then(r => {
                if (!r.ok || !r.data || !r.data.data) {
                    speak('Could not fetch table status');
                    return;
                }
                const statuses = r.data.data;
                const occupied = [];
                for (let i = 1; i <= 20; i++) {
                    const s = statuses[i];
                    const status = typeof s === 'object'
                        ? s.status : s;
                    if (s && status !== 'available') {
                        occupied.push(i);
                    }
                }
                if (occupied.length === 0) {
                    speak('No tables are occupied right now. All tables are free.');
                    showFeedback(
                        'All tables are free',
                        '#22c55e');
                } else {
                    const list = occupied.join(', ');
                    speak(`${occupied.length} table${occupied.length > 1 ? 's are' : ' is'} occupied: Table ${list}`);
                    showFeedback(
                        `Occupied tables: ${list}`,
                        '#f59e0b');
                }
            });
            return;
        }

        /* ── 3. STAFF ON TABLES ─────────────────── */

        if (has(t, 'which staff', 'who is working',
            'staff working', 'waiter working',
            'kaun sa waiter', 'kaun kaam kar raha',
            'staff on table', 'who is on table',
            'waiter on table', 'which waiter')) {
            VoxAPI.getOrders('today').then(r => {
                if (!r.ok || !r.data || !r.data.data) {
                    speak('Could not fetch orders');
                    return;
                }
                const active = r.data.data.filter(
                    o => o.status !== 'paid' &&
                        o.waiterName);
                if (active.length === 0) {
                    speak('No staff are currently serving any tables.');
                    showFeedback(
                        'No active staff on tables',
                        '#94a3b8');
                } else {
                    // Group by waiter name
                    const byWaiter = {};
                    active.forEach(o => {
                        const name = o.waiterName || 'Unknown';
                        if (!byWaiter[name]) {
                            byWaiter[name] = [];
                        }
                        byWaiter[name].push(o.tableNumber);
                    });
                    const summary = Object.entries(byWaiter)
                        .map(([name, tables]) =>
                            `${name} is on Table ${tables.join(' and ')}`)
                        .join('. ');
                    speak(summary);
                    const feedbackText = Object.entries(byWaiter)
                        .map(([name, tables]) =>
                            `${name} → Table ${tables.join(', ')}`)
                        .join(' | ');
                    showFeedback(feedbackText, '#8B5CF6');
                }
            });
            return;
        }

        /* ── 4. SHARE BILL (two-step phone flow) ── */

        if (/share.*bill|send.*bill.*whatsapp|whatsapp.*bill|bill.*whatsapp|share.*table|bill\s*share\s*karo|share\s*karo\s*bill|bill\s*bhejo/i.test(t)) {
            const tableMatch = t.match(/table\s*(\d+)/i);
            const openOrder = window.selectedOrder || null;
            const currentOpenTable = openOrder
                ? String(openOrder.tableNumber) : null;
            pendingShareTableNum = tableMatch
                ? tableMatch[1] : currentOpenTable;

            if (!pendingShareTableNum) {
                speak('Which table? Say share bill table 5.');
                showFeedback(
                    'Say: "share bill table 5"',
                    '#f59e0b');
                return;
            }

            waitingForPhone = true;
            speak('Give the phone number to which ' +
                'you like to share the bill.');
            showFeedback(
                'Waiting for phone number...',
                '#8B5CF6');
            return;
        }

        /* ── 4.1 PRINT / GENERATE BILL ─────────── */

        if (has(t, 'generate bill', 'print bill',
            'print the bill', 'generate the bill',
            'bill print', 'bill generate',
            'bill nikalo', 'bill dikhao',
            'print invoice', 'print receipt')) {

            // Extract table number from speech
            const tableMatch = t.match(
                /table\s*(\d+)|(\d+)\s*(?:ka|ke|ki)?\s*(?:bill|table)/i
            );
            const spokenTable = tableMatch
                ? (tableMatch[1] || tableMatch[2])
                : null;

            // If bill is already open on orders page
            const openOrder = window.selectedOrder || null;
            const onOrdersPage = window.location.pathname
                .includes('orders.html');

            if (openOrder && onOrdersPage) {
                const settings = VB.getSettings();
                const tNum = openOrder.tableNumber;
                speak(`Printing bill for Table ${tNum}`);
                showFeedback(
                    `Printing Table ${tNum}...`,
                    '#22D3EE');
                setTimeout(() => {
                    if (window.printInvoice) {
                        window.printInvoice(
                            openOrder, settings);
                    }
                }, 1000);
                return;
            }

            if (spokenTable) {
                speak(`Looking up Table ${spokenTable}`);
                showFeedback(
                    `Looking up Table ${spokenTable}...`,
                    '#8B5CF6');
                VoxAPI.getOrders('today').then(r => {
                    if (!r.ok || !r.data || !r.data.data) {
                        speak('Could not fetch orders');
                        return;
                    }
                    const order = r.data.data.find(o =>
                        String(o.tableNumber) ===
                        String(spokenTable));
                    if (!order) {
                        speak(`Table ${spokenTable} has no active order`);
                        showFeedback(
                            `Table ${spokenTable} — No order found`,
                            '#f87171');
                        return;
                    }
                    if (order.status === 'ordering' ||
                        order.status === 'draft') {
                        speak(`Table ${spokenTable} order is still in progress. Bill is not ready yet.`);
                        showFeedback(
                            `Table ${spokenTable} — Still ordering`,
                            '#f59e0b');
                        return;
                    }
                    if (order.status === 'paid') {
                        speak(`Table ${spokenTable} bill has already been paid`);
                        showFeedback(
                            `Table ${spokenTable} — Already paid`,
                            '#94a3b8');
                        return;
                    }
                    speak(`Opening Table ${spokenTable} bill`);
                    showFeedback(
                        `Opening Table ${spokenTable} bill...`,
                        '#22D3EE');
                    setTimeout(() => {
                        window.location.href =
                            `../pages/orders.html?table=${spokenTable}`;
                    }, 1200);
                });
                return;
            }

            speak('Which table? Say print bill table 5, or open the bill first on orders page');
            showFeedback(
                'Say: "print bill table 5" or open a bill on orders page first',
                '#f59e0b');
            return;
        }

        /* ── 4.5. REMOTE TABLE ACTIONS (PHASE 2) ── */

        // Cancel order remotely
        const cancelOpenMatch = t.match(/(?:cancel|delete|remove)\s+(?:table\s+(\d+)\s+order|order\s+for\s+table\s+(\d+))/i);
        if (cancelOpenMatch) {
            const tableNum = cancelOpenMatch[1] || cancelOpenMatch[2];
            speak(`Cancelling order for table ${tableNum}`);
            showFeedback(`Cancelling Table ${tableNum}...`, '#ef4444');

            VoxAPI.getOrders('today').then(r => {
                const order = (r?.data?.data || []).find(o => String(o.tableNumber) === String(tableNum) && o.status !== 'paid');
                if (order && order._id) {
                    VoxAPI.updateOrder(order._id, { status: 'cancelled' }).then(res => {
                        if (res.ok) {
                            speak(`Order for table ${tableNum} has been cancelled.`);
                            showFeedback(`Table ${tableNum} Cancelled`, '#ef4444');
                            if (typeof loadStatuses === 'function') loadStatuses();
                            if (typeof loadOrders === 'function') loadOrders();
                        } else {
                            speak(`Failed to cancel table ${tableNum}.`);
                            showFeedback(`Failed to Cancel`, '#f87171');
                        }
                    });
                } else {
                    speak(`No active order found for table ${tableNum}.`);
                    showFeedback(`No active order for Table ${tableNum}`, '#f87171');
                }
            });
            return;
        }

        // Assign staff to table remotely
        const assignMatch = t.match(/assign\s+([a-z\s]+)\s+to\s+table\s+(\d+)/i);
        if (assignMatch) {
            const staffNameRaw = assignMatch[1].trim();
            const staffName = staffNameRaw.charAt(0).toUpperCase() + staffNameRaw.slice(1);
            const tableNum = assignMatch[2];

            speak(`Assigning ${staffName} to table ${tableNum}`);
            showFeedback(`Assigning Table ${tableNum} to ${staffName}...`, '#8B5CF6');

            VoxAPI.getOrders('today').then(r => {
                const order = (r?.data?.data || []).find(o => String(o.tableNumber) === String(tableNum) && o.status !== 'paid');
                if (order && order._id) {
                    VoxAPI.updateOrder(order._id, { waiterName: staffName }).then(res => {
                        if (res.ok) {
                            speak(`Table ${tableNum} is now assigned to ${staffName}.`);
                            showFeedback(`Assigned: ${staffName} → Table ${tableNum}`, '#8B5CF6');
                            if (typeof loadStatuses === 'function') loadStatuses();
                            if (typeof loadOrders === 'function') loadOrders();
                        } else {
                            speak(`Failed to assign table ${tableNum}.`);
                            showFeedback(`Failed to Assign`, '#f87171');
                        }
                    });
                } else {
                    speak(`No active order found for table ${tableNum}.`);
                    showFeedback(`No active order for Table ${tableNum}`, '#f87171');
                }
            });
            return;
        }

        // Remote discount
        const remoteDiscMatch = t.match(/(?:apply|give|set)\s+(\d+)\s*(?:percent|%|rupee|rupees)?\s+discount\s+(?:on|for)\s+table\s+(\d+)/i);
        if (remoteDiscMatch) {
            const discAmt = parseFloat(remoteDiscMatch[1]);
            const tableNum = remoteDiscMatch[2];

            speak(`Applying ${discAmt} discount on table ${tableNum}`);
            showFeedback(`Applying Discount on Table ${tableNum}...`, '#f59e0b');

            VoxAPI.getOrders('today').then(r => {
                const order = (r?.data?.data || []).find(o => String(o.tableNumber) === String(tableNum) && o.status !== 'paid');
                if (order && order._id) {
                    // Update the order subtotal/total math
                    const subtotal = order.subtotal || 0;
                    const gst = order.gst || 0;
                    const total = subtotal - discAmt + gst;

                    VoxAPI.updateOrder(order._id, { discountAmt: discAmt, total: total }).then(res => {
                        if (res.ok) {
                            speak(`Discount of ${discAmt} applied to table ${tableNum}.`);
                            showFeedback(`Discount Applied: Table ${tableNum}`, '#f59e0b');
                            if (typeof loadOrders === 'function') loadOrders();
                        } else {
                            speak(`Failed to apply discount to table ${tableNum}.`);
                            showFeedback(`Failed to Apply Discount`, '#f87171');
                        }
                    });
                } else {
                    speak(`No active order found for table ${tableNum}.`);
                    showFeedback(`No active order for Table ${tableNum}`, '#f87171');
                }
            });
            return;
        }

        // Remote GST
        const remoteGstMatch = t.match(/(?:apply|set|add)\s+(?:gst|tax)\s*(\d+)\s*(?:percent|%)?\s*(?:on|to|for)\s+table\s+(\d+)/i) ||
            t.match(/(?:apply|set|add)\s+(\d+)\s*(?:percent|%)?\s*(?:gst|tax)\s*(?:on|to|for)\s+table\s+(\d+)/i);
        if (remoteGstMatch) {
            const newGst = parseFloat(remoteGstMatch[1]);
            const tableNum = remoteGstMatch[2];

            speak(`Applying ${newGst} percent GST on table ${tableNum}`);
            showFeedback(`Applying GST on Table ${tableNum}...`, '#f59e0b');

            VoxAPI.getOrders('today').then(r => {
                const order = (r?.data?.data || []).find(o => String(o.tableNumber) === String(tableNum) && o.status !== 'paid');
                if (order && order._id) {
                    const subtotal = order.subtotal || 0;
                    const disc = order.discountAmt || 0;
                    const gstAmt = (subtotal - disc) * (newGst / 100);
                    const total = subtotal - disc + gstAmt;

                    VoxAPI.updateOrder(order._id, { gst: gstAmt, total: total }).then(res => {
                        if (res.ok) {
                            speak(`${newGst} percent GST applied to table ${tableNum}.`);
                            showFeedback(`GST Applied: Table ${tableNum}`, '#f59e0b');
                            if (typeof loadOrders === 'function') loadOrders();
                        } else {
                            speak(`Failed to apply GST to table ${tableNum}.`);
                            showFeedback(`Failed to Apply GST`, '#f87171');
                        }
                    });
                } else {
                    speak(`No active order found for table ${tableNum}.`);
                    showFeedback(`No active order for Table ${tableNum}`, '#f87171');
                }
            });
            return;
        }

        /* ── 5. REVENUE & ORDERS ANALYTICS ─────── */

        // Today's revenue
        if (has(t, 'today revenue', 'daily revenue',
            'aaj ka total', 'aaj kitna', 'aaj ki kamai',
            'today total', 'today sales', 'today earning',
            'revenue today', 'sales today')) {
            VoxAPI.getAnalytics(1).then(r => {
                if (r.ok && r.data && r.data.data) {
                    const d = r.data.data;
                    speak(`Today's total revenue is ${d.totalRevenue} rupees from ${d.totalOrders} orders`);
                    showFeedback(
                        `Today: ₹${d.totalRevenue} from ${d.totalOrders} orders`,
                        '#22c55e');
                }
            });
            return;
        }

        // Past week revenue
        if (has(t, 'week revenue', 'weekly revenue', 'weekly sales',
            '7 days revenue', 'past week revenue', 'is hafte ka total',
            'this week revenue', 'this week sales', 'last 7 days results')) {
            VoxAPI.getAnalytics(7).then(r => {
                if (r.ok && r.data && r.data.data) {
                    const d = r.data.data;
                    speak(`This week's total revenue is ${d.totalRevenue} rupees from ${d.totalOrders} orders`);
                    showFeedback(
                        `This week: ₹${d.totalRevenue} from ${d.totalOrders} orders`,
                        '#22c55e');
                }
            });
            return;
        }

        // Past month revenue
        if (has(t, 'month revenue', 'monthly revenue', 'monthly sales',
            '30 days revenue', 'past month revenue', 'is mahine ka total',
            'this month revenue', 'this month sales', 'last 30 days results')) {
            VoxAPI.getAnalytics(30).then(r => {
                if (r.ok && r.data && r.data.data) {
                    const d = r.data.data;
                    speak(`This month's total revenue is ${d.totalRevenue} rupees from ${d.totalOrders} orders`);
                    showFeedback(
                        `This month: ₹${d.totalRevenue} from ${d.totalOrders} orders`,
                        '#22c55e');
                }
            });
            return;
        }

        /* ── 6. GST COMMANDS ───────────────────── */

        // Apply GST to open bill
        // Supports:
        //   "GST 5 lagao"
        //   "set GST to 12"
        //   "5 percent GST"
        //   "apply 18 GST"
        //   "add 12 percent tax"
        const gstSetMatch = t.match(
            /(?:gst|tax)\s*(?:set|lagao|karo|change|update|to|=|apply|add)?\s*(\d+)\s*(?:percent|%)?/i
        ) || t.match(
            /(\d+)\s*(?:percent|%)?\s*(?:gst|tax)/i
        ) || t.match(
            /(?:apply|add|set)\s*(\d+)\s*(?:percent|%)?\s*(?:gst|tax)/i
        );
        if (gstSetMatch) {
            const newGst = parseInt(gstSetMatch[1]);
            if (newGst >= 0 && newGst <= 50) {
                const onOrdersPage =
                    window.location.pathname
                        .includes('orders.html');
                const openOrder =
                    window.selectedOrder || null;

                if (openOrder && onOrdersPage) {
                    // Bill is open — apply to bill
                    const gIn = document
                        .getElementById('billGst');
                    if (gIn) {
                        gIn.value = newGst;
                        gIn.dispatchEvent(
                            new Event('input'));
                        const subtotal =
                            openOrder.subtotal || 0;
                        const disc = parseFloat(
                            document.getElementById(
                                'billDiscount')
                                ?.value || 0);
                        const gstAmt =
                            (subtotal - disc) *
                            (newGst / 100);
                        speak(
                            `${newGst} percent GST ` +
                            `applied. GST amount is ` +
                            `${gstAmt.toFixed(0)} rupees`);
                        showFeedback(
                            `${newGst}% GST applied ` +
                            `— ₹${gstAmt.toFixed(0)}`,
                            '#22c55e');
                        return;
                    }
                }

                // No bill open — update global setting
                const s = VB.getSettings();
                s.gstPercent = newGst;
                s.gstEnabled = true;
                VB.saveSettings(s);
                VoxAPI.saveSettings(s).catch(() => { });
                speak(
                    `GST set to ${newGst} percent ` +
                    `for all future bills`);
                showFeedback(
                    `GST updated to ${newGst}%`,
                    '#22c55e');
                return;
            }
        }

        // Enable GST on open bill or globally
        if (has(t, 'gst on', 'enable gst',
            'gst enable', 'gst lagao',
            'gst chalu karo', 'tax on',
            'enable tax', 'gst start karo',
            'gst add karo')) {
            const onOrdersPage =
                window.location.pathname
                    .includes('orders.html');
            const openOrder =
                window.selectedOrder || null;

            if (openOrder && onOrdersPage) {
                const gIn = document
                    .getElementById('billGst');
                const s = VB.getSettings();
                const pct = s.gstPercent || 5;
                if (gIn) {
                    gIn.value = pct;
                    gIn.dispatchEvent(
                        new Event('input'));
                    speak(
                        `GST enabled at ${pct} percent`);
                    showFeedback(
                        `GST enabled — ${pct}%`,
                        '#22c55e');
                    return;
                }
            }

            const s = VB.getSettings();
            s.gstEnabled = true;
            VB.saveSettings(s);
            VoxAPI.saveSettings(s).catch(() => { });
            const pct = s.gstPercent || 5;
            speak(`GST enabled at ${pct} percent`);
            showFeedback(
                `GST enabled — ${pct}%`, '#22c55e');
            return;
        }

        // Remove GST from open bill
        if (has(t, 'gst off', 'disable gst',
            'gst disable', 'gst band karo',
            'gst hatao', 'tax off',
            'disable tax', 'remove gst',
            'no gst', 'gst nikalo',
            'gst hata do', 'gst zero',
            'gst wapas lo', 'gst cancel',
            'gst mat lagao')) {
            const onOrdersPage =
                window.location.pathname
                    .includes('orders.html');
            const openOrder =
                window.selectedOrder || null;

            if (openOrder && onOrdersPage) {
                const gIn = document
                    .getElementById('billGst');
                if (gIn) {
                    gIn.value = 0;
                    gIn.dispatchEvent(
                        new Event('input'));
                    speak(
                        'GST removed from this bill');
                    showFeedback(
                        'GST removed ✅', '#f59e0b');
                    return;
                }
            }

            const s = VB.getSettings();
            s.gstEnabled = false;
            VB.saveSettings(s);
            VoxAPI.saveSettings(s).catch(() => { });
            speak('GST disabled for all bills');
            showFeedback('GST disabled', '#f59e0b');
            return;
        }

        // What is current GST on bill or setting
        if (has(t, 'gst kitna', 'current gst',
            'gst kya hai', 'what is gst',
            'gst percent', 'tax rate',
            'gst rate', 'gst check',
            'gst batao', 'kitna gst hai')) {
            const onOrdersPage =
                window.location.pathname
                    .includes('orders.html');
            const openOrder =
                window.selectedOrder || null;

            if (openOrder && onOrdersPage) {
                const gIn = document
                    .getElementById('billGst');
                const gstPct = gIn
                    ? parseFloat(gIn.value) || 0
                    : 0;
                if (gstPct === 0) {
                    speak(
                        'No GST on current bill');
                    showFeedback(
                        'GST: 0% (none applied)',
                        '#94a3b8');
                } else {
                    const subtotal =
                        openOrder.subtotal || 0;
                    const disc = parseFloat(
                        document.getElementById(
                            'billDiscount')
                            ?.value || 0);
                    const gstAmt =
                        (subtotal - disc) *
                        (gstPct / 100);
                    speak(
                        `GST is ${gstPct} percent. ` +
                        `Amount is ` +
                        `${gstAmt.toFixed(0)} rupees`);
                    showFeedback(
                        `GST: ${gstPct}% ` +
                        `— ₹${gstAmt.toFixed(0)}`,
                        '#22c55e');
                }
                return;
            }

            const s = VB.getSettings();
            if (!s.gstEnabled) {
                speak('GST is currently disabled');
                showFeedback(
                    'GST: Disabled', '#94a3b8');
            } else {
                speak(
                    `GST is ${s.gstPercent || 5} ` +
                    `percent`);
                showFeedback(
                    `GST: ${s.gstPercent || 5}%`,
                    '#22c55e');
            }
            return;
        }

        /* ── 7. DISCOUNT COMMANDS ───────────────── */

        // Apply discount to bill
        // Supports:
        //   "10 percent discount"
        //   "discount 15"
        //   "15 ka discount lagao"
        //   "apply 20 percent off"
        //   "give 5 percent discount"
        const discSetMatch = t.match(
            /(\d+)\s*(?:percent|%|ka)?\s*(?:discount|off|chhutt|chhoot|rebate)/i
        ) || t.match(
            /(?:discount|off|chhutt)\s*(?:lagao|karo|do|set|apply|de do)?\s*(\d+)\s*(?:percent|%)?/i
        ) || t.match(
            /(?:give|apply|add|set)\s*(\d+)\s*(?:percent|%)?\s*(?:discount|off)/i
        );
        if (discSetMatch) {
            const discPct = parseInt(discSetMatch[1]);
            if (discPct >= 0 && discPct <= 100) {
                const onOrdersPage =
                    window.location.pathname
                        .includes('orders.html');
                const openOrder =
                    window.selectedOrder || null;

                if (openOrder && onOrdersPage) {
                    // Bill is open — apply directly
                    const dIn = document
                        .getElementById('billDiscount');
                    const subtotal =
                        openOrder.subtotal || 0;
                    if (dIn) {
                        // billDiscount is an amount
                        // not a percentage — convert
                        const discAmt =
                            (subtotal * discPct) / 100;
                        dIn.value = discAmt.toFixed(2);
                        dIn.dispatchEvent(
                            new Event('input'));
                        speak(
                            `${discPct} percent ` +
                            `discount applied. ` +
                            `Discount amount is ` +
                            `${discAmt.toFixed(0)} rupees`);
                        showFeedback(
                            `${discPct}% discount ` +
                            `— ₹${discAmt.toFixed(0)} ` +
                            `off`,
                            '#22c55e');
                        return;
                    }
                }

                // No bill open — ask manager to
                // open a bill first
                speak(
                    `Open a table bill first, ` +
                    `then say ${discPct} percent ` +
                    `discount`);
                showFeedback(
                    `Open a bill first to apply ` +
                    `${discPct}% discount`,
                    '#f59e0b');
                return;
            }
        }

        // Remove discount from bill
        if (has(t, 'discount hatao',
            'remove discount',
            'no discount',
            'discount band karo',
            'discount off',
            'discount zero',
            'discount hata do',
            'discount nikalo',
            'discount wapas lo',
            'discount cancel')) {
            const onOrdersPage =
                window.location.pathname
                    .includes('orders.html');
            const openOrder =
                window.selectedOrder || null;

            if (openOrder && onOrdersPage) {
                const dIn = document
                    .getElementById('billDiscount');
                if (dIn) {
                    dIn.value = 0;
                    dIn.dispatchEvent(
                        new Event('input'));
                    speak(
                        'Discount removed. ' +
                        'Full amount applies now.');
                    showFeedback(
                        'Discount removed ✅',
                        '#f59e0b');
                    return;
                }
            }
            speak(
                'No bill is open right now. ' +
                'Open a table bill first.');
            showFeedback(
                'Open a bill first',
                '#f59e0b');
            return;
        }

        // What is current discount on open bill
        if (has(t, 'discount kitna',
            'current discount',
            'discount kya hai',
            'kitna discount hai',
            'discount check',
            'discount batao')) {
            const onOrdersPage =
                window.location.pathname
                    .includes('orders.html');
            const openOrder =
                window.selectedOrder || null;

            if (openOrder && onOrdersPage) {
                const dIn = document
                    .getElementById('billDiscount');
                const disc = dIn
                    ? parseFloat(dIn.value) || 0
                    : 0;
                if (disc === 0) {
                    speak('No discount on current bill');
                    showFeedback(
                        'No discount applied',
                        '#94a3b8');
                } else {
                    speak(
                        `Current discount is ` +
                        `${disc} rupees`);
                    showFeedback(
                        `Discount: ₹${disc}`,
                        '#22c55e');
                }
                return;
            }
            speak('No bill is open right now');
            showFeedback(
                'Open a bill first', '#f59e0b');
            return;
        }

        /* ── 8. TABLE DETAIL QUERIES ────────────── */

        // What did table X order
        const tableOrderMatch = t.match(
            /table\s*(\d+)\s*(?:ne\s*kya|ka\s*order|order\s*kya|ordered|has\s*ordered|mein\s*kya)/i
        ) || t.match(
            /(?:what\s*did|show)\s*table\s*(\d+)/i
        );
        if (tableOrderMatch) {
            const tNum = tableOrderMatch[1];
            VoxAPI.getOrders('today').then(r => {
                if (!r.ok || !r.data || !r.data.data) {
                    speak('Could not fetch orders');
                    return;
                }
                const order = r.data.data.find(o =>
                    String(o.tableNumber) ===
                    String(tNum) &&
                    o.status !== 'paid');
                if (!order) {
                    speak(
                        `Table ${tNum} has no ` +
                        `active order`);
                    showFeedback(
                        `Table ${tNum} — No order`,
                        '#94a3b8');
                    return;
                }
                const items = (order.items || [])
                    .map(i => `${i.qty} ${i.item}`)
                    .join(', ');
                const cust = order.customerName
                    ? ` for ${order.customerName}` : '';
                speak(
                    `Table ${tNum}${cust}: ` +
                    `${items}. Total ` +
                    `${order.total} rupees.`);
                showFeedback(
                    `Table ${tNum}${cust}: ` +
                    `${items} | ₹${order.total}`,
                    '#8B5CF6');
            });
            return;
        }

        // Table X bill total
        const tableTotalMatch = t.match(
            /table\s*(\d+)\s*(?:ka\s*total|ka\s*bill|total|bill\s*kitna|amount)/i
        );
        if (tableTotalMatch) {
            const tNum = tableTotalMatch[1];
            VoxAPI.getOrders('today').then(r => {
                if (!r.ok || !r.data || !r.data.data) {
                    speak('Could not fetch orders');
                    return;
                }
                const order = r.data.data.find(o =>
                    String(o.tableNumber) ===
                    String(tNum));
                if (!order) {
                    speak(
                        `No order found for ` +
                        `Table ${tNum}`);
                    showFeedback(
                        `Table ${tNum} — No order`,
                        '#94a3b8');
                    return;
                }
                speak(
                    `Table ${tNum} bill is ` +
                    `${order.total} rupees`);
                showFeedback(
                    `Table ${tNum}: ₹${order.total}`,
                    '#22c55e');
            });
            return;
        }

        // How long has table X been waiting
        const tableWaitMatch = t.match(
            /table\s*(\d+)\s*(?:kitni\s*der|how\s*long|waiting|wait|kab\s*se)/i
        );
        if (tableWaitMatch) {
            const tNum = tableWaitMatch[1];
            VoxAPI.getOrders('today').then(r => {
                if (!r.ok || !r.data || !r.data.data) {
                    speak('Could not fetch orders');
                    return;
                }
                const order = r.data.data.find(o =>
                    String(o.tableNumber) ===
                    String(tNum) &&
                    o.status !== 'paid');
                if (!order) {
                    speak(
                        `Table ${tNum} has no ` +
                        `active order`);
                    return;
                }
                const mins = Math.floor(
                    (Date.now() -
                        new Date(order.createdAt)) /
                    60000);
                speak(
                    `Table ${tNum} has been ` +
                    `waiting for ${mins} minutes`);
                showFeedback(
                    `Table ${tNum} — ${mins} mins`,
                    '#f59e0b');
            });
            return;
        }

        // Longest waiting table
        if (has(t, 'sabse zyada wait',
            'longest waiting', 'longest wait',
            'sabse purani table', 'oldest table',
            'waiting longest', 'kitni der se')) {
            VoxAPI.getOrders('today').then(r => {
                if (!r.ok || !r.data || !r.data.data) {
                    speak('Could not fetch orders');
                    return;
                }
                const active = r.data.data.filter(
                    o => o.status !== 'paid');
                if (active.length === 0) {
                    speak('No active orders right now');
                    showFeedback(
                        'No active orders', '#94a3b8');
                    return;
                }
                const oldest = active.reduce((a, b) =>
                    new Date(a.createdAt) <
                        new Date(b.createdAt) ? a : b);
                const mins = Math.floor(
                    (Date.now() -
                        new Date(oldest.createdAt)) /
                    60000);
                speak(
                    `Table ${oldest.tableNumber} ` +
                    `has been waiting the longest — ` +
                    `${mins} minutes`);
                showFeedback(
                    `Longest wait: Table ` +
                    `${oldest.tableNumber} ` +
                    `(${mins} mins)`,
                    '#f59e0b');
            });
            return;
        }

        /* ── 9. STAFF INTELLIGENCE ──────────────── */

        // Which table is waiter X on
        // e.g. "Rahul kaunsi table pe hai"
        //      "which table is Nikhil on"
        const waiterTableMatch = t.match(
            /([a-z]+)\s*(?:kaunsi|which|kahan|kon\s*si)?\s*table/i
        ) || t.match(
            /(?:which\s*table\s*is|table\s*of)\s*([a-z]+)/i
        );
        if (waiterTableMatch &&
            !has(t, 'available', 'free', 'empty',
                'occupied', 'busy', 'status',
                'open table', 'tables page')) {
            const waiterName =
                waiterTableMatch[1].toLowerCase();
            // Skip if it matched a common word
            const skipWords = ['the', 'which', 'what',
                'how', 'this', 'that', 'open',
                'all', 'any', 'some', 'my'];
            if (!skipWords.includes(waiterName)) {
                VoxAPI.getOrders('today').then(r => {
                    if (!r.ok ||
                        !r.data || !r.data.data) {
                        speak('Could not fetch orders');
                        return;
                    }
                    const orders = r.data.data.filter(
                        o => o.status !== 'paid' &&
                            o.waiterName &&
                            o.waiterName.toLowerCase()
                                .includes(waiterName));
                    if (orders.length === 0) {
                        speak(
                            `No active table found ` +
                            `for ${waiterName}`);
                        showFeedback(
                            `${waiterName} — ` +
                            `No active table`,
                            '#94a3b8');
                    } else {
                        const tables = orders.map(
                            o => `Table ${o.tableNumber}`)
                            .join(' and ');
                        speak(
                            `${orders[0].waiterName} ` +
                            `is on ${tables}`);
                        showFeedback(
                            `${orders[0].waiterName}: ` +
                            `${tables}`,
                            '#8B5CF6');
                    }
                });
                return;
            }
        }

        // Is specific waiter working
        // e.g. "kya Rahul kaam kar raha hai"
        //      "is Nikhil on duty"
        const isWorkingMatch = t.match(
            /(?:kya|is|check)\s+([a-z]+)\s+(?:kaam|working|on\s*duty|present|hai|here)/i
        );
        if (isWorkingMatch) {
            const name =
                isWorkingMatch[1].toLowerCase();
            VoxAPI.getOrders('today').then(r => {
                if (!r.ok || !r.data || !r.data.data) {
                    speak('Could not check');
                    return;
                }
                const found = r.data.data.find(
                    o => o.status !== 'paid' &&
                        o.waiterName &&
                        o.waiterName.toLowerCase()
                            .includes(name));
                if (found) {
                    speak(
                        `Yes, ${found.waiterName} ` +
                        `is currently working on ` +
                        `Table ${found.tableNumber}`);
                    showFeedback(
                        `${found.waiterName} ✅ ` +
                        `Table ${found.tableNumber}`,
                        '#22c55e');
                } else {
                    speak(
                        `${name} does not appear ` +
                        `to have any active table ` +
                        `right now`);
                    showFeedback(
                        `${name} — Not on any table`,
                        '#94a3b8');
                }
            });
            return;
        }

        // How many staff working right now
        if (has(t, 'kitne staff', 'how many staff',
            'how many waiters', 'kitne waiter',
            'staff count', 'staff kitne hain',
            'total staff working')) {
            VoxAPI.getOrders('today').then(r => {
                if (!r.ok || !r.data || !r.data.data) {
                    speak('Could not fetch orders');
                    return;
                }
                const names = new Set(
                    r.data.data
                        .filter(o =>
                            o.status !== 'paid' &&
                            o.waiterName)
                        .map(o => o.waiterName));
                const count = names.size;
                speak(
                    `${count} staff member` +
                    `${count !== 1 ? 's are' : ' is'}` +
                    ` currently serving tables`);
                showFeedback(
                    `${count} staff on duty`,
                    '#8B5CF6');
            });
            return;
        }

        // Who is free / which waiter has no table
        if (has(t, 'kaun free hai', 'who is free',
            'free waiter', 'available waiter',
            'kaun available hai',
            'which waiter is free')) {
            Promise.all([
                VoxAPI.getStaff(),
                VoxAPI.getOrders('today')
            ]).then(([staffRes, ordersRes]) => {
                if (!staffRes.ok ||
                    !ordersRes.ok) {
                    speak('Could not fetch data');
                    return;
                }
                const allStaff = (staffRes.data.data
                    || []).filter(
                        s => s.role === 'waiter');
                const busyNames = new Set(
                    (ordersRes.data.data || [])
                        .filter(o =>
                            o.status !== 'paid' &&
                            o.waiterName)
                        .map(o => o.waiterName));
                const free = allStaff.filter(
                    s => !busyNames.has(s.name));
                if (free.length === 0) {
                    speak(
                        'All staff are currently ' +
                        'serving tables');
                    showFeedback(
                        'All staff are busy',
                        '#f59e0b');
                } else {
                    const names = free.map(
                        s => s.name).join(', ');
                    speak(
                        `${free.length} staff ` +
                        `${free.length > 1
                            ? 'are' : 'is'} free: ` +
                        `${names}`);
                    showFeedback(
                        `Free staff: ${names}`,
                        '#22c55e');
                }
            });
            return;
        }

        /* ── 10. FINANCIAL INTELLIGENCE ─────────── */

        // Today's full summary
        if (has(t, 'today summary', 'daily report',
            'aaj ka summary', 'today report',
            'full report', 'poora report',
            'aaj ka report', 'business summary')) {
            VoxAPI.getAnalytics(1).then(r => {
                if (r.ok && r.data && r.data.data) {
                    const d = r.data.data;
                    const avg = d.avgOrderVal
                        ? Math.round(d.avgOrderVal)
                        : 0;
                    speak(
                        `Today's summary: ` +
                        `${d.totalOrders} orders, ` +
                        `total revenue ` +
                        `${d.totalRevenue} rupees, ` +
                        `average bill ` +
                        `${avg} rupees`);
                    showFeedback(
                        `Orders: ${d.totalOrders} | ` +
                        `Revenue: ₹${d.totalRevenue}` +
                        ` | Avg: ₹${avg}`,
                        '#22c55e');
                }
            });
            return;
        }

        // How much collected today (paid orders only)
        if (has(t, 'kitna collect', 'collected today',
            'aaj kitna collect hua',
            'how much collected',
            'cash collected', 'paisa aaya')) {
            VoxAPI.getOrders('today').then(r => {
                if (!r.ok || !r.data || !r.data.data) {
                    speak('Could not fetch orders');
                    return;
                }
                const collected = r.data.data
                    .filter(o => o.status === 'paid')
                    .reduce((s, o) => s + o.total, 0);
                const count = r.data.data.filter(
                    o => o.status === 'paid').length;
                speak(
                    `${collected} rupees collected ` +
                    `today from ${count} paid bills`);
                showFeedback(
                    `Collected: ₹${collected} ` +
                    `(${count} bills paid)`,
                    '#22c55e');
            });
            return;
        }

        // Total pending amount
        if (has(t, 'kitna pending', 'pending amount',
            'unpaid amount', 'baaki paisa',
            'total pending', 'pending kitna',
            'unpaid total', 'due amount')) {
            VoxAPI.getOrders('today').then(r => {
                if (!r.ok || !r.data || !r.data.data) {
                    speak('Could not fetch orders');
                    return;
                }
                const pendingOrders =
                    r.data.data.filter(
                        o => o.status !== 'paid');
                const total = pendingOrders.reduce(
                    (s, o) => s + o.total, 0);
                speak(
                    `${total} rupees is pending ` +
                    `across ${pendingOrders.length} ` +
                    `unpaid tables`);
                showFeedback(
                    `Pending: ₹${total} ` +
                    `(${pendingOrders.length} tables)`,
                    '#f59e0b');
            });
            return;
        }

        // Highest bill today
        if (has(t, 'sabse bada bill',
            'highest bill', 'biggest bill',
            'maximum bill', 'largest order',
            'sabse zyada ka bill')) {
            VoxAPI.getOrders('today').then(r => {
                if (!r.ok || !r.data || !r.data.data) {
                    speak('Could not fetch orders');
                    return;
                }
                if (r.data.data.length === 0) {
                    speak('No orders today yet');
                    return;
                }
                const highest = r.data.data.reduce(
                    (a, b) =>
                        a.total > b.total ? a : b);
                const cust = highest.customerName
                    ? ` for ${highest.customerName}`
                    : '';
                speak(
                    `Highest bill today is ` +
                    `Table ${highest.tableNumber}` +
                    `${cust} — ` +
                    `${highest.total} rupees`);
                showFeedback(
                    `Highest: Table ` +
                    `${highest.tableNumber}` +
                    `${cust} — ₹${highest.total}`,
                    '#22c55e');
            });
            return;
        }

        // Average order value
        if (has(t, 'average bill', 'average order',
            'average kitna', 'avg bill',
            'average value', 'mean order')) {
            VoxAPI.getAnalytics(1).then(r => {
                if (r.ok && r.data && r.data.data) {
                    const avg = Math.round(
                        r.data.data.avgOrderVal || 0);
                    speak(
                        `Average order value ` +
                        `today is ${avg} rupees`);
                    showFeedback(
                        `Avg order: ₹${avg}`,
                        '#22c55e');
                }
            });
            return;
        }

        // Last order received
        if (has(t, 'last order', 'latest order',
            'most recent order', 'aakhri order',
            'last order kab', 'new order kab')) {
            VoxAPI.getOrders('today').then(r => {
                if (!r.ok || !r.data || !r.data.data
                    || r.data.data.length === 0) {
                    speak('No orders today yet');
                    return;
                }
                const latest = r.data.data.reduce(
                    (a, b) =>
                        new Date(a.createdAt) >
                            new Date(b.createdAt) ? a : b);
                const mins = Math.floor(
                    (Date.now() -
                        new Date(latest.createdAt)) /
                    60000);
                const timeStr = mins === 0
                    ? 'just now'
                    : `${mins} minutes ago`;
                speak(
                    `Last order was from ` +
                    `Table ${latest.tableNumber} ` +
                    `${timeStr}`);
                showFeedback(
                    `Last order: Table ` +
                    `${latest.tableNumber} ` +
                    `(${timeStr})`,
                    '#8B5CF6');
            });
            return;
        }

        // Total orders today count
        if (has(t, 'kitne orders', 'total orders',
            'how many orders', 'order count',
            'orders today', 'aaj kitne order')) {
            VoxAPI.getOrders('today').then(r => {
                if (!r.ok || !r.data || !r.data.data) {
                    speak('Could not fetch orders');
                    return;
                }
                const total = r.data.data.length;
                const paid = r.data.data.filter(
                    o => o.status === 'paid').length;
                speak(
                    `${total} total orders today. ` +
                    `${paid} paid, ` +
                    `${total - paid} still active.`);
                showFeedback(
                    `Total: ${total} | ` +
                    `Paid: ${paid} | ` +
                    `Active: ${total - paid}`,
                    '#22c55e');
            });
            return;
        }

        /* ── 11. MENU INTELLIGENCE & REMOTE MENU COMMANDS ── */

        // ── PHASE 2 REMOTE MENU COMMANDS ────────

        // Add menu item
        const addMenuMatch = t.match(/(?:add|create)\s+(?:new\s+)?(?:menu\s+item|item)\s+([a-z\s]+?)\s+(?:for|price|at)?\s*(\d+)/i) ||
            t.match(/(?:add|create)\s+([a-z\s]+?)\s+(?:to\s+menu)(?:\s+(?:for|price|at)?\s*(\d+))?/i);
        if (addMenuMatch) {
            const newItemNameRaw = (addMenuMatch[1] || '').trim();
            const newItemName = newItemNameRaw.charAt(0).toUpperCase() + newItemNameRaw.slice(1);
            const price = parseInt(addMenuMatch[2] || '0', 10);

            if (!newItemName || price <= 0) {
                speak('Please specify a valid name and price to add the item.');
                showFeedback('Invalid name or price', '#f87171');
                return;
            }

            speak(`Adding new item ${newItemName} for ${price} rupees`);
            showFeedback(`Adding Item: ${newItemName}...`, '#8B5CF6');

            VoxAPI.addMenuItem({ name: newItemName, price: price, category: 'Uncategorized' }).then(res => {
                if (res.ok) {
                    speak(`${newItemName} added successfully.`);
                    showFeedback(`Added: ${newItemName} (₹${price})`, '#22c55e');
                    if (typeof loadMenu === 'function') loadMenu();
                } else {
                    speak('Failed to add the new item.');
                    showFeedback('Failed to Add', '#f87171');
                }
            });
            return;
        }

        // Change price
        const changePriceMatch = t.match(/(?:change|update|set)\s+(?:the\s+)?(?:price\s+of\s+|price\s+for\s+)?(?:a\s+)?(?:menu\s+item\s+|menu\s+|item\s+)?([a-z\s]+?)\s+(?:price\s+)?(?:to|price|=)\s*(\d+)/i);
        if (changePriceMatch) {
            const itemNameRaw = changePriceMatch[1].trim();
            const newPrice = parseInt(changePriceMatch[2], 10);

            const menu = VB.getMenu();
            const found = menu.find(m => {
                const mName = m.name.toLowerCase();
                const iName = itemNameRaw;
                return iName.includes(mName) || mName.includes(iName) ||
                    mName.includes(iName.replace('paneer', 'panner')) ||
                    iName.includes(mName.replace('panner', 'paneer'));
            });

            if (found && found._id) {
                speak(`Changing price of ${found.name} to ${newPrice} rupees.`);
                showFeedback(`Updating Price: ${found.name}...`, '#8B5CF6');

                VoxAPI.updateMenuItem(found._id, { price: newPrice }).then(res => {
                    if (res.ok) {
                        speak('Price updated successfully.');
                        showFeedback(`Updated: ${found.name} (₹${newPrice})`, '#22c55e');
                        if (typeof loadMenu === 'function') loadMenu();
                    } else {
                        speak('Failed to update price.');
                        showFeedback('Failed to Update', '#f87171');
                    }
                });
            } else {
                speak(`Could not find ${itemNameRaw} in the menu.`);
                showFeedback(`Menu item not found`, '#f87171');
            }
            return;
        }

        // Disable / Enable item
        const toggleMatch = t.match(/(disable|enable|turn\s+off|turn\s+on)\s+(?:menu\s+items?|items?\s+)?([a-z\s]+)/i);
        if (toggleMatch) {
            const action = toggleMatch[1].toLowerCase();
            const isDisable = action.includes('disable') || action.includes('off');
            const itemNameRaw = toggleMatch[2].trim().replace(/^s\s+/, '').replace(/item\s+/g, ''); // catch leftover "s" or "item"

            const menu = VB.getMenu();
            const found = menu.find(m => {
                const mName = m.name.toLowerCase();
                const iName = itemNameRaw;
                return iName.includes(mName) || mName.includes(iName) ||
                    mName.includes(iName.replace('paneer', 'panner')) ||
                    iName.includes(mName.replace('panner', 'paneer'));
            });

            if (found && found._id) {
                const actionVerb = isDisable ? 'Disabling' : 'Enabling';
                speak(`${actionVerb} ${found.name}.`);
                showFeedback(`${actionVerb}: ${found.name}...`, '#8B5CF6');

                VoxAPI.updateMenuItem(found._id, { disabled: isDisable }).then(res => {
                    if (res.ok) {
                        speak(`${found.name} is now ${isDisable ? 'disabled' : 'enabled'}.`);
                        showFeedback(`${found.name} ${isDisable ? 'Disabled 🔴' : 'Enabled 🟢'}`, '#22c55e');
                        if (typeof loadMenu === 'function') loadMenu();
                    } else {
                        speak(`Failed to ${isDisable ? 'disable' : 'enable'} the item.`);
                        showFeedback('Update Failed', '#f87171');
                    }
                });
            } else {
                speak(`Could not find ${itemNameRaw} in the menu.`);
                showFeedback(`Menu item not found`, '#f87171');
            }
            return;
        }

        // ── GENERIC MENU QUERIES ────────────────

        // Price of specific item
        const priceMatch = t.match(/(?:price|cost|rate)\s*(?:of|for)?\s+(.+)/i);
        if (priceMatch) {
            const itemName = priceMatch[1].trim();
            const menu = VB.getMenu();
            const found = menu.find(m => m.name.toLowerCase().includes(itemName) || itemName.includes(m.name.toLowerCase()));
            if (found) {
                speak(
                    `${found.name} is ` +
                    `${found.price} rupees`);
                showFeedback(
                    `${found.name}: ₹${found.price}`,
                    '#22c55e');
            } else {
                speak(
                    `Sorry, I couldn't find ${itemName} in the menu.`);
                showFeedback(
                    `${itemName} not found`,
                    '#f87171');
            }
            return;
        }

        // Is item available on menu
        const menuAvailMatch = t.match(/is\s+(.+?)\s+(?:available|there)/i) || t.match(/(?:do you have|hai kya)\s+(.+)/i);
        if (menuAvailMatch && !has(t, 'table', 'tables', 'price', 'cost')) {
            const itemName = menuAvailMatch[1].trim().replace(/\?$/, '');
            const menu = VB.getMenu();
            const found = menu.find(m => m.name.toLowerCase().includes(itemName) || itemName.includes(m.name.toLowerCase()));
            if (found) {
                speak(
                    `Yes, ${found.name} is ` +
                    `available for ` +
                    `${found.price} rupees`);
                showFeedback(
                    `${found.name} ✅ ` +
                    `₹${found.price}`,
                    '#22c55e');
            } else {
                speak('That item is not on the menu');
                showFeedback(
                    'Item not on menu', '#f87171');
            }
            return;
        }

        // How many items on menu
        if (has(t, 'menu mein kitne', 'total menu items',
            'how many menu items', 'menu items count')) {
            const menu = VB.getMenu();
            speak(
                `Menu has ${menu.length} items`);
            showFeedback(
                `Menu: ${menu.length} items`,
                '#22c55e');
            return;
        }

        // Most expensive item
        if (has(t, 'sabse mehanga', 'most expensive',
            'highest price item', 'costliest',
            'expensive item', 'sabse costly')) {
            const menu = VB.getMenu();
            if (menu.length === 0) {
                speak('Menu is empty');
                return;
            }
            const expensive = menu.reduce((a, b) =>
                a.price > b.price ? a : b);
            speak(
                `Most expensive item is ` +
                `${expensive.name} at ` +
                `${expensive.price} rupees`);
            showFeedback(
                `Most expensive: ` +
                `${expensive.name} ` +
                `₹${expensive.price}`,
                '#22c55e');
            return;
        }

        // Cheapest item
        if (has(t, 'sabse sasta', 'cheapest',
            'lowest price', 'most affordable',
            'sasta item', 'sabse kam price')) {
            const menu = VB.getMenu();
            if (menu.length === 0) {
                speak('Menu is empty');
                return;
            }
            const cheap = menu.reduce((a, b) =>
                a.price < b.price ? a : b);
            speak(
                `Cheapest item is ${cheap.name} ` +
                `at ${cheap.price} rupees`);
            showFeedback(
                `Cheapest: ${cheap.name} ` +
                `₹${cheap.price}`,
                '#22c55e');
            return;
        }

        // Best selling item today
        if (has(t, 'sabse zyada kya bika',
            'best selling', 'top item',
            'most ordered', 'popular item',
            'sabse popular', 'best seller')) {
            VoxAPI.getAnalytics(1).then(r => {
                if (r.ok && r.data && r.data.data) {
                    const top = r.data.data.topItem;
                    if (!top) {
                        speak('No orders today yet');
                        showFeedback(
                            'No data yet', '#94a3b8');
                    } else {
                        speak(
                            `Best selling item today ` +
                            `is ${top.name} — ` +
                            `ordered ${top.count} times`);
                        showFeedback(
                            `Top item: ${top.name} ` +
                            `(${top.count}x)`,
                            '#22c55e');
                    }
                }
            });
            return;
        }

        /* ── 12. CUSTOMER QUERIES ───────────────── */

        // Find order by customer name
        // e.g. "Rahul ka order kya hai"
        //      "find order for Priya"
        const custOrderMatch = t.match(
            /([a-z]+)\s*(?:ka\s*order|ki\s*order|ke\s*liye|'s\s*order|order\s*kya)/i
        ) || t.match(
            /(?:find\s*order\s*for|order\s*of)\s*([a-z]+)/i
        );
        if (custOrderMatch) {
            const custName =
                custOrderMatch[1].toLowerCase();
            const skipWords = ['the', 'which', 'what',
                'how', 'this', 'that', 'all',
                'any', 'my', 'your'];
            if (!skipWords.includes(custName)) {
                VoxAPI.getOrders('today').then(r => {
                    if (!r.ok ||
                        !r.data || !r.data.data) {
                        speak('Could not fetch orders');
                        return;
                    }
                    const order = r.data.data.find(
                        o => o.customerName &&
                            o.customerName.toLowerCase()
                                .includes(custName) &&
                            o.status !== 'paid');
                    if (!order) {
                        speak(
                            `No active order found ` +
                            `for ${custName}`);
                        showFeedback(
                            `${custName} — ` +
                            `No order found`,
                            '#94a3b8');
                        return;
                    }
                    const items = (order.items || [])
                        .map(i =>
                            `${i.qty} ${i.item}`)
                        .join(', ');
                    speak(
                        `${order.customerName} is ` +
                        `on Table ` +
                        `${order.tableNumber}. ` +
                        `Order: ${items}. ` +
                        `Total ${order.total} rupees.`);
                    showFeedback(
                        `${order.customerName} — ` +
                        `Table ${order.tableNumber} ` +
                        `| ₹${order.total}`,
                        '#8B5CF6');
                });
                return;
            }
        }

        /* ── 13. NOTIFICATIONS ──────────────────── */

        if (has(t, 'notifications dikhao',
            'show notifications',
            'notifications kya hain',
            'check notifications')) {
            const notis = VB.getNotifications()
                .slice(0, 3);
            if (notis.length === 0) {
                speak('No new notifications');
                showFeedback(
                    'No notifications', '#94a3b8');
            } else {
                speak(
                    `${notis.length} notifications. ` +
                    `Latest: ${notis[0].message}`);
                showFeedback(
                    notis[0].message, '#8B5CF6');
            }
            return;
        }

        if (has(t, 'notifications clear',
            'clear notifications',
            'sab notifications hatao',
            'notifications delete')) {
            VB.clearNotifications();
            speak('All notifications cleared');
            showFeedback(
                'Notifications cleared', '#22c55e');
            return;
        }

        /* ── 14.5 DOWNLOAD PDF ──────────────────── */

        if (has(t, 'download invoice pdf',
            'save bill as pdf',
            'download pdf', 'pdf bill')) {
            const onOrdersPage =
                window.location.pathname
                    .includes('orders.html');
            const openOrder =
                window.selectedOrder || null;

            if (openOrder && onOrdersPage) {
                speak('Opening print dialog — ' +
                    'select Save as PDF');
                showFeedback(
                    'Print → Save as PDF',
                    '#22D3EE');
                setTimeout(() => {
                    const s = VB.getSettings();
                    if (window.printInvoice) {
                        window.printInvoice(
                            openOrder, s);
                    }
                }, 1000);
            } else {
                speak('Open a table bill first ' +
                    'on the orders page');
                showFeedback(
                    'Open a bill first',
                    '#f59e0b');
            }
            return;
        }

        /* ── 14.6 UPI QR ────────────────────────── */

        if (has(t, 'show payment qr',
            'show upi qr', 'generate qr',
            'payment qr', 'upi qr')) {
            const s = VB.getSettings();
            if (!s.upiId) {
                speak('UPI payment ID is not ' +
                    'configured in settings');
                showFeedback(
                    'No UPI ID configured',
                    '#f59e0b');
            } else {
                speak(`UPI ID is ${s.upiId}. ` +
                    'Please check the invoice ' +
                    'for the QR code.');
                showFeedback(
                    `UPI: ${s.upiId}`, '#22c55e');
            }
            return;
        }

        /* ── 14.7 ORDERS PAGE FILTERS ───────────── */

        if (has(t, 'show open orders',
            'show active orders',
            'filter open orders')) {
            const onOrdersPage =
                window.location.pathname
                    .includes('orders.html');
            if (onOrdersPage) {
                const btn = document.querySelector(
                    '[data-filter="active"],' +
                    '[data-filter="open"]');
                if (btn) btn.click();
                speak('Showing open orders');
                showFeedback(
                    'Filtered: Open Orders',
                    '#22D3EE');
            } else {
                go('../pages/orders.html',
                    'Orders');
            }
            return;
        }

        if (has(t, 'show paid orders',
            'show paid history',
            'filter paid orders',
            'paid history')) {
            const onOrdersPage =
                window.location.pathname
                    .includes('orders.html');
            if (onOrdersPage) {
                const btn = document.querySelector(
                    '[data-filter="paid"]');
                if (btn) btn.click();
                speak('Showing paid history');
                showFeedback(
                    'Filtered: Paid Orders',
                    '#22D3EE');
            } else {
                go('../pages/orders.html',
                    'Orders');
            }
            return;
        }

        if (has(t, 'show all orders',
            'all orders', 'today orders',
            'today all orders')) {
            const onOrdersPage =
                window.location.pathname
                    .includes('orders.html');
            if (onOrdersPage) {
                const btn = document.querySelector(
                    '[data-filter="all"],' +
                    '[data-filter="today"]');
                if (btn) btn.click();
                speak('Showing all orders');
                showFeedback(
                    'Filtered: All Orders',
                    '#22D3EE');
            } else {
                go('../pages/orders.html',
                    'Orders');
            }
            return;
        }

        /* ── 14.8 EXPORT CSV ────────────────────── */

        if (has(t, 'export orders csv',
            'download order report',
            'export csv', 'download csv')) {
            const onOrdersPage =
                window.location.pathname
                    .includes('orders.html');
            if (onOrdersPage &&
                typeof window.exportOrdersToCSV
                === 'function') {
                speak('Exporting orders to CSV');
                showFeedback(
                    'Downloading CSV...',
                    '#22D3EE');
                setTimeout(() => {
                    window.exportOrdersToCSV();
                }, 500);
            } else if (onOrdersPage) {
                speak('CSV export is not ' +
                    'available on this page');
                showFeedback(
                    'CSV export not available',
                    '#f87171');
            } else {
                speak('Go to the orders page ' +
                    'first to export CSV');
                showFeedback(
                    'Go to Orders page first',
                    '#f59e0b');
            }
            return;
        }

        /* ── 14.9 SETTINGS PAGE ACTIONS ─────────── */

        // Save settings
        if (has(t, 'save settings',
            'save all settings')) {
            const onSettingsPage =
                window.location.pathname
                    .includes('settings.html');
            if (onSettingsPage) {
                const saveBtn = document
                    .getElementById('saveAllBtn');
                if (saveBtn) {
                    saveBtn.click();
                    speak('Settings saved');
                    showFeedback(
                        'Settings saved ✅',
                        '#22c55e');
                } else {
                    speak(
                        'Save button not found');
                    showFeedback(
                        'Save button not found',
                        '#f87171');
                }
            } else {
                speak('Go to settings page first');
                showFeedback(
                    'Go to Settings first',
                    '#f59e0b');
            }
            return;
        }

        // Open settings tab
        const settingsTabMatch = t.match(
            /open\s+(restaurant|billing|staff|pin|data|danger\s*zone)\s+settings/i);
        if (settingsTabMatch) {
            const tabRaw = settingsTabMatch[1]
                .toLowerCase().trim();
            let tab = 'restaurant';
            if (tabRaw.includes('billing'))
                tab = 'billing';
            else if (tabRaw.includes('staff')
                || tabRaw.includes('pin'))
                tab = 'staff';
            else if (tabRaw.includes('data')
                || tabRaw.includes('danger'))
                tab = 'danger';

            const onSettingsPage =
                window.location.pathname
                    .includes('settings.html');
            if (onSettingsPage &&
                typeof switchTab === 'function') {
                switchTab(tab);
                speak(`Opened ${tabRaw} settings`);
                showFeedback(
                    `Settings: ${tabRaw}`,
                    '#22D3EE');
            } else {
                speak('Opening settings page');
                showFeedback(
                    'Opening Settings...',
                    '#22D3EE');
                setTimeout(() => {
                    window.location.href =
                        '../pages/settings.html';
                }, 1200);
            }
            return;
        }

        // Invoice template selection
        const templateMatch = t.match(
            /(?:use|set|select)\s+(modern|classic|premium|colorful)\s+(?:invoice|template)/i)
            || t.match(
                /(?:invoice|template)\s+(?:to\s+)?(modern|classic|premium|colorful)/i);
        if (templateMatch) {
            const tpl = templateMatch[1]
                .toLowerCase();
            const onSettingsPage =
                window.location.pathname
                    .includes('settings.html');
            if (onSettingsPage) {
                const pill = document.querySelector(
                    `[data-t="${tpl}"]`);
                if (pill) {
                    pill.click();
                    speak(
                        `Invoice template set to ` +
                        `${tpl}`);
                    showFeedback(
                        `Template: ${tpl}`,
                        '#22c55e');
                } else {
                    speak(
                        `Template ${tpl} not found`);
                    showFeedback(
                        'Template not found',
                        '#f87171');
                }
            } else {
                speak('Go to settings page first');
                showFeedback(
                    'Go to Settings first',
                    '#f59e0b');
            }
            return;
        }

        // Generate PIN
        if (has(t, 'generate new pin',
            'create random pin',
            'generate pin',
            'new pin')) {
            const onSettingsPage =
                window.location.pathname
                    .includes('settings.html');
            if (onSettingsPage) {
                const pinInput = document
                    .getElementById('sPin');
                if (pinInput) {
                    const newPin = String(
                        Math.floor(100000 +
                            Math.random() * 900000));
                    pinInput.value = newPin;
                    speak(`New PIN generated: ` +
                        `${newPin.split('').join(' ')}`);
                    showFeedback(
                        `New PIN: ${newPin}`,
                        '#22c55e');
                }
            } else {
                speak('Go to settings page first');
                showFeedback(
                    'Go to Settings first',
                    '#f59e0b');
            }
            return;
        }

        /* ── 14.10 DESTRUCTIVE ACTIONS ──────────── */

        // Clear all orders (with confirmation)
        if (has(t, 'clear all orders',
            'delete order history',
            'delete all orders')) {
            if (window._voxPendingConfirm
                === 'clearOrders') {
                // Already asked — do nothing,
                // confirmation handled in next cmd
                return;
            }
            speak('Are you sure you want to ' +
                'clear all orders? ' +
                'Say yes to confirm.');
            showFeedback(
                '⚠️ Say "yes" to confirm ' +
                'clearing all orders',
                '#ef4444');
            window._voxPendingConfirm =
                'clearOrders';
            return;
        }

        // Reset menu (with confirmation)
        if (has(t, 'reset menu',
            'reset menu to default',
            'delete all menu',
            'clear all menu')) {
            if (window._voxPendingConfirm
                === 'resetMenu') {
                return;
            }
            speak('Are you sure you want to ' +
                'reset the menu? ' +
                'Say yes to confirm.');
            showFeedback(
                '⚠️ Say "yes" to confirm ' +
                'resetting menu',
                '#ef4444');
            window._voxPendingConfirm =
                'resetMenu';
            return;
        }

        // Handle confirmation responses
        if (window._voxPendingConfirm &&
            has(t, 'yes', 'haan', 'confirm',
                'ha', 'ok')) {
            const action =
                window._voxPendingConfirm;
            window._voxPendingConfirm = null;

            if (action === 'clearOrders') {
                speak('Clearing all orders...');
                showFeedback(
                    'Clearing orders...',
                    '#ef4444');
                VoxAPI.clearAllOrders().then(r => {
                    if (r.ok) {
                        speak(
                            'All orders cleared.');
                        showFeedback(
                            'Orders cleared ✅',
                            '#22c55e');
                        if (typeof loadOrders
                            === 'function')
                            loadOrders();
                    } else {
                        speak(
                            'Failed to clear.');
                        showFeedback(
                            'Failed', '#f87171');
                    }
                });
            } else if (action === 'resetMenu') {
                speak('Resetting menu...');
                showFeedback(
                    'Resetting menu...',
                    '#ef4444');
                VoxAPI.clearAllMenu().then(r => {
                    if (r.ok) {
                        speak('Menu reset.');
                        showFeedback(
                            'Menu reset ✅',
                            '#22c55e');
                        if (typeof loadMenu
                            === 'function')
                            loadMenu();
                    } else {
                        speak(
                            'Failed to reset.');
                        showFeedback(
                            'Failed', '#f87171');
                    }
                });
            }
            return;
        }

        // Cancel pending confirmation
        if (window._voxPendingConfirm) {
            window._voxPendingConfirm = null;
            speak('Cancelled.');
            showFeedback(
                'Action cancelled', '#94a3b8');
            return;
        }

        /* ── 14.11 STAFF CRUD ───────────────────── */

        // Add waiter
        const addWaiterMatch = t.match(
            /add\s+(?:new\s+)?waiter\s+([a-z\s]+)/i);
        if (addWaiterMatch) {
            const nameRaw =
                addWaiterMatch[1].trim();
            const staffName = nameRaw
                .charAt(0).toUpperCase()
                + nameRaw.slice(1);
            const username = nameRaw
                .toLowerCase().replace(/\s+/g, '');
            const password = String(
                Math.floor(1000 +
                    Math.random() * 9000));

            speak(`Adding waiter ${staffName}`);
            showFeedback(
                `Adding: ${staffName}...`,
                '#8B5CF6');

            VoxAPI.createStaff({
                name: staffName,
                username: username,
                password: password
            }).then(r => {
                if (r.ok) {
                    speak(
                        `Waiter ${staffName} added ` +
                        `with username ${username} ` +
                        `and password ${password}. ` +
                        `Please change the password ` +
                        `in staff settings.`);
                    showFeedback(
                        `Added: ${staffName} ` +
                        `(${username}/${password})`,
                        '#22c55e');
                } else {
                    const msg = r.data?.message
                        || 'Failed';
                    speak(`Failed: ${msg}`);
                    showFeedback(
                        `Failed: ${msg}`,
                        '#f87171');
                }
            });
            return;
        }

        // Delete waiter
        const delWaiterMatch = t.match(
            /(?:delete|remove)\s+(?:waiter|staff)\s+([a-z\s]+)/i);
        if (delWaiterMatch) {
            const nameRaw =
                delWaiterMatch[1].trim()
                    .toLowerCase();
            speak(`Looking for ${nameRaw}`);
            showFeedback(
                `Searching: ${nameRaw}...`,
                '#8B5CF6');

            VoxAPI.getStaff().then(r => {
                if (!r.ok || !r.data
                    || !r.data.data) {
                    speak(
                        'Could not fetch staff');
                    return;
                }
                const found = r.data.data.find(
                    s => s.name.toLowerCase()
                        .includes(nameRaw));
                if (!found) {
                    speak(
                        `Staff member ${nameRaw} ` +
                        `not found`);
                    showFeedback(
                        'Staff not found',
                        '#f87171');
                    return;
                }
                VoxAPI.deleteStaff(found._id)
                    .then(res => {
                        if (res.ok) {
                            speak(
                                `${found.name} removed.`);
                            showFeedback(
                                `Removed: ${found.name}`,
                                '#22c55e');
                        } else {
                            const msg = res.data?.message
                                || 'Failed';
                            speak(`Failed: ${msg}`);
                            showFeedback(
                                `Failed: ${msg}`,
                                '#f87171');
                        }
                    });
            });
            return;
        }

        /* ── 14.12 MENU DELETE ──────────────────── */

        const delMenuMatch = t.match(
            /(?:delete|remove)\s+menu\s+item\s+([a-z\s]+)/i);
        if (delMenuMatch) {
            const itemNameRaw =
                delMenuMatch[1].trim()
                    .toLowerCase();
            const menu = VB.getMenu();
            const found = menu.find(m => {
                const mName =
                    m.name.toLowerCase();
                return itemNameRaw.includes(mName)
                    || mName.includes(itemNameRaw);
            });

            if (found && found._id) {
                speak(
                    `Deleting ${found.name} ` +
                    `from menu`);
                showFeedback(
                    `Deleting: ${found.name}...`,
                    '#ef4444');
                VoxAPI.deleteMenuItem(found._id)
                    .then(r => {
                        if (r.ok) {
                            speak(
                                `${found.name} removed ` +
                                `from menu.`);
                            showFeedback(
                                `Removed: ${found.name}`,
                                '#22c55e');
                            if (typeof loadMenu
                                === 'function')
                                loadMenu();
                        } else {
                            speak(
                                'Failed to delete.');
                            showFeedback(
                                'Delete failed',
                                '#f87171');
                        }
                    });
            } else {
                speak(
                    `${itemNameRaw} not found ` +
                    `in menu`);
                showFeedback(
                    'Menu item not found',
                    '#f87171');
            }
            return;
        }

        /* ── 14.13 SEARCH ORDER ─────────────────── */

        const searchMatch = t.match(
            /search\s+(?:order|customer)\s+([a-z\s]+)/i)
            || t.match(
                /find\s+(?:order|customer)\s+(?:for\s+)?([a-z\s]+)/i)
            || t.match(
                /search\s+table\s+(\d+)/i);
        if (searchMatch) {
            const query = searchMatch[1].trim();
            const isTableSearch = /^\d+$/.test(query);

            VoxAPI.getOrders('today').then(r => {
                if (!r.ok || !r.data
                    || !r.data.data) {
                    speak('Could not search');
                    return;
                }
                let results;
                if (isTableSearch) {
                    results = r.data.data.filter(
                        o => String(o.tableNumber)
                            === query);
                } else {
                    results = r.data.data.filter(
                        o => (o.customerName || '')
                            .toLowerCase()
                            .includes(query)
                            || (o.waiterName || '')
                                .toLowerCase()
                                .includes(query));
                }

                if (results.length === 0) {
                    speak(
                        `No orders found for ` +
                        `${query}`);
                    showFeedback(
                        `No results for "${query}"`,
                        '#94a3b8');
                } else {
                    const summary = results
                        .slice(0, 3)
                        .map(o =>
                            `Table ${o.tableNumber}` +
                            `${o.customerName
                                ? ' ' + o.customerName
                                : ''} ` +
                            `₹${o.total}`)
                        .join(', ');
                    speak(
                        `Found ${results.length} ` +
                        `orders: ${summary}`);
                    showFeedback(
                        `${results.length} found: ` +
                        `${summary}`,
                        '#8B5CF6');
                }
            });
            return;
        }

        /* ── 14. SYSTEM COMMANDS ────────────────── */


        // Time
        if (has(t, 'time kya hai', 'what time',
            'time batao', 'current time',
            'abhi kitne baje')) {
            const now = new Date();
            const timeStr = now.toLocaleTimeString(
                'en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
            speak(`Current time is ${timeStr}`);
            showFeedback(
                `Time: ${timeStr}`, '#22D3EE');
            return;
        }

        // Reload page
        if (has(t, 'refresh', 'reload',
            'page reload', 'dobara load',
            'refresh karo', 'reload karo')) {
            speak('Refreshing page');
            showFeedback(
                'Refreshing...', '#22D3EE');
            setTimeout(() => {
                window.location.reload();
            }, 1000);
            return;
        }

        // Logout
        if (has(t, 'logout', 'log out',
            'sign out',
            'session khatam')) {
            speak('Logging out. Goodbye.');
            showFeedback('Logging out...', '#f87171');
            setTimeout(() => {
                if (window.VoxAPI) VoxAPI.logout();
                window.location.href =
                    '../pages/login.html';
            }, 1500);
            return;
        }

        // Help — list available commands
        if (has(t, 'help', 'kya bol sakta',
            'commands', 'what can you do',
            'kya kar sakte', 'commands batao',
            'guide')) {
            speak(
                'You can say: open orders, ' +
                'available tables, ready for billing, ' +
                'today summary, table 5 order, ' +
                'set GST to 5, apply 10 percent discount, ' +
                'who is free, best selling item, ' +
                'print bill table 3, settle table 5, ' +
                'save settings, export orders csv, ' +
                'search order, or say help for more.');
            showFeedback(
                'Commands: navigation | tables | ' +
                'staff | GST | discount | bills | ' +
                'revenue | menu | settings | csv | help',
                '#8B5CF6');
            return;
        }

        /* ── GUARD WAITER COMMANDS (Add Items) ──── */
        const onOrdersPage = window.location.pathname.includes('orders.html');
        if (!onOrdersPage) {
            const menu = VB.getMenu();
            const foundMenuItem = menu.find(m => t.includes(m.name.toLowerCase()) || t.includes(m.name.toLowerCase().replace('panner', 'paneer')));
            if (foundMenuItem || /(?:add|remove|quantity|repeat|undo)/i.test(t)) {
                speak('This command is available only on the voice order page.');
                showFeedback('Available only on Orders page', '#f87171');
                return;
            }
        }

        /* ── NOT RECOGNIZED ─────────────────────── */
        speak(
            'Sorry, I did not understand. ' +
            'Say help to hear available commands.');
        showFeedback(
            'Not recognized — Say "help" for commands',
            '#f87171');
    }
}


function showConfirm(options) {
    return new Promise((resolve) => {
        let overlay = document.getElementById(
            'vbConfirmOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'vbConfirmOverlay';
            overlay.style.cssText = `
                position:fixed; inset:0;
                background:rgba(0,0,0,0.6);
                display:flex; align-items:center;
                justify-content:center;
                z-index:99999;
                animation:fadeIn 0.15s ease;`;
            document.body.appendChild(overlay);
        }

        const icon = options.type === 'danger'
            ? '<i class="fa-solid fa-triangle-exclamation" style="color:#f87171;font-size:1.5rem;"></i>'
            : '<i class="fa-solid fa-circle-info" style="color:#22D3EE;font-size:1.5rem;"></i>';

        const confirmBtnStyle = options.type === 'danger'
            ? 'background:#ef4444;color:#fff;border:none;'
            : 'background:#22D3EE;color:#0B1120;border:none;';

        overlay.innerHTML = `
            <div style="
                background:#111827;
                border:1px solid rgba(255,255,255,0.1);
                border-radius:16px;
                padding:2rem;
                max-width:380px;
                width:90%;
                box-shadow:0 25px 50px rgba(0,0,0,0.6);
                animation:slideUp 0.2s ease;">
              <div style="text-align:center;
                  margin-bottom:1.25rem;">
                ${icon}
              </div>
              <h3 style="
                  font-size:1.1rem;
                  font-weight:600;
                  color:#f1f5f9;
                  text-align:center;
                  margin-bottom:0.5rem;">
                ${options.title || 'Are you sure?'}
              </h3>
              <p style="
                  font-size:0.875rem;
                  color:#94a3b8;
                  text-align:center;
                  margin-bottom:1.5rem;
                  line-height:1.5;">
                ${options.message || 'This action cannot be undone.'}
              </p>
              <div style="
                  display:flex;
                  gap:0.75rem;
                  justify-content:center;">
                <button id="vbConfirmCancel" style="
                    padding:0.6rem 1.5rem;
                    border-radius:8px;
                    border:1px solid rgba(255,255,255,0.15);
                    background:transparent;
                    color:#f1f5f9;
                    font-size:0.9rem;
                    cursor:pointer;
                    font-family:inherit;">
                  ${options.cancelText || 'Cancel'}
                </button>
                <button id="vbConfirmOk" style="
                    padding:0.6rem 1.5rem;
                    border-radius:8px;
                    ${confirmBtnStyle}
                    font-size:0.9rem;
                    font-weight:600;
                    cursor:pointer;
                    font-family:inherit;">
                  ${options.confirmText || 'Confirm'}
                </button>
              </div>
            </div>`;

        const style = document.getElementById(
            'vbConfirmStyle');
        if (!style) {
            const s = document.createElement('style');
            s.id = 'vbConfirmStyle';
            s.textContent = `
                @keyframes slideUp {
                    from{opacity:0;transform:translateY(20px)}
                    to{opacity:1;transform:translateY(0)}
                }`;
            document.head.appendChild(s);
        }

        function cleanup(result) {
            overlay.remove();
            resolve(result);
        }

        document.getElementById('vbConfirmOk')
            .addEventListener('click', () =>
                cleanup(true));
        document.getElementById('vbConfirmCancel')
            .addEventListener('click', () =>
                cleanup(false));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) cleanup(false);
        });
    });
}


function initGlobalSearch() {
    if (!window.VoxAPI || !VoxAPI.isLoggedIn())
        return;

    // Create search modal HTML (Fix 17: added background:rgba(0,0,0,0.7))
    const el = document.createElement('div');
    el.id = 'globalSearch';
    el.style.cssText = `
        display:none;
        position:fixed; inset:0;
        background:rgba(0,0,0,0.7);
        z-index:99997;
        align-items:flex-start;
        justify-content:center;
        padding-top:10vh;`;
    el.innerHTML = `
      <div style="
          background:#111827;
          border:1px solid rgba(255,255,255,0.12);
          border-radius:16px;
          width:90%; max-width:520px;
          box-shadow:0 25px 60px rgba(0,0,0,0.7);
          overflow:hidden;">
        <div style="
            display:flex; align-items:center;
            gap:0.75rem; padding:0.9rem 1.25rem;
            border-bottom:1px solid
                rgba(255,255,255,0.08);">
          <i class="fa-solid fa-magnifying-glass"
              style="color:#94a3b8;font-size:1rem;">
          </i>
          <input id="gsInput" type="text"
              placeholder="Search orders, customers, tables..."
              autocomplete="off"
              style="
                  flex:1; background:none;
                  border:none; outline:none;
                  color:#f1f5f9; font-size:1rem;
                  font-family:inherit;">
          <kbd style="
              background:rgba(255,255,255,0.08);
              border:1px solid rgba(255,255,255,0.15);
              border-radius:5px; padding:2px 7px;
              font-size:0.75rem; color:#94a3b8;
              font-family:monospace;">
            Esc
          </kbd>
        </div>
        <div id="gsResults" style="
            max-height:320px;
            overflow-y:auto;
            padding:0.5rem;">
          <div style="
              text-align:center;
              padding:2rem;
              color:#64748b;
              font-size:0.875rem;">
            Type to search orders and customers
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);

    const input = document.getElementById('gsInput');
    const results = document.getElementById('gsResults');

    function openSearch() {
        el.style.display = 'flex';
        setTimeout(() => input.focus(), 50);
    }

    function closeSearch() {
        el.style.display = 'none';
        input.value = '';
        results.innerHTML = `
            <div style="text-align:center;
                padding:2rem;color:#64748b;
                font-size:0.875rem;">
              Type to search orders and customers
            </div>`;
    }

    // Keyboard open
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) &&
            e.key === 'k') {
            e.preventDefault();
            openSearch();
        }
        if (e.key === 'Escape' &&
            el.style.display === 'flex') {
            closeSearch();
        }
    });

    // Click outside to close
    el.addEventListener('click', (e) => {
        if (e.target === el) closeSearch();
    });

    // Search logic
    let searchTimeout = null;
    input.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const q = input.value.trim().toLowerCase();
        if (!q || q.length < 2) {
            results.innerHTML = `
                <div style="text-align:center;
                    padding:2rem;color:#64748b;
                    font-size:0.875rem;">
                  Type to search orders and customers
                </div>`;
            return;
        }
        results.innerHTML = `
            <div style="text-align:center;
                padding:1.5rem;color:#64748b;
                font-size:0.875rem;">
              Searching...
            </div>`;
        searchTimeout = setTimeout(async () => {
            const r = await VoxAPI.getOrders('today');
            if (!r.ok || !r.data || !r.data.data) {
                results.innerHTML = `
                    <div style="color:#f87171;
                        text-align:center;
                        padding:1.5rem;
                        font-size:0.875rem;">
                      Could not search
                    </div>`;
                return;
            }
            const all = r.data.data;
            const found = all.filter(o =>
                String(o.tableNumber).includes(q) ||
                (o.customerName || '')
                    .toLowerCase().includes(q) ||
                (o.waiterName || '')
                    .toLowerCase().includes(q) ||
                (o.items || []).some(i =>
                    i.item.toLowerCase().includes(q))
            );
            if (found.length === 0) {
                results.innerHTML = `
                    <div style="text-align:center;
                        padding:2rem;color:#64748b;
                        font-size:0.875rem;">
                      No results for "${q}"
                    </div>`;
                return;
            }
            results.innerHTML = found.map(o => {
                const status = {
                    ordering: {
                        color: '#f59e0b',
                        label: 'Ordering'
                    },
                    ready_for_billing: {
                        color: '#22c55e',
                        label: 'Ready'
                    },
                    paid: {
                        color: '#8B5CF6',
                        label: 'Paid'
                    },
                    open: {
                        color: '#22D3EE',
                        label: 'Open'
                    }
                }[o.status] || {
                    color: '#94a3b8',
                    label: o.status
                };
                const items = (o.items || [])
                    .slice(0, 2)
                    .map(i => i.item).join(', ');
                return `
                  <div onclick="
                      window.location.href=
                      '../pages/orders.html?table=
                      ${o.tableNumber}';
                      document.getElementById(
                      'globalSearch')
                      .style.display='none';"
                      style="
                          display:flex;
                          align-items:center;
                          gap:0.75rem;
                          padding:0.65rem 0.75rem;
                          border-radius:8px;
                          cursor:pointer;
                          transition:background 0.15s;"
                      onmouseover="
                          this.style.background=
                          'rgba(255,255,255,0.05)'"
                      onmouseout="
                          this.style.background=
                          'transparent'">
                    <div style="
                        width:36px; height:36px;
                        border-radius:8px;
                        background:rgba(34,211,238,0.1);
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        font-size:0.8rem;
                        color:#22D3EE;
                        flex-shrink:0;
                        font-weight:600;">
                      T${o.tableNumber}
                    </div>
                    <div style="flex:1;min-width:0;">
                      <div style="
                          font-size:0.875rem;
                          color:#f1f5f9;
                          font-weight:500;">
                        ${o.customerName ||
                    'Table ' + o.tableNumber}
                      </div>
                      <div style="
                          font-size:0.78rem;
                          color:#64748b;
                          overflow:hidden;
                          text-overflow:ellipsis;
                          white-space:nowrap;">
                        ${items || 'No items'}
                      </div>
                    </div>
                    <div style="text-align:right;
                        flex-shrink:0;">
                      <div style="
                          font-size:0.875rem;
                          color:#f1f5f9;
                          font-weight:500;">
                        ₹${o.total || 0}
                      </div>
                      <div style="
                          font-size:0.75rem;
                          color:${status.color};">
                        ${status.label}
                      </div>
                    </div>
                  </div>`;
            }).join('');
        }, 300);
    });
}

function showUndoToast(message, onUndo,
    timeoutMs) {
    timeoutMs = timeoutMs || 5000;
    let container = document.getElementById(
        'toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.style.cssText =
            'position:fixed;bottom:1.5rem;' +
            'right:1.5rem;z-index:9999;' +
            'display:flex;flex-direction:column;' +
            'gap:0.5rem;';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.style.cssText = `
        background:#1e293b;
        border:1px solid rgba(255,255,255,0.12);
        color:#f1f5f9;
        padding:0.75rem 1rem;
        border-radius:10px;
        font-size:0.875rem;
        font-family:Inter,sans-serif;
        box-shadow:0 4px 20px rgba(0,0,0,0.4);
        display:flex;
        align-items:center;
        gap:0.75rem;
        min-width:280px;`;

    let timeLeft = Math.ceil(timeoutMs / 1000);
    toast.innerHTML = `
        <span style="flex:1;">${message}</span>
        <span id="undoCountdown"
            style="color:#64748b;
                font-size:0.8rem;
                min-width:16px;">
          ${timeLeft}s
        </span>
        <button id="undoBtn" style="
            background:rgba(34,211,238,0.15);
            border:1px solid rgba(34,211,238,0.3);
            color:#22D3EE;
            padding:0.3rem 0.75rem;
            border-radius:6px;
            font-size:0.8rem;
            cursor:pointer;
            font-family:inherit;
            font-weight:600;">
          Undo
        </button>`;

    container.appendChild(toast);
    let undone = false;

    const countdown = setInterval(() => {
        timeLeft--;
        const el = toast.querySelector(
            '#undoCountdown');
        if (el) el.textContent = timeLeft + 's';
        if (timeLeft <= 0) {
            clearInterval(countdown);
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 400);
        }
    }, 1000);

    toast.querySelector('#undoBtn')
        .addEventListener('click', () => {
            if (!undone) {
                undone = true;
                clearInterval(countdown);
                if (onUndo) onUndo();
                toast.style.opacity = '0';
                toast.style.transition = 'opacity 0.3s';
                setTimeout(() => toast.remove(), 300);
                showToast('Action undone', 'success');
            }
        });

    const timer = setTimeout(() => {
        clearInterval(countdown);
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 400);
    }, timeoutMs);

    return () => {
        clearTimeout(timer);
        clearInterval(countdown);
    };
}

function initOfflineBanner() {
    const banner = document.createElement('div');
    banner.id = 'offlineBanner';
    banner.style.cssText = `
        display:none;
        position:fixed;
        top:0; left:0; right:0;
        background:#92400e;
        color:#fef3c7;
        text-align:center;
        padding:0.5rem 1rem;
        font-size:0.85rem;
        font-weight:500;
        z-index:99996;
        display:flex;
        align-items:center;
        justify-content:center;
        gap:0.5rem;`;
    banner.innerHTML = `
        <i class="fa-solid fa-wifi"
            style="font-size:0.9rem;
                opacity:0.8;">
        </i>
        <span>Working offline —
            reconnecting to server...</span>
        <button id="retryConnect" style="
            background:rgba(255,255,255,0.2);
            border:1px solid rgba(255,255,255,0.3);
            color:#fef3c7;
            padding:0.2rem 0.75rem;
            border-radius:4px;
            font-size:0.8rem;
            cursor:pointer;
            font-family:inherit;
            margin-left:0.5rem;">
          Retry
        </button>`;
    banner.style.display = 'none';
    document.body.appendChild(banner);

    let isOffline = false;

    function setOffline(offline) {
        if (offline === isOffline) return;
        isOffline = offline;
        banner.style.display =
            offline ? 'flex' : 'none';
        if (!offline) {
            showToast(
                'Back online! Data syncing...',
                'success');
        }
    }

    // Check every 15 seconds
    async function checkConnection() {
        if (!window.VoxAPI) return;
        const r = await VoxAPI.ping();
        setOffline(!r.ok);
    }

    document.getElementById('retryConnect')
        .addEventListener('click', checkConnection);

    // Initial check after 3 seconds
    setTimeout(checkConnection, 3000);
    setInterval(checkConnection, 15000);

    // Browser online/offline events
    window.addEventListener('online', () => {
        setTimeout(checkConnection, 1000);
    });
    window.addEventListener('offline', () => {
        setOffline(true);
    });
}

/* ─────────────────────────────────────────
   GREETING SYSTEM
───────────────────────────────────────── */
function getTimeGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good Morning';
    if (hour >= 12 && hour < 17) return 'Good Afternoon';
    if (hour >= 17 && hour < 21) return 'Good Evening';
    return 'Good Night';
}

function getGreetingEmoji() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return '🌅';
    if (hour >= 12 && hour < 17) return '☀️';
    if (hour >= 17 && hour < 21) return '🌆';
    return '🌙';
}

function getGreetingSubtext() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Hope you have a great shift today.';
    if (hour >= 12 && hour < 17) return 'Keep up the great work!';
    if (hour >= 17 && hour < 21) return 'Evening shift, let\'s go!';
    return 'Working late? You\'re doing great.';
}

function showLoginGreeting() {
    const name = localStorage.getItem('userName')
        || localStorage.getItem('name')
        || localStorage.getItem('staffName')
        || localStorage.getItem('waiterName')
        || 'there';

    const greeting = getTimeGreeting();
    const message = `${greeting}, ${name}!`;

    // Show toast
    const toast = document.createElement('div');
    toast.className = 'greeting-toast';
    toast.innerHTML = `
        <div class="greeting-icon">${getGreetingEmoji()}</div>
        <div class="greeting-text">
            <div class="greeting-main">${message}</div>
            <div class="greeting-sub">${getGreetingSubtext()}</div>
        </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('visible'), 100);
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 400);
    }, 4000);

    // Wait until speak() is fully initialized then call it
    function waitForSpeak(text) {
        if (typeof window.speak === 'function') {
            window.speak(text);
        } else {
            setTimeout(() => waitForSpeak(text), 300);
        }
    }
    setTimeout(() => waitForSpeak(message), 1500);
}

// Expose globally (Fix 23: added getNextMenuId, Fix 12: added initSSENotifications)
window.VB = {
    getSettings,
    saveSettings,
    getMenu,
    saveMenu,
    getNextMenuId,
    getOrders,
    saveOrder,
    clearOrders,
    buildSidebar,
    buildTopbar,
    initSidebarBehavior,
    initOfflineBanner,
    showToast,
    showUndoToast,
    getNotifications,
    addNotification,
    clearNotifications,
    initSSENotifications,
    initManagerVoice,
    todayStr,
    getOrdersForDay,
    getOrdersForRange,
    getMostOrderedItem,
    showConfirm,
    initGlobalSearch,
    getTopItems
};

// Init Notif Panel
function initNotifPanel() {
    if (document.getElementById('notifPanel')) return; // Ensure it only runs once

    const overlay = document.createElement('div');
    overlay.className = 'notif-overlay';
    overlay.id = 'notifOverlay';

    const panel = document.createElement('div');
    panel.className = 'notif-panel';
    panel.id = 'notifPanel';
    panel.innerHTML = `
        <div class="notif-panel-header">
            <span class="notif-panel-title">Notifications</span>
            <button class="notif-mark-all" id="notifMarkAll">Mark all read</button>
        </div>
        <div class="notif-panel-body" id="notifPanelBody"></div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    const toggleOpen = () => {
        panel.classList.add('open');
        overlay.classList.add('visible');
        renderNotifPanel();
    };

    const toggleClose = () => {
        panel.classList.remove('open');
        overlay.classList.remove('visible');
    };

    document.addEventListener('click', (e) => {
        const bell = document.getElementById('notiBell');
        if (bell && (bell.contains(e.target) || e.target.closest('#notiBell'))) {
            if (panel.classList.contains('open')) toggleClose();
            else toggleOpen();
        }
    });

    overlay.addEventListener('click', toggleClose);

    document.getElementById('notifMarkAll').addEventListener('click', () => {
        const notis = getNotifications();
        notis.forEach(n => n.read = true);
        localStorage.setItem('vb_notifications', JSON.stringify(notis));
        renderNotifPanel();
        updateNotificationBadge();
    });

    renderNotifPanel();
}

// Status Bar
function initStatusBar() {
    const bar = document.createElement('div');
    bar.className = 'status-bar';
    bar.innerHTML = `
        <div class="sb-left">
            <span><i class="status-dot green" id="sb-dot"></i> <span id="sb-status-text">Server connected</span></span>
            <span style="opacity: 0.5">|</span>
            <span id="sb-tables">0 active tables</span>
        </div>
        <div class="sb-right">
            <span id="sb-sync">Last sync: just now</span>
            <span style="opacity: 0.5">|</span>
            <span>VoxBill v2.0</span>
        </div>
    `;
    document.body.appendChild(bar);

    async function tick() {
        try {
            let statuses = {};
            let isOk = false;
            if (window.VoxAPI) {
                const r = await VoxAPI.getTablesStatus();
                if (r.ok && r.data && r.data.data) {
                    statuses = r.data.data;
                    isOk = true;
                }
            } else {
                const r = await fetch('/api/tables');
                if (r.ok) {
                    const data = await r.json();
                    statuses = data.data || {};
                    isOk = true;
                }
            }

            const dot = document.getElementById('sb-dot');
            const text = document.getElementById('sb-status-text');

            if (isOk) {
                let activeCount = 0;
                for (let i = 1; i <= 20; i++) {
                    const s = statuses[i];
                    const status = typeof s === 'object' ? s.status : s;
                    if (s && status !== 'available') {
                        activeCount++;
                    }
                }
                if (dot) dot.className = 'status-dot green';
                if (text) text.textContent = 'Server connected';
                const tablesEl = document.getElementById('sb-tables');
                if (tablesEl) tablesEl.textContent = `${activeCount} active table${activeCount !== 1 ? 's' : ''}`;
            } else {
                throw new Error('Not OK');
            }
        } catch (e) {
            const dot = document.getElementById('sb-dot');
            const text = document.getElementById('sb-status-text');
            if (dot) dot.className = 'status-dot red';
            if (text) text.textContent = 'Server offline';
        }

        const syncEl = document.getElementById('sb-sync');
        if (syncEl) {
            const now = new Date();
            let hours = now.getHours();
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours ? hours : 12; // the hour '0' should be '12'
            syncEl.textContent = `Last sync: ${hours}:${minutes} ${ampm}`;
        }
    }

    tick();
    setInterval(tick, 30000);
}

// Initialize badge on load
document.addEventListener('DOMContentLoaded', () => {
    // Load saved UI mode
    const savedUiMode = localStorage.getItem('vb_ui_mode') || 'classic';
    if (savedUiMode === 'smart') {
        document.body.classList.add('ui-smart');
    }

    // Set default voice language if not set
    if (!localStorage.getItem('vb_voice_language')) {
        localStorage.setItem('vb_voice_language', 'en-IN');
    }

    // Load saved theme on every page (retaining existing dark/light as requested)
    const savedTheme = localStorage.getItem('voxbill-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    setTimeout(updateNotificationBadge, 500);
    initStatusBar();
    initNotifPanel();

    // Show login greeting once per session
    if (!sessionStorage.getItem('greeted')) {
        sessionStorage.setItem('greeted', 'true');
        // Delay slightly so the page has rendered
        setTimeout(showLoginGreeting, 600);
    }

    // Safety net — init voice if page forgot to call it
    setTimeout(() => {
        if (window.VoxAPI && VoxAPI.isManager()) {
            if (!document.getElementById('mvBtn')) {
                initManagerVoice();
            }
        }
    }, 900);
});


// end shared.js
