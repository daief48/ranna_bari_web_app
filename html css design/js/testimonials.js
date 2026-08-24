/* =========================================================
   RANNABARI — TESTIMONIALS SLIDER
   Renders data/reviews.json into a native scroll-snap track.

   There is no carousel library and no "current index" variable.
   The scroller's own scrollLeft is the single source of truth:
   the buttons and dots just call scrollTo, and the active dot is
   read back off the scroll position. That way a touch swipe, a
   trackpad flick, a keyboard arrow and a dot click can never end
   up disagreeing about which slide is showing.
   ========================================================= */

(function () {
    'use strict';

    var track = document.getElementById('tmTrack');
    if (!track) return;

    var dotsEl = document.getElementById('tmDots');
    var prevBtn = document.getElementById('tmPrev');
    var nextBtn = document.getElementById('tmNext');
    var scoreEl = document.getElementById('tmScore');

    var AUTOPLAY_MS = 5200;
    var cards = [];
    var timer = null;
    var paused = false;

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    function stars(n) {
        var out = '';
        for (var i = 0; i < n; i++) out += icon('star');
        return '<div class="rating-stars" aria-label="' + n + ' out of 5">' + out + '</div>';
    }

    /* ---------- Render ---------- */
    function cardHTML(r, chefName) {
        // "Ordered from Fatema B. · Dhanmondi" reads as a real order, which is
        // the whole point of the section. Fall back gracefully if either is
        // missing from the data.
        var bits = [];
        if (chefName) bits.push('Ordered from <b>' + esc(chefName) + '</b>');
        if (r.area) bits.push(esc(r.area));
        var meta = bits.join(' &middot; ') || 'Verified order';

        return '<article class="tm-card">' +
            '<span class="tm-quote" aria-hidden="true">&rdquo;</span>' +
            stars(r.rating) +
            '<p class="tm-text">' + esc(r.text) + '</p>' +
            '<div class="tm-author">' +
                '<img class="tm-avatar" src="' + esc(r.avatar) + '" alt="" loading="lazy" width="46" height="46">' +
                '<span class="tm-who">' +
                    '<span class="tm-name">' + esc(r.name) + '</span>' +
                    '<span class="tm-meta">' + meta + '</span>' +
                '</span>' +
            '</div>' +
        '</article>';
    }

    function renderScore(chefs, reviews) {
        if (!scoreEl || !chefs.length) return;
        // Weight each kitchen's rating by how many reviews it actually has,
        // otherwise a 5.0 from one order counts as much as a 4.8 from 200.
        var totalReviews = chefs.reduce(function (n, c) { return n + (c.reviewCount || 0); }, 0);
        if (!totalReviews) return;
        var weighted = chefs.reduce(function (n, c) { return n + c.rating * (c.reviewCount || 0); }, 0);
        var avg = weighted / totalReviews;

        scoreEl.innerHTML =
            '<span class="tm-score-num">' + avg.toFixed(1) + '</span>' +
            '<span class="tm-score-meta">' +
                stars(Math.round(avg)) +
                '<span>' + totalReviews.toLocaleString('en-US') + ' reviews across ' + chefs.length + ' kitchens</span>' +
            '</span>';
        scoreEl.hidden = false;
    }

    /* ---------- Geometry ----------
       Read the step off the DOM instead of hard-coding a card width, so the
       clamp()/vw sizing in CSS stays the only place it is defined. */
    function step() {
        if (cards.length < 2) return track.clientWidth;
        return Math.round(cards[1].offsetLeft - cards[0].offsetLeft);
    }

    function maxScroll() {
        return track.scrollWidth - track.clientWidth;
    }

    function activeIndex() {
        var s = step();
        if (!s) return 0;
        // At the very end the last card can never reach the left edge, so snap
        // the reading to the final index rather than reporting a stale one.
        if (maxScroll() - track.scrollLeft < 2) return cards.length - 1;
        return Math.min(cards.length - 1, Math.round(track.scrollLeft / s));
    }

    function goTo(i, smooth) {
        var s = step();
        var target = Math.max(0, Math.min(i, cards.length - 1));
        track.scrollTo({
            left: Math.min(target * s, maxScroll()),
            behavior: (smooth === false || reduceMotion) ? 'auto' : 'smooth'
        });
    }

    /* ---------- Controls ---------- */
    function buildDots() {
        if (!dotsEl) return;
        dotsEl.innerHTML = cards.map(function (_, i) {
            return '<button type="button" class="tm-dot" role="tab" aria-selected="false" ' +
                   'aria-label="Review ' + (i + 1) + ' of ' + cards.length + '"></button>';
        }).join('');
        Array.prototype.forEach.call(dotsEl.children, function (dot, i) {
            dot.addEventListener('click', function () { pause(); goTo(i); });
        });
    }

    function syncControls() {
        var i = activeIndex();
        if (dotsEl) {
            Array.prototype.forEach.call(dotsEl.children, function (dot, n) {
                dot.setAttribute('aria-selected', String(n === i));
            });
        }
        if (prevBtn) prevBtn.disabled = track.scrollLeft < 2;
        if (nextBtn) nextBtn.disabled = maxScroll() - track.scrollLeft < 2;
    }

    /* ---------- Autoplay ---------- */
    function tick() {
        if (paused) return;
        // Wrap back to the start once the last card is fully shown.
        if (maxScroll() - track.scrollLeft < 2) goTo(0);
        else goTo(activeIndex() + 1);
    }

    function play() {
        if (reduceMotion || timer || cards.length < 2) return;
        timer = setInterval(tick, AUTOPLAY_MS);
    }
    function stop() {
        clearInterval(timer);
        timer = null;
    }
    /* Any deliberate interaction ends autoplay for good -- resuming under
       someone who is reading is worse than never having autoplayed. */
    function pause() {
        paused = true;
        stop();
    }

    function wire() {
        if (prevBtn) prevBtn.addEventListener('click', function () { pause(); goTo(activeIndex() - 1); });
        if (nextBtn) nextBtn.addEventListener('click', function () { pause(); goTo(activeIndex() + 1); });

        var raf = null;
        track.addEventListener('scroll', function () {
            if (raf) return;
            raf = requestAnimationFrame(function () { raf = null; syncControls(); });
        }, { passive: true });

        track.addEventListener('pointerdown', pause, { passive: true });
        track.addEventListener('wheel', pause, { passive: true });
        track.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') pause();
        });

        // Hover and keyboard focus only suspend it; moving away resumes.
        var shell = track.closest('.tm-shell') || track;
        shell.addEventListener('mouseenter', stop);
        shell.addEventListener('mouseleave', function () { if (!paused) play(); });
        shell.addEventListener('focusin', stop);
        shell.addEventListener('focusout', function () { if (!paused) play(); });

        // Don't animate a section nobody is looking at.
        if ('IntersectionObserver' in window) {
            new IntersectionObserver(function (entries) {
                entries.forEach(function (en) {
                    if (en.isIntersecting && !paused) play();
                    else stop();
                });
            }, { threshold: 0.25 }).observe(track);
        } else {
            play();
        }

        window.addEventListener('resize', syncControls);
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) stop();
            else if (!paused) play();
        });
    }

    /* ---------- Boot ---------- */
    document.addEventListener('DOMContentLoaded', function () {
        Promise.all([fetchData(DB.reviews), fetchData(DB.chefs)]).then(function (res) {
            var reviews = res[0] || [];
            var chefs = res[1] || [];
            if (!reviews.length) return;   // keep the hand-written fallback cards

            var chefById = {};
            chefs.forEach(function (c) { chefById[c.id] = c.name; });

            track.innerHTML = reviews.map(function (r) {
                return cardHTML(r, chefById[r.chefId]);
            }).join('');
            cards = Array.prototype.slice.call(track.children);

            renderScore(chefs, reviews);
            buildDots();
            syncControls();
            wire();
        });
    });
})();
