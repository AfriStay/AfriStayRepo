// contact.js
(function () {
    const form = document.getElementById('contactForm');
    if (!form) return;

    const nameEl = document.getElementById('contactName');
    const emailEl = document.getElementById('contactEmail');
    const msgEl = document.getElementById('contactMessage');

    form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const name = (nameEl.value || '').trim();
        const email = (emailEl.value || '').trim();
        const message = (msgEl.value || '').trim();

        if (!name || !email || !message) {
        alert('Please fill name, email and message.');
        return;
        }

        // disable
        const submitBtn = form.querySelector('input[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
        const client = window.supabaseClient;
        if (!client) throw new Error('Supabase client not found. Check config.js');
        if (message.trim().length < 10) {
            alert("Message must be at least 10 characters.");
            return;
        }
        // 1) insert into DB
        const { error: insertErr } = await client
            .from('contact_messages')
            .insert([{ name, email, message }]);

        if (insertErr) {
            console.error('DB insert error', insertErr);
            alert('Failed to send message (DB). Try again later.');
            return;
        }

        // 2) call edge function to notify admin by email (optional)
        // NOTE: CONFIG.FUNCTIONS_BASE is derived in config.js
        const functionsBase = (typeof CONFIG !== 'undefined' && CONFIG.FUNCTIONS_BASE) || '';
        const notifyUrl = functionsBase ? `${functionsBase}/notify-admin-contact` : null;

        if (notifyUrl) {
            // Fire-and-forget best-effort: still success for user even if notify fails.
            fetch(notifyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, message })
            }).catch(err => console.warn('Notify admin failed', err));
        }

        // Success UX
        alert('Message sent — admin will see it. Thanks!');
        form.reset();
        } catch (err) {
        console.error('Contact send error', err);
        alert('Something went wrong. Try again later.');
        } finally {
        if (submitBtn) submitBtn.disabled = false;
        }
    });
})();
