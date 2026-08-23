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

// --- CART STATE MANAGEMENT ---
let cart = JSON.parse(localStorage.getItem('rannabari_cart')) || [];

function saveCart() {
    localStorage.setItem('rannabari_cart', JSON.stringify(cart));
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

function createChefCardHTML(chef) {
    return `
        <a href="singlecook.html?id=${chef.id}" class="cook-card">
            ${chef.isVerified ? `<div class="badge-verified">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
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
                ${chef.ecoBadge ? `<div class="badge-eco" style="font-size: 11px; padding: 6px 12px; border-radius: var(--radius-pill); background: rgba(78,108,80,0.1); color: var(--color-secondary); font-weight: 600;">${chef.ecoBadge}</div>` : ''}
            </div>
            <div class="cook-footer">
                <div class="cook-rating">⭐ ${chef.rating} <small>(${chef.reviewCount})</small></div>
                <div class="cook-action">VIEW MENU <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div>
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
    
    const savedTheme = localStorage.getItem('theme');
    if(savedTheme) {
        html.setAttribute('data-theme', savedTheme);
        updateToggleIcon(savedTheme, toggle);
    }

    toggle.addEventListener('click', () => {
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateToggleIcon(newTheme, toggle);
    });
}

function updateToggleIcon(theme, toggle) {
    if (theme === 'dark') {
        toggle.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
    } else {
        toggle.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
    }
}
