/* =========================================================
   RANNABARI — BECOME A COOK
   This page is the cook's front door: the pitch, then the first
   few fields. Steps 2 and 3 (account details and the map pin)
   live in the shared signup flow on auth.html, so CONTINUE hands
   what was typed here straight over instead of duplicating them.
   ========================================================= */

(function () {
    'use strict';

    var form = document.getElementById('cookStartForm');
    if (!form) return;

    var note = document.getElementById('startNote');

    /* Centres the map on step 3 so the cook starts near their own
       neighbourhood rather than the middle of Dhaka. */
    var ZONES = {
        Dhanmondi: { lat: 23.7461, lng: 90.3742 },
        Mirpur:    { lat: 23.8223, lng: 90.3654 },
        Gulshan:   { lat: 23.7925, lng: 90.4078 },
        Uttara:    { lat: 23.8759, lng: 90.3795 }
    };

    function complain(message, field) {
        note.querySelector('span').textContent = message;
        note.hidden = false;
        if (field) {
            field.style.borderColor = 'var(--color-primary)';
            field.addEventListener('input', function clear() {
                field.style.borderColor = '';
                field.removeEventListener('input', clear);
            });
            field.focus();
        }
        note.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        note.hidden = true;

        var name  = document.getElementById('bcName');
        var phone = document.getElementById('bcPhone');
        var zone  = document.getElementById('bcZone');
        var nid   = document.getElementById('bcNid');

        if (!name.value.trim())  return complain('Enter your full legal name.', name);
        if (!phone.value.trim()) return complain('We need a phone number to confirm orders.', phone);
        if (!zone.value)         return complain('Pick the zone you cook in.', zone);
        if (!nid.value.trim())   return complain('Enter your NID so we can verify your kitchen.', nid);

        // sessionStorage throws outright in some contexts (private mode,
        // blocked site data). A failed handoff should still navigate.
        try {
            sessionStorage.setItem('rannabari_cook_start', JSON.stringify({
                name: name.value.trim(),
                phone: phone.value.trim(),
                nid: nid.value.trim(),
                zone: zone.value,
                center: ZONES[zone.value] || null
            }));
        } catch (err) { /* the visitor just retypes two fields */ }

        window.location.href = 'auth.html?mode=signup&role=cook&step=2';
    });
})();
