// Global Application Logic for Ranna Bari

const DB = {
    chefs: 'data/chefs.json',
    menus: 'data/menus.json',
    reviews: 'data/reviews.json'
};

// --- DATA FETCHING ---
async function fetchData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Network response was not ok');
        return await response.json();
    } catch (error) {
        console.error('Error fetching data:', error);
        return [];
    }
}

// --- SAFE STORAGE ---
// localStorage throws outright in some contexts (Safari private mode, blocked
// site data, restricted iframes). These ran at the top level of this file, so
// one throw took down the theme toggle, cart badge and chef rendering on every
// page. Every access is guarded and degrades to in-memory only.
const store = {
    get(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    set(key, value) {
        try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
    },
    getJSON(key, fallback) {
        try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
        catch (e) { return fallback; }
    }
};

// --- CART STATE MANAGEMENT ---
let cart = store.getJSON('rannabari_cart', []);
if (!Array.isArray(cart)) cart = [];

function saveCart() {
    store.set('rannabari_cart', JSON.stringify(cart));
    updateCartBadge();
}

function addToCart(item, qty = 1) {
    const existing = cart.find(i => i.id === item.id);
    if (existing) {
        existing.qty += qty;
    } else {
        cart.push({ ...item, qty });
    }
    saveCart();
    
    // Show a toast or feedback (optional)
    alert(`Added ${item.name} to cart!`);
}

function removeFromCart(id) {
    cart = cart.filter(i => i.id !== id);
    saveCart();
    if(typeof renderCart === 'function') renderCart(); // Re-render if on cart page
}

function updateCartQty(id, change) {
    const item = cart.find(i => i.id === id);
    if(item) {
        item.qty += change;
        if(item.qty <= 0) {
            removeFromCart(id);
        } else {
            saveCart();
            if(typeof renderCart === 'function') renderCart();
        }
    }
}

function updateCartBadge() {
    const badges = document.querySelectorAll('.cart-badge');
    const totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
    badges.forEach(b => {
        b.textContent = totalItems;
        b.style.display = totalItems > 0 ? 'flex' : 'none';
    });
}


// --- UI RENDERING HELPERS ---

// Reference a symbol from the inline sprite at the top of every page.
function icon(name, cls = 'ico') {
    return `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

function createChefCardHTML(chef, index = 1) {
    const delay = (index % 5) + 1; // Generates delays 1-5
    return `
        <a href="singlecook.html?id=${chef.id}" class="cook-card reveal-item delay-${delay}">
            ${chef.isVerified ? `<div class="badge-verified">
                ${icon('shieldCheck')}
                Verified Kitchen
            </div>` : ''}
            <div class="cook-header">
                <img src="${chef.avatar}" alt="${chef.name}" class="cook-avatar">
                <div>
                    <div class="cook-name">${chef.name}</div>
                    <div class="cook-specialty">${chef.specialty}</div>
                </div>
            </div>
            <div class="cook-tags">
                ${chef.tags.slice(0, 3).map(tag => `<span class="tag">${tag}</span>`).join('')}
                ${chef.ecoBadge ? `<div class="badge-eco">${icon('leaf')}${chef.ecoBadge}</div>` : ''}
            </div>
            <div class="cook-footer">
                <div class="cook-rating">${icon('star')} ${chef.rating} <small>(${chef.reviewCount})</small></div>
                <div class="cook-action">View menu ${icon('arrowRight', 'ico ico-sm')}</div>
            </div>
        </a>
    `;
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    updateCartBadge();
    initTheme();
});

// Theme Logic
function initTheme() {
    const toggle = document.getElementById('themeToggle');
    if(!toggle) return;
    const html = document.documentElement;
    
    const savedTheme = store.get('theme');
    if(savedTheme) {
        html.setAttribute('data-theme', savedTheme);
        updateToggleIcon(savedTheme, toggle);
    }

    toggle.addEventListener('click', () => {
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        html.setAttribute('data-theme', newTheme);
        store.set('theme', newTheme);
        updateToggleIcon(newTheme, toggle);
    });
}

function updateToggleIcon(theme, toggle) {
    toggle.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
    toggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
}

// --- SCROLL REVEAL ANIMATIONS ---
function initScrollReveal() {
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.15
    };

    const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('reveal-active');
                // Optional: stop observing once revealed
                // observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    const revealElements = document.querySelectorAll('.reveal-item, .reveal-left, .reveal-right, .reveal-scale');
    revealElements.forEach(el => observer.observe(el));
}

// Call initScrollReveal after DOM load
document.addEventListener('DOMContentLoaded', () => {
    initScrollReveal();
});

// Since we load dynamic content (chefs/reviews), we should also call it after fetching data
// Let's hook into the global fetch to re-trigger reveal for new elements, 
// but an easier way is to just call it again after dynamic renders.
const originalRenderChefCards = typeof createChefCardHTML !== 'undefined' ? true : false;
// Note: for browsecook and index.html, they render asynchronously.
// It's best to call initScrollReveal() after they finish rendering their grids.

// Auto-add reveal classes to common UI elements to make the whole site animated
function addGlobalAnimations() {
    const selectors = [
        '.section-title',
        '.section-header p',
        '.mood-pill',
        '.testimonial-card',
        '.bento-item', '.bento-box', /* For the 'how it works' section */
        '.footer .container > *'
    ];
    
    selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach((el, index) => {
            if (!el.classList.contains('reveal-item') && !el.classList.contains('reveal-left') && !el.classList.contains('reveal-right') && !el.classList.contains('reveal-scale')) {
                el.classList.add('reveal-item');
                el.classList.add('delay-' + ((index % 5) + 1));
            }
        });
    });
}

// Hook it into the initialization
const originalInitScrollReveal = initScrollReveal;
initScrollReveal = function() {
    addGlobalAnimations();
    originalInitScrollReveal();
};
