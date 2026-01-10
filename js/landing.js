// ProTrader Landing Page - Interactive Features

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Navbar background on scroll
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.style.background = 'rgba(10, 14, 39, 0.98)';
        navbar.style.boxShadow = '0 4px 24px rgba(0, 0, 0, 0.2)';
    } else {
        navbar.style.background = 'rgba(10, 14, 39, 0.95)';
        navbar.style.boxShadow = 'none';
    }
});

// Animate stats on scroll
const observerOptions = {
    threshold: 0.3,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe feature cards
document.querySelectorAll('.feature-card, .market-card').forEach(card => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(30px)';
    card.style.transition = 'all 0.6s ease-out';
    observer.observe(card);
});

// Update live market prices (demo animation)
function updateMarketPrices() {
    const marketItems = document.querySelectorAll('.market-item');
    marketItems.forEach(item => {
        const priceEl = item.querySelector('.market-price');
        const changeEl = item.querySelector('.market-change');

        if (priceEl && changeEl) {
            // Simulate small price change
            const currentPrice = parseFloat(priceEl.textContent.replace(/[$,]/g, ''));
            const change = (Math.random() - 0.5) * 2;
            const newPrice = currentPrice + change;

            // Update with animation
            priceEl.style.transition = 'color 0.3s';
            priceEl.textContent = `$${newPrice.toFixed(2)}`;

            if (change > 0) {
                priceEl.style.color = 'var(--accent-green)';
            } else if (change < 0) {
                priceEl.style.color = 'var(--accent-red)';
            }

            setTimeout(() => {
                priceEl.style.color = 'var(--text-primary)';
            }, 500);
        }
    });
}

// Update prices every 3 seconds
setInterval(updateMarketPrices, 3000);

// Parallax effect for hero glow
window.addEventListener('mousemove', (e) => {
    const glow = document.querySelector('.hero-glow');
    if (glow) {
        const x = e.clientX / window.innerWidth;
        const y = e.clientY / window.innerHeight;
        glow.style.transform = `translate(${x * 50}px, ${y * 50}px)`;
    }
});

// Check URL for registration parameter
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('register') === '1') {
        // If coming back from registration, show success message (optional)
        console.log('Ready to register');
    }
});

console.log('ProTrader Landing Page Loaded');
