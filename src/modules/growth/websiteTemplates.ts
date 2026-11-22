export type WebsiteTemplate = {
  id: string
  name: string
  description: string
  accent: string
  build: (data: { businessName: string; phone: string; email: string }) => string
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))

const base = (title: string, accent: string, body: string) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <style>
    :root{--accent:${accent};--ink:#1f2937;--muted:#6b7280;--bg:#f8fafc;--card:#ffffff}
    *{box-sizing:border-box} body{margin:0;font-family:Arial,sans-serif;color:var(--ink);background:var(--bg);line-height:1.5}
    .wrap{max-width:1040px;margin:0 auto;padding:24px} .btn{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600}
    .btn.alt{background:#fff;color:var(--accent);border:1px solid #cbd5e1} .card{background:var(--card);border:1px solid #e5e7eb;border-radius:16px;padding:20px}
    .muted{color:var(--muted)} .grid{display:grid;gap:16px} @media(min-width:768px){.grid3{grid-template-columns:repeat(3,1fr)} .grid2{grid-template-columns:repeat(2,1fr)}}
    footer{padding:32px 24px;text-align:center;color:var(--muted);font-size:14px}
  </style>
</head>
<body>${body}<footer>© ${new Date().getFullYear()} ${esc(title)}. All rights reserved.</footer></body></html>`

export const websiteTemplates: WebsiteTemplate[] = [
  {
    id: 'clinic-landing',
    name: 'Clinic Landing Page',
    description: 'Hero, services, trust points, and appointment CTA. Good for dental/clinic websites.',
    accent: '#0f766e',
    build: ({ businessName, phone, email }) => {
      const b = esc(businessName), p = esc(phone || '+91 00000 00000'), e = esc(email || 'hello@example.com')
      return base(businessName, '#0f766e', `
  <header style="background:linear-gradient(135deg,#0f766e,#115e59);color:#fff">
    <div class="wrap" style="padding:56px 24px">
      <p style="opacity:.9;font-weight:600;letter-spacing:.04em">TRUSTED CARE</p>
      <h1 style="font-size:42px;line-height:1.1;margin:8px 0 16px;max-width:700px">${b}</h1>
      <p style="max-width:640px;font-size:18px;opacity:.95">Modern, gentle care for your family. Book an appointment and get the attention you deserve.</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:24px">
        <a class="btn" style="background:#fff;color:#0f766e" href="tel:${p}">Call ${p}</a>
        <a class="btn alt" style="border-color:rgba(255,255,255,.4);color:#fff;background:transparent" href="mailto:${e}">Email us</a>
      </div>
    </div>
  </header>
  <main class="wrap" style="padding:40px 24px">
    <div class="grid grid3">
      <div class="card"><h3 style="margin:0 0 8px">Experienced team</h3><p class="muted" style="margin:0">Professional care with clear communication and comfort-first approach.</p></div>
      <div class="card"><h3 style="margin:0 0 8px">Modern treatments</h3><p class="muted" style="margin:0">From routine checkups to specialized services, all in one place.</p></div>
      <div class="card"><h3 style="margin:0 0 8px">Easy booking</h3><p class="muted" style="margin:0">Call or email us to schedule a convenient appointment time.</p></div>
    </div>
    <div class="card" style="margin-top:24px;display:flex;justify-content:space-between;gap:16px;align-items:center;flex-wrap:wrap">
      <div><h2 style="margin:0 0 6px">Ready to book your visit?</h2><p class="muted" style="margin:0">Reach out and our team will help you find the right slot.</p></div>
      <a class="btn" href="mailto:${e}?subject=Appointment%20Request">Book appointment</a>
    </div>
  </main>`)
    },
  },
  {
    id: 'services-pricing',
    name: 'Services & Pricing',
    description: 'Service list with pricing cards and contact CTA. Easy to edit for any business.',
    accent: '#4f46e5',
    build: ({ businessName, phone, email }) => {
      const b = esc(businessName), p = esc(phone || '+91 00000 00000'), e = esc(email || 'hello@example.com')
      return base(businessName, '#4f46e5', `
  <header class="wrap" style="padding:48px 24px 24px"><p style="color:var(--accent);font-weight:700;margin:0">SERVICES</p><h1 style="font-size:40px;margin:8px 0 12px">${b}</h1><p class="muted" style="max-width:680px;margin:0">Clear services, transparent pricing, and easy ways to get in touch.</p></header>
  <main class="wrap" style="padding-top:8px">
    <div class="grid grid3">
      <div class="card"><h3 style="margin:0">Consultation</h3><p style="font-size:28px;font-weight:700;color:var(--accent);margin:12px 0">₹500</p><p class="muted" style="margin:0">Initial assessment, advice, and treatment plan.</p></div>
      <div class="card" style="border-color:#c7d2fe;box-shadow:0 8px 24px rgba(79,70,229,.08)"><h3 style="margin:0">Cleaning / Care</h3><p style="font-size:28px;font-weight:700;color:var(--accent);margin:12px 0">₹1,200</p><p class="muted" style="margin:0">Routine care with professional equipment and guidance.</p></div>
      <div class="card"><h3 style="margin:0">Follow-up</h3><p style="font-size:28px;font-weight:700;color:var(--accent);margin:12px 0">₹300</p><p class="muted" style="margin:0">Review progress and adjust your care plan as needed.</p></div>
    </div>
    <div class="card" style="margin-top:24px"><h2 style="margin:0 0 8px">Need help choosing?</h2><p class="muted" style="margin:0 0 16px">Contact us and we'll recommend the right service.</p><a class="btn" href="tel:${p}">Call ${p}</a> <a class="btn alt" href="mailto:${e}" style="margin-left:8px">Email ${e}</a></div>
  </main>`)
    },
  },
  {
    id: 'contact-lead',
    name: 'Contact & Lead Page',
    description: 'Simple contact page with business details and a mailto lead form. No backend required.',
    accent: '#ea580c',
    build: ({ businessName, phone, email }) => {
      const b = esc(businessName), p = esc(phone || '+91 00000 00000'), e = esc(email || 'hello@example.com')
      return base(businessName, '#ea580c', `
  <main class="wrap" style="padding:48px 24px">
    <div class="grid grid2">
      <div>
        <p style="color:var(--accent);font-weight:700;margin:0">CONTACT</p>
        <h1 style="font-size:40px;margin:8px 0 12px">Get in touch with ${b}</h1>
        <p class="muted">Have a question or want to book? Send us a message and we'll respond soon.</p>
        <div class="card" style="margin-top:20px"><p style="margin:0 0 8px"><strong>Phone:</strong> <a href="tel:${p}" style="color:var(--accent)">${p}</a></p><p style="margin:0"><strong>Email:</strong> <a href="mailto:${e}" style="color:var(--accent)">${e}</a></p></div>
      </div>
      <div class="card">
        <h2 style="margin-top:0">Send a message</h2>
        <form action="mailto:${e}" method="post" enctype="text/plain" class="grid" style="gap:12px">
          <label>Full name<br/><input name="name" required style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;margin-top:4px"/></label>
          <label>Phone<br/><input name="phone" style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;margin-top:4px"/></label>
          <label>Message<br/><textarea name="message" rows="4" required style="width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;margin-top:4px"></textarea></label>
          <button class="btn" type="submit" style="border:none;cursor:pointer">Send message</button>
          <p class="muted" style="font-size:12px;margin:0">This static form uses mailto. For real form capture, connect a form provider or backend.</p>
        </form>
      </div>
    </div>
  </main>`)
    },
  },
]
