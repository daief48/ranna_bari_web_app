/* =========================================================
   RANNABARI — AUTH UI
   Tab switching, the three-step signup flow, and the MapTiler
   location picker both roles share.

   This is presentation only. Nothing is posted anywhere; the
   final step just renders a summary of what was collected.
   ========================================================= */

(function () {
    'use strict';

    /* ---------------------------------------------------------
       MapTiler. Same browser key the kitchen map uses -- it ships
       in the page by design and is protected by an origin
       allowlist in the MapTiler dashboard, not by secrecy.
       --------------------------------------------------------- */
    var MAPTILER_KEY = 'SxjK1zJHWJ8lvm7cplMH';
    var TILE_STYLE   = { light: 'streets-v2', dark: 'streets-v2-dark' };
    var DHAKA        = { lat: 23.8103, lng: 90.4125 };

    function tileUrl(style) {
        return 'https://api.maptiler.com/maps/' + style + '/{z}/{x}/{y}.png?key=' + MAPTILER_KEY;
    }
    function currentTileStyle() {
        return document.documentElement.getAttribute('data-theme') === 'dark'
            ? TILE_STYLE.dark : TILE_STYLE.light;
    }

    var $  = function (sel, root) { return (root || document).querySelector(sel); };
    var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

    /* Shared flow state. Everything the three steps collect lands here. */
    var state = {
        role: null,                 // 'user' | 'cook'
        step: 1,
        label: 'Home',
        radiusKm: 3,
        lat: null,
        lng: null,
        address: ''
    };

    /* =========================================================
       1 · SIGN IN  /  CREATE ACCOUNT TABS
       ========================================================= */
    var tabSignin = $('#tabSignin');
    var tabSignup = $('#tabSignup');
    var viewSignin = $('#viewSignin');
    var viewSignup = $('#viewSignup');

    function showView(which) {
        var signup = which === 'signup';
        tabSignin.setAttribute('aria-selected', String(!signup));
        tabSignup.setAttribute('aria-selected', String(signup));
        viewSignin.hidden = signup;
        viewSignup.hidden = !signup;
        paintAside();
    }

    tabSignin.addEventListener('click', function () { showView('signin'); });
    tabSignup.addEventListener('click', function () { showView('signup'); });
    $$('[data-goto]').forEach(function (btn) {
        btn.addEventListener('click', function () { showView(btn.dataset.goto); });
    });

    /* =========================================================
       2 · ROLE CHOICE
       ========================================================= */
    var roleCards = $$('.role-card');
    var roleNote  = $('#roleNote');
    var continueBtn = $('[data-next="2"]');

    /* The aside imagery and copy follow the chosen path, so the
       page keeps talking about the thing the visitor picked. */
    var ASIDE = {
        none: {
            eyebrow: 'Home kitchens, near you',
            title: "Every plate here was cooked by <em>somebody's</em> hands.",
            text: 'Not a warehouse. Not a chain. Real kitchens in your neighbourhood, cooking the food they grew up on — and now cooking it for you.',
            img: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=1400&q=80'
        },
        user: {
            eyebrow: 'Dinner is three streets away',
            title: 'Tonight, eat something <em>made</em>, not manufactured.',
            text: 'Tell us where you are and we will show you the kitchens close enough to deliver it hot.',
            img: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=1400&q=80'
        },
        cook: {
            eyebrow: 'Your kitchen, your business',
            title: 'The recipe is already <em>yours</em>. We bring the customers.',
            text: 'No storefront, no upfront cost. Set your hours, cook what you love, keep 85% of every order.',
            img: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=1400&q=80'
        }
    };

    var asideImg     = $('#asideImg');
    var asideEyebrow = $('#asideEyebrow');
    var asideTitle   = $('#asideTitle');
    var asideText    = $('#asideText');

    function paintAside() {
        var key = (!viewSignup.hidden && state.role) ? state.role : 'none';
        var copy = ASIDE[key];
        asideEyebrow.textContent = copy.eyebrow;
        asideTitle.innerHTML = copy.title;
        asideText.textContent = copy.text;

        if (asideImg.dataset.src === copy.img) return;
        asideImg.dataset.src = copy.img;
        // Preload, then cross-fade -- swapping src directly flashes white.
        var next = new Image();
        next.onload = function () {
            asideImg.classList.remove('is-ready');
            setTimeout(function () {
                asideImg.src = copy.img;
                asideImg.classList.add('is-ready');
            }, 180);
        };
        next.src = copy.img;
    }

    asideImg.dataset.src = ASIDE.none.img;
    if (asideImg.complete) asideImg.classList.add('is-ready');
    else asideImg.addEventListener('load', function () { asideImg.classList.add('is-ready'); });

    roleCards.forEach(function (card) {
        card.addEventListener('click', function () {
            state.role = card.dataset.role;
            roleCards.forEach(function (c) {
                var on = c === card;
                c.classList.toggle('is-selected', on);
                c.setAttribute('aria-checked', String(on));
            });
            continueBtn.disabled = false;
            roleNote.hidden = true;
            applyRole();
            paintAside();
        });
    });

    /* Show only the blocks that belong to the chosen role and
       rewrite the step copy to match. */
    function applyRole() {
        $$('[data-role-only]').forEach(function (el) {
            el.hidden = el.dataset.roleOnly !== state.role;
        });

        var cook = state.role === 'cook';
        $('#signupTitle').textContent = cook ? 'Open your kitchen.' : 'Join RannaBari.';
        $('#signupSub').textContent = cook
            ? 'Three short steps and your kitchen is on the map.'
            : 'Three short steps. The last one puts you on the map — literally.';

        $('#step2Title').textContent = cook ? 'About you and your kitchen' : 'Your details';
        $('#step2Sub').textContent = cook
            ? 'Verified kitchens get a badge, and badged kitchens get roughly twice the orders.'
            : 'We only ask for what an order actually needs.';

        $('#step3Title').textContent = cook ? 'Where do you cook?' : 'Where should we find you?';
        $('#step3Sub').textContent = cook
            ? 'Drop the pin on your kitchen, then set how far you are willing to deliver.'
            : 'Drag the map so the pin sits on your door. This decides which kitchens you see.';

        $('#suKitchen').required   = cook;
        $('#suSpecialty').required = cook;
        $('#suNid').required       = cook;

        if (map) drawRadius();
    }

    /* =========================================================
       3 · STEP NAVIGATION
       ========================================================= */
    var steps = $$('.auth-step');

    function goStep(n) {
        state.step = n;
        steps.forEach(function (s) { s.hidden = Number(s.dataset.step) !== n; });

        $$('.step-node').forEach(function (node) {
            var i = Number(node.dataset.node);
            node.classList.toggle('is-active', i === n);
            node.classList.toggle('is-done', i < n);
            var dot = $('.step-dot', node);
            dot.innerHTML = i < n
                ? '<svg class="ico" aria-hidden="true"><use href="#i-check"/></svg>'
                : String(i);
        });
        $$('.step-line').forEach(function (line) {
            line.classList.toggle('is-filled', Number(line.dataset.line) < n);
        });

        // The rail and the page heading only belong to the three input
        // steps -- the done state carries its own headline.
        var finished = n > 3;
        $('#stepRail').hidden = finished;
        $('.auth-head', viewSignup).hidden = finished;
        $('.auth-legal', viewSignup).hidden = finished;

        if (n === 3) initMap();

        // Scroll the card back into view -- otherwise a long step 2 leaves
        // the visitor staring at the middle of step 3.
        var top = $('.auth-panel-inner').getBoundingClientRect().top + window.scrollY - 24;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }

    $$('[data-next]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var target = Number(btn.dataset.next);
            if (validate(target - 1)) goStep(target);
        });
    });
    $$('[data-back]').forEach(function (btn) {
        btn.addEventListener('click', function () { goStep(Number(btn.dataset.back)); });
    });

    /* ---------- Light client-side checks ---------- */
    function note(el, message) {
        var span = $('span', el);
        if (span) span.textContent = message;
        el.hidden = false;
    }

    function flag(input) {
        input.style.borderColor = 'var(--color-primary)';
        input.addEventListener('input', function clear() {
            input.style.borderColor = '';
            input.removeEventListener('input', clear);
        });
    }

    function validate(step) {
        if (step === 1) {
            if (!state.role) { roleNote.hidden = false; return false; }
            return true;
        }

        if (step === 2) {
            var noteEl = $('#detailsNote');
            noteEl.hidden = true;

            var required = ['#suName', '#suPhone', '#suEmail', '#suPw'];
            if (state.role === 'cook') required.push('#suKitchen', '#suSpecialty', '#suNid');

            // Not required.map($) -- map hands the callback an index, which
            // $ would take as its root element and choke on.
            var missing = required
                .map(function (sel) { return $(sel); })
                .filter(function (el) { return !el.value.trim(); });
            if (missing.length) {
                missing.forEach(flag);
                note(noteEl, 'Fill in the highlighted fields to continue.');
                missing[0].focus();
                return false;
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($('#suEmail').value.trim())) {
                flag($('#suEmail'));
                note(noteEl, 'That email address does not look right.');
                return false;
            }
            if ($('#suPw').value.length < 8) {
                flag($('#suPw'));
                note(noteEl, 'Use at least 8 characters for your password.');
                return false;
            }
            if (!$('#suTerms').checked) {
                note(noteEl, 'Please accept the Terms and Privacy Policy.');
                return false;
            }
            return true;
        }

        return true;
    }

    /* =========================================================
       4 · PASSWORD FIELDS
       ========================================================= */
    $$('.pw-toggle[data-pw-for]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var input = document.getElementById(btn.dataset.pwFor);
            var shown = input.type === 'text';
            input.type = shown ? 'password' : 'text';
            btn.setAttribute('aria-label', shown ? 'Show password' : 'Hide password');
            $('use', btn).setAttribute('href', shown ? '#i-eye' : '#i-eyeOff');
        });
    });

    var pwMeter = $('#pwStrength');
    var PW_WORDS = ['Strength', 'Weak', 'Fair', 'Good', 'Strong'];

    $('#suPw').addEventListener('input', function () {
        var v = this.value;
        var score = 0;
        if (v.length >= 8) score++;
        if (v.length >= 12) score++;
        if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
        if (/\d/.test(v) && /[^\w\s]/.test(v)) score++;
        if (!v) score = 0;
        pwMeter.dataset.level = String(score);
        $('span', pwMeter).textContent = PW_WORDS[score];
    });

    /* =========================================================
       5 · CHIPS + RADIUS
       ========================================================= */
    $$('#labelChips .chip').forEach(function (chip) {
        chip.addEventListener('click', function () {
            $$('#labelChips .chip').forEach(function (c) { c.classList.remove('is-on'); });
            chip.classList.add('is-on');
            state.label = chip.dataset.chip;
        });
    });

    var radiusInput = $('#locRadius');
    radiusInput.addEventListener('input', function () {
        state.radiusKm = parseFloat(this.value);
        $('#radiusOut').textContent = state.radiusKm.toFixed(1) + ' km';
        drawRadius();
    });

    /* =========================================================
       6 · LOCATION PICKER
       The pin is fixed to the centre of the frame and the map moves
       under it, so "where am I dropping this" is always the middle.
       ========================================================= */
    var map = null, tiles = null, radiusCircle = null, meMarker = null;
    var reverseTimer = null, searchTimer = null;
    var startCenter = DHAKA;   // becomecook.html can hand over a zone centre

    var locMap     = $('#locMap');
    var locAddress = $('#locAddress');
    var locCoords  = $('#locCoords');
    var locBadge   = $('#locBadge');
    var locResults = $('#locResults');
    var locQuery   = $('#locQuery');
    var locateBtn  = $('#locLocate');
    var locateLbl  = $('#locLocateLabel');

    function initMap() {
        if (map) {
            // Leaflet sizes itself on creation, and the container was
            // display:none until now -- so it needs a nudge.
            setTimeout(function () { map.invalidateSize(); }, 60);
            return;
        }

        // The map is a CDN dependency; the rest of the step still works
        // without it, so degrade instead of throwing out of goStep().
        if (typeof L === 'undefined') {
            locMap.style.display = 'none';
            note($('#locNote'), 'The map could not load. Type your area in the search box above and we will follow up to confirm the exact spot.');
            // Fall back to the city centre so the flow can still finish.
            state.lat = DHAKA.lat;
            state.lng = DHAKA.lng;
            locAddress.textContent = 'Dhaka (approximate)';
            locCoords.textContent = DHAKA.lat.toFixed(5) + ', ' + DHAKA.lng.toFixed(5);
            return;
        }

        map = L.map($('#locCanvas'), {
            zoomControl: true,
            attributionControl: true,
            // The map sits mid-page. A wheel over it should scroll past it,
            // not zoom it -- until you click in and say otherwise.
            scrollWheelZoom: false
        }).setView([startCenter.lat, startCenter.lng], startCenter === DHAKA ? 13 : 15);

        map.on('click', function () { map.scrollWheelZoom.enable(); });
        locMap.addEventListener('mouseleave', function () { map.scrollWheelZoom.disable(); });

        // MapTiler serves 512px tiles, so Leaflet needs the zoom offset
        // or every label renders at half scale.
        tiles = L.tileLayer(tileUrl(currentTileStyle()), {
            tileSize: 512,
            zoomOffset: -1,
            minZoom: 3,
            maxZoom: 20,
            crossOrigin: true,
            attribution: '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener">&copy; MapTiler</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">&copy; OpenStreetMap</a>'
        }).addTo(map);

        new MutationObserver(function () {
            tiles.setUrl(tileUrl(currentTileStyle()));
        }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

        map.on('movestart', function () { locMap.classList.add('is-moving'); });
        map.on('move', drawRadius);
        map.on('moveend', function () {
            locMap.classList.remove('is-moving');
            commitCentre();
        });

        setTimeout(function () { map.invalidateSize(); commitCentre(); }, 60);
    }

    function commitCentre() {
        var c = map.getCenter();
        state.lat = c.lat;
        state.lng = c.lng;
        locCoords.textContent = c.lat.toFixed(5) + ', ' + c.lng.toFixed(5);
        $('#locNote').hidden = true;   // moving the pin clears any earlier complaint
        drawRadius();

        setBadge('pending', 'Locating', '#i-clock');
        clearTimeout(reverseTimer);
        reverseTimer = setTimeout(function () { reverseGeocode(c.lat, c.lng); }, 420);
    }

    function setBadge(kind, text, iconHref) {
        locBadge.classList.toggle('is-pending', kind === 'pending');
        locBadge.innerHTML = '<svg class="ico" aria-hidden="true"><use href="' + iconHref + '"/></svg>' + text;
    }

    /* The delivery circle only exists for cooks. */
    function drawRadius() {
        if (!map) return;
        if (state.role !== 'cook') {
            if (radiusCircle) { map.removeLayer(radiusCircle); radiusCircle = null; }
            return;
        }
        var c = map.getCenter();
        if (!radiusCircle) {
            radiusCircle = L.circle(c, {
                radius: state.radiusKm * 1000,
                color: '#C0442A',
                weight: 2,
                fillColor: '#C0442A',
                fillOpacity: 0.12
            }).addTo(map);
        } else {
            radiusCircle.setLatLng(c).setRadius(state.radiusKm * 1000);
        }
    }

    /* ---------- Geocoding ---------- */
    function geocodeUrl(path) {
        return 'https://api.maptiler.com/geocoding/' + path + '.json?key=' + MAPTILER_KEY;
    }

    function reverseGeocode(lat, lng) {
        fetch(geocodeUrl(lng + ',' + lat))
            .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
            .then(function (data) {
                var hit = data.features && data.features[0];
                state.address = hit ? (hit.place_name || hit.text) : '';
                locAddress.textContent = state.address || 'Pinned location';
                setBadge('ok', 'Pinned', '#i-shieldCheck');
            })
            .catch(function () {
                // The pin is still perfectly valid without a street name.
                state.address = '';
                locAddress.textContent = 'Pinned location';
                setBadge('ok', 'Pinned', '#i-shieldCheck');
            });
    }

    function renderResults(features) {
        if (!features.length) {
            locResults.innerHTML = '<p class="loc-msg">Nothing found. Try a nearby landmark.</p>';
            locResults.hidden = false;
            return;
        }
        locResults.innerHTML = features.slice(0, 6).map(function (f, i) {
            var name = f.text || f.place_name;
            var sub  = (f.place_name || '').replace(name + ', ', '');
            return '<button type="button" data-i="' + i + '">' +
                   '<svg class="ico" aria-hidden="true"><use href="#i-pin"/></svg>' +
                   '<span><b>' + name + '</b><small>' + sub + '</small></span></button>';
        }).join('');
        locResults.hidden = false;

        $$('button', locResults).forEach(function (btn) {
            btn.addEventListener('click', function () {
                var f = features[Number(btn.dataset.i)];
                locQuery.value = f.place_name || f.text;
                locResults.hidden = true;
                if (map) map.flyTo([f.center[1], f.center[0]], 16, { duration: 0.9 });
            });
        });
    }

    function search() {
        var q = locQuery.value.trim();
        if (q.length < 2) { locResults.hidden = true; return; }
        locResults.innerHTML = '<p class="loc-msg">Searching…</p>';
        locResults.hidden = false;

        fetch(geocodeUrl(encodeURIComponent(q)) + '&country=bd&proximity=' + DHAKA.lng + ',' + DHAKA.lat)
            .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
            .then(function (data) { renderResults(data.features || []); })
            .catch(function () {
                locResults.innerHTML = '<p class="loc-msg">Search is unavailable right now — drag the map instead.</p>';
            });
    }

    locQuery.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(search, 350);
    });
    locQuery.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); clearTimeout(searchTimer); search(); }
        if (e.key === 'Escape') locResults.hidden = true;
    });
    $('#locSearchBtn').addEventListener('click', function () { clearTimeout(searchTimer); search(); });
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.loc-search')) locResults.hidden = true;
    });

    /* ---------- Device location ---------- */
    locateBtn.addEventListener('click', function () {
        if (!map) return;
        if (!navigator.geolocation) {
            note($('#locNote'), 'This browser will not share a location. Drag the map to your spot instead.');
            return;
        }
        locateBtn.dataset.state = 'locating';
        locateLbl.textContent = 'Finding you…';
        $('#locNote').hidden = true;

        navigator.geolocation.getCurrentPosition(function (pos) {
            var lat = pos.coords.latitude, lng = pos.coords.longitude;
            locateBtn.dataset.state = 'active';
            locateLbl.textContent = 'My location';

            if (meMarker) map.removeLayer(meMarker);
            meMarker = L.circleMarker([lat, lng], {
                radius: 7, color: '#fff', weight: 3,
                fillColor: 'var(--clr-geo)', fillOpacity: 1
            }).addTo(map);

            map.flyTo([lat, lng], 16, { duration: 1 });
        }, function (err) {
            locateBtn.dataset.state = 'idle';
            locateLbl.textContent = 'Use my location';
            note($('#locNote'), err.code === 1
                ? 'Location permission was denied. Drag the map to your spot instead.'
                : 'Could not read your location. Drag the map to your spot instead.');
        }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
    });

    /* =========================================================
       7 · SUBMIT — renders the summary, posts nothing
       ========================================================= */
    $('#signupForm').addEventListener('submit', function (e) {
        e.preventDefault();

        if (state.lat === null) {
            note($('#locNote'), 'Drop your pin on the map before finishing.');
            return;
        }

        var cook = state.role === 'cook';
        var rows = [
            ['Account', cook ? 'Home cook' : 'Customer'],
            ['Name', $('#suName').value.trim()],
            ['Phone', $('#suPhone').value.trim()]
        ];
        if (cook) {
            rows.push(['Kitchen', $('#suKitchen').value.trim()]);
            rows.push(['Delivers within', state.radiusKm.toFixed(1) + ' km']);
        } else {
            rows.push(['Address label', state.label]);
        }
        rows.push(['Pinned at', state.address || (state.lat.toFixed(4) + ', ' + state.lng.toFixed(4))]);

        $('#doneSummary').innerHTML = rows.map(function (r) {
            return '<div><span>' + r[0] + '</span><strong>' + r[1] + '</strong></div>';
        }).join('');

        $('#doneTitle').textContent = cook ? 'Your kitchen is on the map.' : "You're in.";
        $('#doneText').textContent = cook
            ? 'We are verifying your NID now — usually under 24 hours. You will get a text the moment your kitchen goes live.'
            : 'We found kitchens near your pin. Go see what is cooking tonight.';

        // Home, always. Sending a cook back to becomecook.html looped them
        // into the onboarding form they just finished.
        var cta = $('#doneCta');
        cta.href = 'index.html';
        cta.childNodes[0].nodeValue = 'GO TO HOME ';

        goStep(4);
    });

    /* Sign-in form is a mock too -- show the shape of a failure. */
    $('#signinForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var noteEl = $('#signinNote');
        if (!$('#siId').value.trim() || !$('#siPw').value) {
            note(noteEl, 'Enter your email or phone and your password.');
            return;
        }
        noteEl.hidden = true;
        window.location.href = 'index.html';
    });

    /* =========================================================
       8 · DEEP LINKS
       auth.html?mode=signup&role=cook drops the visitor straight
       into the cook path -- that is what the "Become a cook"
       buttons around the site point at. Runs last, because it
       replays a click through the handlers wired above.
       ========================================================= */
    (function applyQuery() {
        var q = new URLSearchParams(window.location.search);
        var role = q.get('role');
        if (q.get('mode') === 'signup' || role) showView('signup');
        if (role === 'cook' || role === 'user') {
            var card = $('.role-card[data-role="' + role + '"]');
            if (card) card.click();
        }

        // becomecook.html collects name / phone / NID / zone before sending
        // the cook here, so carry those over rather than asking twice.
        var handoff = null;
        try {
            handoff = JSON.parse(sessionStorage.getItem('rannabari_cook_start'));
            sessionStorage.removeItem('rannabari_cook_start');
        } catch (err) { handoff = null; }

        if (handoff) {
            if (handoff.name)  $('#suName').value  = handoff.name;
            if (handoff.phone) $('#suPhone').value = handoff.phone;
            if (handoff.nid)   $('#suNid').value   = handoff.nid;
            if (handoff.center && typeof handoff.center.lat === 'number') {
                startCenter = handoff.center;
            }
            if (handoff.zone) locQuery.value = handoff.zone + ', Dhaka';
        }

        // Skip straight to the step the referrer asked for, but only once a
        // role is actually set -- step 2 renders differently for each.
        var step = Number(q.get('step'));
        if (state.role && step >= 2 && step <= 3) goStep(step);
    })();

    paintAside();
})();
