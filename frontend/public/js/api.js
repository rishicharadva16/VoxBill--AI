/**
 * VoxBill – api.js
 * Thin browser-side API client for the Node backend (port 4000).
 *
 * Usage (all methods are async):
 *   VoxAPI.login(email, password)
 *   VoxAPI.register(name, email, password, role, restaurantName)
 *   VoxAPI.getMenu()
 *   VoxAPI.addMenuItem(item)
 *   VoxAPI.saveOrder(orderData)
 *   VoxAPI.getOrders(range)
 *   VoxAPI.getSettings()
 *   VoxAPI.saveSettings(settingsObj)
 *   VoxAPI.getAnalytics(days)
 *
 * Falls back silently if backend is unreachable.
 */

(function () {
    'use strict';

    function uniq(arr) {
        return [...new Set(arr.filter(Boolean))];
    }

    function buildBaseCandidates() {
        // Optional manual override from config.js
        if (window.VOX_API_BASE && typeof window.VOX_API_BASE === 'string') {
            return [window.VOX_API_BASE.replace(/\/$/, '')];
        }

        const host = window.location.hostname;
        const isLocal = host === 'localhost' || host === '127.0.0.1';

        if (isLocal) {
            // Try same-origin proxy first (frontend server), then direct backend.
            return uniq([
                '/api',
                'http://127.0.0.1:3000/api',
                'http://localhost:3000/api',
                'http://127.0.0.1:4000',
                'http://localhost:4000'
            ]);
        }

        // Production: Vercel server proxy first, then direct backend fallback.
        return uniq([
            '/api',
            'https://voxill-backend.onrender.com'
        ]);
    }

    const BASE_CANDIDATES = buildBaseCandidates();
    let activeBase = BASE_CANDIDATES[0] || '';

    /* ── Auth token helpers ──────────────────────────── */
    function getToken() { return sessionStorage.getItem('vb_jwt') || ''; }
    function setToken(t) { sessionStorage.setItem('vb_jwt', t); }
    function clearToken() { sessionStorage.removeItem('vb_jwt'); localStorage.removeItem('vb_db_user'); }

    function getUser() {
        try { return JSON.parse(localStorage.getItem('vb_db_user') || 'null'); }
        catch (e) { return null; }
    }

    /* ── Core fetch wrapper ──────────────────────────── */
    function isRouteMissing(status, json) {
        if (status !== 404) return false;
        const msg = (json && (json.message || json.error)) || '';
        return typeof msg === 'string' && /route\s+\w+\s+.+\s+not\s+found/i.test(msg);
    }

    async function call(method, path, body) {
        const headers = { 'Content-Type': 'application/json' };
        const token = getToken();
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const tried = uniq([activeBase, ...BASE_CANDIDATES]);
        let lastNetworkErr = null;

        for (const base of tried) {
            try {
                const res = await fetch(`${base}${path}`, {
                    method,
                    headers,
                    body: body ? JSON.stringify(body) : undefined
                });
                const json = await res.json().catch(() => ({}));

                if (res.ok) {
                    activeBase = base;
                    return { ok: true, status: res.status, data: json };
                }

                // If this endpoint shape is wrong (/api prefix mismatch), try next candidate.
                const shouldRetry = isRouteMissing(res.status, json) || res.status === 502 || res.status === 503;
                if (shouldRetry) {
                    continue;
                }

                return { ok: false, status: res.status, data: json };
            } catch (err) {
                lastNetworkErr = err;
            }
        }

        // Network error — backend might be offline on all candidates
        console.warn('[VoxAPI] backend unreachable:', lastNetworkErr ? lastNetworkErr.message : 'All API candidates failed');
        return {
            ok: false,
            status: 0,
            data: null,
            offline: true,
            error: lastNetworkErr ? lastNetworkErr.message : 'All API candidates failed'
        };
    }

    /* ── Auth ────────────────────────────────────────── */
    async function login(email, password, username = null) {
        const payload = username ? { username, password } : { email, password };
        const r = await call('POST', '/auth/login', payload);
        if (r.ok && r.data.token) {
            setToken(r.data.token);
            localStorage.setItem('vb_db_user', JSON.stringify(r.data.user));
            // Persist restaurantId so we can show staff list on next login
            if (r.data.user.restaurantId) {
                localStorage.setItem('vb_last_restaurant_id', r.data.user.restaurantId);
                // Also store name if we have it from the user object if available, though backend user object usually has it
                if (r.data.user.restaurantName) {
                    localStorage.setItem('vb_last_restaurant_name', r.data.user.restaurantName);
                }
            }
        }
        return r;
    }

    async function register(name, email, password, role = 'waiter', restaurantName = '') {
        const r = await call('POST', '/auth/register', { name, email, password, role, restaurantName });
        if (r.ok && r.data.token) {
            setToken(r.data.token);
            localStorage.setItem('vb_db_user', JSON.stringify(r.data.user));
        }
        return r;
    }

    async function forgotPassword(email) {
        return call('POST', '/auth/forgot-password', { email });
    }

    async function resetPassword(token, password) {
        return call('POST', `/auth/reset-password/${encodeURIComponent(token)}`, { password });
    }

    function logout() { clearToken(); window.location.href = '/pages/login.html'; }
    function isLoggedIn() { return !!getToken(); }
    function isManager() { const u = getUser(); return u && u.role === 'manager'; }

    /* ── Menu ────────────────────────────────────────── */
    async function getMenu() {
        return call('GET', '/menu');
    }

    async function addMenuItem(item) {
        return call('POST', '/menu', item);
    }

    async function updateMenuItem(id, item) {
        return call('PUT', `/menu/${id}`, item);
    }

    async function deleteMenuItem(id) {
        return call('DELETE', `/menu/${id}`);
    }

    async function bulkSyncMenu(items) {
        return call('POST', '/menu/bulk', { items });
    }

    async function saveOrder(orderData) {
        return call('POST', '/orders', {
            tableNumber: orderData.tableNo || orderData.tableNumber,
            customerName: orderData.customerName || '',
            items: orderData.items || [],
            status: orderData.status,
            notes: orderData.note || orderData.notes || '',
            subtotal: orderData.subtotal,
            discountAmt: orderData.discountAmt,
            gst: orderData.gst,
            total: orderData.total
        });
    }

    async function processRushImage(imagePayload) {
        return call('POST', '/orders/rush-ocr', imagePayload);
    }

    async function saveDraftOrder(orderData) {
        return call('POST', '/orders', {
            tableNumber: orderData.tableNo || orderData.tableNumber,
            customerName: orderData.customerName || '',
            items: orderData.items || [],
            status: 'draft',
            notes: orderData.note || orderData.notes || '',
            subtotal: orderData.subtotal || 0,
            discountAmt: orderData.discountAmt || 0,
            gst: orderData.gst || 0,
            total: orderData.total || 0
        });
    }

    async function getDraftOrders() {
        return call('GET', '/orders?status=draft');
    }

    async function resumeDraftOrder(orderId) {
        return call('GET', `/orders/${orderId}`);
    }

    async function settleOrder(orderId, settlementData) {
        return call('PATCH', `/orders/${orderId}/pay`, settlementData);
    }

    async function updateOrder(orderId, updateData) {
        return call('PATCH', `/orders/${orderId}`, updateData);
    }

    async function getOrders(range = 'today') {
        const isNum = !isNaN(parseInt(range));
        return call('GET', `/orders?range=${isNum ? range : range}`);
    }

    async function getOrder(id) {
        return call('GET', `/orders/${id}`);
    }

    // Fix 19: Clear all orders from database
    async function clearAllOrders() {
        return call('DELETE', '/orders/all');
    }

    // Fix 19: Clear all menu items from database
    async function clearAllMenu() {
        return call('DELETE', '/menu/all');
    }

    /* ── Settings ────────────────────────────────────── */
    async function getSettings() {
        return call('GET', '/settings');
    }

    async function saveSettings(settings) {
        return call('POST', '/settings', settings);
    }

    /* ── Analytics ───────────────────────────────────── */
    async function getAnalytics(days = 1) {
        return call('GET', `/analytics?days=${days}`);
    }

    /* ── Staff ───────────────────────────────────────── */
    async function getStaff() {
        return call('GET', '/staff');
    }

    async function createStaff(staffData) {
        return call('POST', '/staff', staffData);
    }

    async function deleteStaff(id) {
        return call('DELETE', `/staff/${id}`);
    }

    async function getStaffByRestaurant(restaurantId) {
        return call('GET', `/auth/staff/${restaurantId}`);
    }

    async function getRestaurants() {
        return call('GET', '/auth/restaurants');
    }

    async function getRestaurantById(id) {
        return call('GET', `/auth/restaurants/${id}`);
    }

    // Fix 17: PIN-based restaurant lookup
    async function getRestaurantByPin(pin) {
        return call('POST', '/auth/staff-restaurant', { pin });
    }

    async function getTablesStatus() {
        return call('GET', '/orders/tables/status');
    }

    async function ping() {
        return call('GET', '/health');
    }

    /* ── Expose globally ─────────────────────────────── */
    window.VoxAPI = {
        // Auth
        login, register, forgotPassword, resetPassword, logout, isLoggedIn, isManager, getUser,
        // Menu
        getMenu, addMenuItem, updateMenuItem, deleteMenuItem, bulkSyncMenu, clearAllMenu,
        // Orders
        saveOrder, processRushImage, saveDraftOrder, getDraftOrders, resumeDraftOrder,
        settleOrder, updateOrder, getOrders, getOrder, getTablesStatus, clearAllOrders,
        // Settings
        getSettings, saveSettings,
        // Analytics
        getAnalytics,
        // Staff
        getStaff, createStaff, deleteStaff, getStaffByRestaurant,
        getRestaurants, getRestaurantById, getRestaurantByPin,
        // Utils
        ping
    };

    // Auto-ping backend on load (silent)
    ping().then(r => {
        if (r.ok) {
            console.log('%c✅ VoxBill Backend connected (port 4000)', 'color:#22D3EE;font-weight:bold');
        } else {
            console.warn('%c⚠️  VoxBill Backend unreachable – using localStorage offline mode', 'color:#f59e0b');
        }
    });

})();

