// Smooth scroll and active link indicator for TOC
document.querySelectorAll('.legal-toc-link').forEach(link => {
  link.addEventListener('click', (e) => {
    const targetId = link.getAttribute('href');
    if (targetId.startsWith('#')) {
      e.preventDefault();
      const targetEl = document.querySelector(targetId);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth' });
        document.querySelectorAll('.legal-toc-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
      }
    }
  });
});

// IntersectionObserver to highlight TOC item on scroll
const sections = document.querySelectorAll('.legal-section');
const navLinks = document.querySelectorAll('.legal-toc-link');
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const id = entry.target.getAttribute('id');
      navLinks.forEach(link => {
        if (link.getAttribute('href') === '#' + id) {
          link.classList.add('active');
        } else {
          link.classList.remove('active');
        }
      });
    }
  });
}, { threshold: 0.3 });
sections.forEach(s => observer.observe(s));
