/**
 * VoxBill – global.js
 * Loaded on EVERY page. Handles:
 *   • Sidebar collapse/expand with localStorage persistence
 *   • Mobile overlay dismissal
 *   • Active nav-item highlighting based on current page filename
 */
(function () {
    'use strict';

    // ── Route Guard ─────────────────────────────────────────
    const PROTECTED_PAGES = ['dashboard.html', 'analytics.html', 'settings.html', 'menu.html', 'orders.html', 'voice.html', 'tables.html', 'staff.html'];
    const currentFile = window.location.pathname.split('/').pop() || 'dashboard.html';

    function checkAuth() {
        if (!window.VoxAPI) return; // Wait for api.js

        const isLoginPage = currentFile === 'login.html';
        const isLoggedIn = VoxAPI.isLoggedIn();

        if (!isLoggedIn && PROTECTED_PAGES.includes(currentFile)) {
            window.location.href = '../pages/login.html';
            return false;
        }
        if (isLoggedIn && isLoginPage) {
            window.location.href = '../pages/dashboard.html';
            return false;
        }

        // Feature 6: Protect Manager Pages
        const MANAGER_ONLY = ['menu.html', 'analytics.html', 'settings.html', 'staff.html'];
        if (isLoggedIn && MANAGER_ONLY.includes(currentFile) && !VoxAPI.isManager()) {
            window.location.href = '../pages/dashboard.html';
            return false;
        }

        return true;
    }

    // ── Logout Handler ──────────────────────────────────────
    window.logout = async function() {
        const ok = await VB.showConfirm({
            title: 'Sign out?',
            message: 'You will need to sign in again to access VoxBill.',
            confirmText: 'Sign Out',
            cancelText: 'Cancel',
            type: 'info'
        });
        if (!ok) return;
        sessionStorage.removeItem('greeted');
        if (window.VoxAPI) VoxAPI.logout();
        window.location.href = '/pages/login.html';
    };

    // Use delegation for logout button as it's injected dynamically
    document.addEventListener('click', (e) => {
        if (e.target.closest('#logoutBtn')) {
            e.preventDefault();
            window.logout();
        }
    });

    // ── Run after DOM is ready ──────────────────────────────
    function init() {
        if (!checkAuth()) return;

        const sidebar        = document.getElementById('sidebar');
        const sidebarToggle  = document.getElementById('sidebarToggle');
        const mobileMenuBtn  = document.getElementById('mobileMenu');
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        const mainEl         = document.getElementById('main');

        if (!sidebar) return; // No sidebar on this page — bail.

        // ── Restore persisted state ─────────────────────────
        const wasExpanded = localStorage.getItem('vb_sidebar_expanded') === 'true';
        if (wasExpanded && window.innerWidth > 720) {
            sidebar.classList.add('expanded');
            mainEl && mainEl.classList.add('shifted');
        }

        // ── Desktop toggle (hamburger inside sidebar) ───────
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const isNowExpanded = sidebar.classList.toggle('expanded');
                mainEl && mainEl.classList.toggle('shifted', isNowExpanded);
                localStorage.setItem('vb_sidebar_expanded', isNowExpanded);
            });
        }

        // ── Mobile hamburger (in dynamic topbar) ────────────
        // Re-attach listener using delegation because topbar is dynamic
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('#mobileMenu');
            if (btn) {
                const isOpen = sidebar.classList.toggle('mobile-open');
                sidebarOverlay && sidebarOverlay.classList.toggle('active', isOpen);
            }
        });

        // ── Overlay click → close mobile sidebar ───────────
        if (sidebarOverlay) {
            sidebarOverlay.addEventListener('click', () => {
                sidebar.classList.remove('mobile-open');
                sidebarOverlay.classList.remove('active');
            });
        }

        // ── Highlight active nav item by URL filename ───────
        const currentFile = window.location.pathname.split('/').pop() || 'dashboard.html';
        document.querySelectorAll('.nav-item').forEach(item => {
            const href = (item.getAttribute('href') || '').split('#')[0].split('/').pop();
            if (href && href === currentFile) {
                item.classList.add('active');
            } else if (!href.includes('.html') && currentFile === 'dashboard.html') {
                // Hash anchors on dashboard.html — don't remove active from the first link
            }
        });

        // ── Sidebar hover tooltip accessibility ─────────────
        // (already handled by CSS ::after, nothing extra needed)

        // ── Responsive: handle resize ───────────────────────
        window.addEventListener('resize', () => {
            if (window.innerWidth <= 720) {
                sidebar.classList.remove('expanded');
                mainEl && mainEl.classList.remove('shifted');
            } else {
                sidebar.classList.remove('mobile-open');
                sidebarOverlay && sidebarOverlay.classList.remove('active');
                const saved = localStorage.getItem('vb_sidebar_expanded') === 'true';
                if (saved) {
                    sidebar.classList.add('expanded');
                    mainEl && mainEl.classList.add('shifted');
                }
            }
        });
    }

    // ── Keyboard shortcuts ──────────────────────
    document.addEventListener('keydown', (e) => {
        // Skip if user is typing in an input
        const tag = document.activeElement.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' ||
            tag === 'SELECT') return;

        // Skip if modifier keys held
        if (e.ctrlKey || e.metaKey || e.altKey) return;

        const key = e.key.toLowerCase();

        // Navigation shortcuts
        const shortcuts = {
            'd': '../pages/dashboard.html',
            't': '../pages/tables.html',
            'o': '../pages/orders.html',
            'm': '../pages/menu.html',
            'a': '../pages/analytics.html',
            's': '../pages/staff.html',
        };

        if (shortcuts[key]) {
            e.preventDefault();
            window.location.href = shortcuts[key];
            return;
        }

        // Show cheatsheet
        if (e.key === '?') {
            e.preventDefault();
            showShortcutsModal();
            return;
        }

        // Close modal on Escape
        if (e.key === 'Escape') {
            const modal = document.getElementById(
                'shortcutsModal');
            if (modal) modal.remove();
        }
    });

    function showShortcutsModal() {
        if (document.getElementById(
            'shortcutsModal')) return;
        const modal = document.createElement('div');
        modal.id = 'shortcutsModal';
        modal.style.cssText = `
            position:fixed; inset:0;
            background:rgba(0,0,0,0.6);
            display:flex; align-items:center;
            justify-content:center;
            z-index:99998;`;
        modal.innerHTML = `
          <div style="
              background:#111827;
              border:1px solid rgba(255,255,255,0.1);
              border-radius:16px;
              padding:1.5rem;
              min-width:320px;
              box-shadow:0 25px 50px rgba(0,0,0,0.6);">
            <div style="display:flex;
                justify-content:space-between;
                align-items:center;
                margin-bottom:1.25rem;">
              <h3 style="
                  font-size:1rem;font-weight:600;
                  color:#f1f5f9;">
                Keyboard shortcuts
              </h3>
              <button onclick="document.getElementById(
                  'shortcutsModal').remove()" style="
                  background:none;border:none;
                  color:#94a3b8;cursor:pointer;
                  font-size:1.2rem;">
                ×
              </button>
            </div>
            ${[
            ['D', 'Dashboard'],
            ['T', 'Tables'],
            ['O', 'Orders'],
            ['M', 'Menu'],
            ['A', 'Analytics'],
            ['S', 'Staff'],
            ['?', 'Show shortcuts'],
            ['Esc', 'Close modal'],
        ].map(([k, v]) => `
              <div style="
                  display:flex;
                  align-items:center;
                  justify-content:space-between;
                  padding:0.4rem 0;
                  border-bottom:1px solid
                      rgba(255,255,255,0.05);">
                <span style="
                    font-size:0.85rem;
                    color:#94a3b8;">
                  ${v}
                </span>
                <kbd style="
                    background:rgba(255,255,255,0.08);
                    border:1px solid
                        rgba(255,255,255,0.15);
                    border-radius:5px;
                    padding:2px 8px;
                    font-size:0.8rem;
                    color:#f1f5f9;
                    font-family:monospace;">
                  ${k}
                </kbd>
              </div>`).join('')}
          </div>`;
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
        document.body.appendChild(modal);
    }
    // ── Attach to DOM ready ─────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
