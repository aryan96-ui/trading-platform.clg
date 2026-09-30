// ProTrader Landing Page - Interactive Features & Animations

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

// Navbar background on scroll
window.addEventListener('scroll', () => {
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    navbar.style.background = window.scrollY > 50
      ? 'rgba(10, 14, 23, 0.98)' : 'rgba(10, 14, 23, 0.8)';
    navbar.style.boxShadow = window.scrollY > 50
      ? '0 4px 24px rgba(0, 0, 0, 0.3)' : 'none';
  }
});

// Generate mini chart bars
function generateMiniChart(containerId, bullish) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const barCount = 20;
  let html = '';
  for (let i = 0; i < barCount; i++) {
    const height = 20 + Math.random() * 80;
    const isUp = bullish ? Math.random() > 0.35 : Math.random() > 0.65;
    html += '<div class="bar ' + (isUp ? 'up' : 'down') + '" style="height:' + height + '%"></div>';
  }
  container.innerHTML = html;
}

// Generate TV chart bars
function generateTVChart() {
  const container = document.getElementById('tv-chart');
  if (!container) return;
  const barCount = 40;
  let html = '';
  let base = 50;
  for (let i = 0; i < barCount; i++) {
    base += (Math.random() - 0.45) * 8;
    base = Math.max(15, Math.min(95, base));
    const isUp = i > 0 && base > (base + (Math.random() - 0.5) * 5);
    const color = isUp ? 'var(--green)' : 'var(--red)';
    html += '<div class="bar" style="height:' + base + '%;background:' + color + ';opacity:0.7"></div>';
  }
  container.innerHTML = html;
}

// Initialize charts
generateMiniChart('chart-nifty', true);
generateMiniChart('chart-banknifty', true);
generateMiniChart('chart-btc', true);
generateMiniChart('chart-gold', false);
generateTVChart();

// Animate stats on scroll (count up effect)
const observerOptions = { threshold: 0.3 };
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, observerOptions);

document.querySelectorAll('.feature-card, .market-overview-card, .trading-features').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(30px)';
  el.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
  observer.observe(el);
});

// Live price simulation on hero market cards
function simulatePrices() {
  document.querySelectorAll('.market-card-price').forEach(el => {
    const text = el.textContent;
    const num = parseFloat(text.replace(/[\u20B9,]/g, ''));
    if (!isNaN(num) && num > 100) {
      const change = num * (Math.random() - 0.5) * 0.002;
      const newNum = num + change;
      const changeEl = el.parentElement.querySelector('.market-card-change');
      if (changeEl) {
        const isUp = change >= 0;
        changeEl.className = 'market-card-change ' + (isUp ? 'positive' : 'negative');
        changeEl.textContent = (isUp ? '+' : '') + ((change / num) * 100).toFixed(2) + '%';
      }
    }
  });
}

setInterval(simulatePrices, 3000);

// Parallax effect for hero
window.addEventListener('mousemove', (e) => {
  const x = e.clientX / window.innerWidth;
  const y = e.clientY / window.innerHeight;
  const grid = document.querySelector('.hero-grid');
  if (grid) {
    grid.style.transform = 'translate(' + (x * 10) + 'px, ' + (y * 10) + 'px)';
  }
});

console.log('ProTrader Landing Page Loaded');
