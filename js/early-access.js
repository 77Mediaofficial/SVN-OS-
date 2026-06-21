/* SVN OS — early-access waitlist capture.
   Inserts the lead into the `waitlist` table via PostgREST using the public
   anon key. The key is public by design: the waitlist table is INSERT-only for
   anon (RLS), with no SELECT grant, so captured leads can't be read back or
   scraped. On any network/REST failure we fall back to a pre-filled email so a
   lead is never lost. connect-src in vercel.json already allows *.supabase.co. */
(() => {
  const SB_URL  = 'https://vtvniushkftodhlvdkom.supabase.co';
  const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0dm5pdXNoa2Z0b2RobHZka29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMTY4NzAsImV4cCI6MjA5MTY5Mjg3MH0.a8R36vH_KRnruIcj39ivrkTuVNtH7YX8OXabbSn3jgg';
  const CONTACT = 'svn-77mediaofficial@outlook.com';

  const form = document.getElementById('form');
  const fc = document.getElementById('fc');
  if (!form || !fc) return;

  const val = (id) => (document.getElementById(id)?.value || '').trim();
  const okEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
  const done = () => fc.classList.add('is-sent');

  function mailtoFallback(d) {
    const s = encodeURIComponent('SVN OS — early access request');
    const b = encodeURIComponent(
      `Email: ${d.email}\nName: ${d.name || '—'}\nStudio: ${d.studio || '—'}\nWhat they make: ${d.note || '—'}`);
    window.location.href = `mailto:${CONTACT}?subject=${s}&body=${b}`;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (val('company_url')) return;                 // honeypot tripped → ignore
    const emailEl = document.getElementById('email');
    const email = val('email');
    if (!okEmail(email)) { emailEl.classList.add('err'); emailEl.focus(); return; }
    emailEl.classList.remove('err');

    const data = {
      email,
      name: val('name') || null,
      studio: val('studio') || null,
      note: val('note') || null,
      source: 'early-access-landing',
    };

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Sending…';

    try {
      const r = await fetch(`${SB_URL}/rest/v1/waitlist`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SB_ANON,
          Authorization: `Bearer ${SB_ANON}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error(`rest ${r.status}`);
      done();
    } catch (err) {
      // Network/REST failed — never drop the lead.
      mailtoFallback(data);
      done();
    }
  });
})();
