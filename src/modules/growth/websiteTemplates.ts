export type WebsiteTemplateData = {
  businessName: string
  phone: string
  email: string
  headline: string
  subheadline: string
  ctaText: string
  services: Array<{ name: string; price: string; description: string }>
}

export type WebsiteTemplate = {
  id: string
  name: string
  description: string
  accent: string
  build: (data: WebsiteTemplateData) => string
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))

const defaults: WebsiteTemplateData = {
  businessName: 'Your Business',
  phone: '+91 00000 00000',
  email: 'hello@example.com',
  headline: 'Care you can trust',
  subheadline: 'Modern, gentle care for your family. Book an appointment and get the attention you deserve.',
  ctaText: 'Book appointment',
  services: [
    { name: 'Consultation', price: '₹500', description: 'Initial assessment, advice, and treatment plan.' },
    { name: 'Cleaning / Care', price: '₹1,200', description: 'Routine care with professional equipment and guidance.' },
    { name: 'Follow-up', price: '₹300', description: 'Review progress and adjust your care plan as needed.' },
  ],
}

export function withTemplateDefaults(data: Partial<WebsiteTemplateData>): WebsiteTemplateData {
  const d = { ...defaults, ...data }
  const services = (data.services?.length ? data.services : defaults.services).slice(0, 3).map((s, i) => ({
    name: s.name || defaults.services[i]?.name || `Service ${i + 1}`,
    price: s.price || defaults.services[i]?.price || '₹0',
    description: s.description || defaults.services[i]?.description || 'Service description.',
  }))
  while (services.length < 3) services.push(defaults.services[services.length]!)
  return { ...d, businessName: d.businessName || defaults.businessName, phone: d.phone || defaults.phone, email: d.email || defaults.email, headline: d.headline || defaults.headline, subheadline: d.subheadline || defaults.subheadline, ctaText: d.ctaText || defaults.ctaText, services }
}

const base = (title: string, accent: string, body: string) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <style>
    :root{--accent:${accent};--ink:#1f2937;--muted:#6b7280;--bg:#f8fafc;--card:#ffffff}
    *{box-sizing:border-box} body{margin:0;font-family:Arial,sans-serif;color:var(--ink);background:var(--bg);line-height:1.5}
    .wrap{max-width:1040px;margin:0 auto;padding:24px} .btn{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;border:none;cursor:pointer}
    .btn.alt{background:#fff;color:var(--accent);border:1px solid #cbd5e1} .card{background:var(--card);border:1px solid #e5e7eb;border-radius:16px;padding:20px}
    .muted{color:var(--muted)} .grid{display:grid;gap:16px} @media(min-width:768px){.grid3{grid-template-columns:repeat(3,1fr)} .grid2{grid-template-columns:repeat(2,1fr)}}
    footer{padding:32px 24px;text-align:center;color:var(--muted);font-size:14px}
    input,textarea{width:100%;padding:10px;border:1px solid #d1d5db;border-radius:8px;margin-top:4px;font:inherit}
  </style>
</head>
<body>${body}<footer>© ${new Date().getFullYear()} ${esc(title)}. All rights reserved.</footer></body></html>`

function serviceCards(services: WebsiteTemplateData['services'], accent = 'var(--accent)') {
  return services.map((s) => `<div class="card"><h3 style="margin:0">${esc(s.name)}</h3><p style="font-size:28px;font-weight:700;color:${accent};margin:12px 0">${esc(s.price)}</p><p class="muted" style="margin:0">${esc(s.description)}</p></div>`).join('')
}

export const websiteTemplates: WebsiteTemplate[] = [
  {
    id: 'clinic-landing',
    name: 'Clinic Landing Page',
    description: 'Hero, services, trust points, and appointment CTA. Good for dental/clinic websites.',
    accent: '#0f766e',
    build: (raw) => {
      const d = withTemplateDefaults(raw); const b = esc(d.businessName), p = esc(d.phone), e = esc(d.email)
      return base(d.businessName, '#0f766e', `
  <header style="background:linear-gradient(135deg,#0f766e,#115e59);color:#fff"><div class="wrap" style="padding:56px 24px">
    <p style="opacity:.9;font-weight:600;letter-spacing:.04em">TRUSTED CARE</p>
    <h1 style="font-size:42px;line-height:1.1;margin:8px 0 16px;max-width:700px">${esc(d.headline)}</h1>
    <p style="max-width:640px;font-size:18px;opacity:.95">${esc(d.subheadline)}</p>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:24px">
      <a class="btn" style="background:#fff;color:#0f766e" href="tel:${p}">Call ${p}</a>
      <a class="btn alt" style="border-color:rgba(255,255,255,.4);color:#fff;background:transparent" href="mailto:${e}">${esc(d.ctaText)}</a>
    </div>
  </div></header>
  <main class="wrap" style="padding:40px 24px">
    <div class="grid grid3">${serviceCards(d.services, '#0f766e')}</div>
    <div class="card" style="margin-top:24px;display:flex;justify-content:space-between;gap:16px;align-items:center;flex-wrap:wrap">
      <div><h2 style="margin:0 0 6px">Ready to visit ${b}?</h2><p class="muted" style="margin:0">Reach out and our team will help you find the right slot.</p></div>
      <a class="btn" href="mailto:${e}?subject=Appointment%20Request">${esc(d.ctaText)}</a>
    </div>
  </main>`)
    },
  },
  {
    id: 'services-pricing',
    name: 'Services & Pricing',
    description: 'Service list with pricing cards and contact CTA. Easy to edit for any business.',
    accent: '#4f46e5',
    build: (raw) => {
      const d = withTemplateDefaults(raw); const p = esc(d.phone), e = esc(d.email)
      return base(d.businessName, '#4f46e5', `
  <header class="wrap" style="padding:48px 24px 24px"><p style="color:var(--accent);font-weight:700;margin:0">SERVICES</p><h1 style="font-size:40px;margin:8px 0 12px">${esc(d.businessName)}</h1><p class="muted" style="max-width:680px;margin:0">${esc(d.subheadline)}</p></header>
  <main class="wrap" style="padding-top:8px">
    <div class="grid grid3">${serviceCards(d.services)}</div>
    <div class="card" style="margin-top:24px"><h2 style="margin:0 0 8px">Need help choosing?</h2><p class="muted" style="margin:0 0 16px">Contact us and we'll recommend the right service.</p><a class="btn" href="tel:${p}">Call ${p}</a> <a class="btn alt" href="mailto:${e}" style="margin-left:8px">Email ${e}</a></div>
  </main>`)
    },
  },
  {
    id: 'contact-lead',
    name: 'Contact & Lead Page',
    description: 'Simple contact page with business details and a mailto lead form. No backend required.',
    accent: '#ea580c',
    build: (raw) => {
      const d = withTemplateDefaults(raw); const b = esc(d.businessName), p = esc(d.phone), e = esc(d.email)
      return base(d.businessName, '#ea580c', `
  <main class="wrap" style="padding:48px 24px"><div class="grid grid2">
    <div><p style="color:var(--accent);font-weight:700;margin:0">CONTACT</p><h1 style="font-size:40px;margin:8px 0 12px">Get in touch with ${b}</h1><p class="muted">${esc(d.subheadline)}</p>
      <div class="card" style="margin-top:20px"><p style="margin:0 0 8px"><strong>Phone:</strong> <a href="tel:${p}" style="color:var(--accent)">${p}</a></p><p style="margin:0"><strong>Email:</strong> <a href="mailto:${e}" style="color:var(--accent)">${e}</a></p></div></div>
    <div class="card"><h2 style="margin-top:0">${esc(d.ctaText)}</h2>
      <form action="mailto:${e}" method="post" enctype="text/plain" class="grid" style="gap:12px">
        <label>Full name<br/><input name="name" required /></label>
        <label>Phone<br/><input name="phone" /></label>
        <label>Message<br/><textarea name="message" rows="4" required></textarea></label>
        <button class="btn" type="submit">Send message</button>
        <p class="muted" style="font-size:12px;margin:0">This static form uses mailto. For real form capture, connect a form provider or backend.</p>
      </form></div>
  </div></main>`)
    },
  },
  {
    id: 'dental-care',
    name: 'Dental Care Landing',
    description: 'Dental-specific hero, treatments, before/after care points, and booking CTA.',
    accent: '#0891b2',
    build: (raw) => {
      const d = withTemplateDefaults(raw); const b = esc(d.businessName), p = esc(d.phone), e = esc(d.email)
      return base(d.businessName, '#0891b2', `
  <header style="background:linear-gradient(135deg,#0e7490,#155e75);color:#fff"><div class="wrap" style="padding:56px 24px">
    <p style="opacity:.9;font-weight:600">DENTAL CARE</p><h1 style="font-size:42px;margin:8px 0 16px;max-width:720px">${esc(d.headline || `Healthy smiles at ${d.businessName}`)}</h1>
    <p style="max-width:640px;font-size:18px;opacity:.95">${esc(d.subheadline)}</p>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:24px"><a class="btn" style="background:#fff;color:#0e7490" href="tel:${p}">Call ${p}</a><a class="btn alt" style="border-color:rgba(255,255,255,.4);color:#fff;background:transparent" href="mailto:${e}">${esc(d.ctaText)}</a></div>
  </div></header>
  <main class="wrap" style="padding:40px 24px">
    <h2 style="margin:0 0 16px">Our treatments</h2>
    <div class="grid grid3">${serviceCards(d.services, '#0891b2')}</div>
    <div class="grid grid2" style="margin-top:24px">
      <div class="card"><h3 style="margin-top:0">Why patients choose us</h3><ul class="muted" style="margin:0;padding-left:18px"><li>Gentle, patient-first approach</li><li>Clear treatment explanations</li><li>Hygiene and safety focused</li><li>Easy appointment scheduling</li></ul></div>
      <div class="card" style="background:#ecfeff;border-color:#a5f3fc"><h3 style="margin-top:0">Book your visit</h3><p class="muted">Call or email ${b} to schedule your appointment.</p><a class="btn" href="mailto:${e}?subject=Dental%20Appointment">${esc(d.ctaText)}</a></div>
    </div>
  </main>`)
    },
  },
  {
    id: 'testimonials-faq',
    name: 'Testimonials & FAQ',
    description: 'Social proof, FAQ, and strong contact CTA. Good for trust-building landing pages.',
    accent: '#7c3aed',
    build: (raw) => {
      const d = withTemplateDefaults(raw); const p = esc(d.phone), e = esc(d.email)
      return base(d.businessName, '#7c3aed', `
  <header class="wrap" style="padding:48px 24px 16px"><p style="color:var(--accent);font-weight:700;margin:0">TRUSTED BY PATIENTS</p><h1 style="font-size:40px;margin:8px 0 12px">${esc(d.headline)}</h1><p class="muted" style="max-width:680px">${esc(d.subheadline)}</p></header>
  <main class="wrap" style="padding-top:8px">
    <div class="grid grid3">
      <div class="card"><p style="margin:0 0 10px">“Very professional and friendly. The whole process was smooth.”</p><p class="muted" style="margin:0;font-size:13px">— Happy patient</p></div>
      <div class="card"><p style="margin:0 0 10px">“Clean clinic, clear explanation, and great care.”</p><p class="muted" style="margin:0;font-size:13px">— Local customer</p></div>
      <div class="card"><p style="margin:0 0 10px">“Booking was easy and the team was very helpful.”</p><p class="muted" style="margin:0;font-size:13px">— Returning patient</p></div>
    </div>
    <div class="card" style="margin-top:24px"><h2 style="margin-top:0">FAQ</h2>
      <p><strong>How do I book?</strong><br/><span class="muted">Call ${p} or email ${e} and we’ll confirm your slot.</span></p>
      <p><strong>Do you offer consultations?</strong><br/><span class="muted">Yes - our team can recommend the right service for your needs.</span></p>
      <p style="margin-bottom:0"><strong>Where can I ask questions?</strong><br/><span class="muted">Use the contact button below and we’ll respond as soon as possible.</span></p>
    </div>
    <div style="margin-top:24px;text-align:center"><a class="btn" href="mailto:${e}?subject=Inquiry">${esc(d.ctaText)}</a></div>
  </main>`)
    },
  },
  {
    id: 'multi-section',
    name: 'Full Multi-Section Page',
    description: 'Complete one-page site: hero, services, about, testimonials, FAQ, and contact. Deploy-ready starter.',
    accent: '#0f766e',
    build: (raw) => {
      const d = withTemplateDefaults(raw); const b = esc(d.businessName), p = esc(d.phone), e = esc(d.email)
      return base(d.businessName, '#0f766e', `
  <header style="background:#0f766e;color:#fff"><div class="wrap" style="display:flex;justify-content:space-between;gap:16px;align-items:center;flex-wrap:wrap"><strong style="font-size:20px">${b}</strong><nav style="display:flex;gap:14px;font-size:14px"><a href="#services" style="color:#fff;text-decoration:none">Services</a><a href="#about" style="color:#fff;text-decoration:none">About</a><a href="#contact" style="color:#fff;text-decoration:none">Contact</a></nav></div></header>
  <section style="background:linear-gradient(135deg,#0f766e,#134e4a);color:#fff"><div class="wrap" style="padding:56px 24px"><h1 style="font-size:42px;margin:0 0 12px;max-width:700px">${esc(d.headline)}</h1><p style="max-width:640px;opacity:.95">${esc(d.subheadline)}</p><a class="btn" style="background:#fff;color:#0f766e;margin-top:8px" href="#contact">${esc(d.ctaText)}</a></div></section>
  <main>
    <section id="services" class="wrap" style="padding-top:40px"><h2>Services</h2><div class="grid grid3">${serviceCards(d.services, '#0f766e')}</div></section>
    <section id="about" class="wrap"><div class="card"><h2 style="margin-top:0">About ${b}</h2><p class="muted" style="margin:0">We focus on clear communication, comfortable care, and reliable service. Replace this text with your real clinic story, team details, and values.</p></div></section>
    <section class="wrap"><h2>What people say</h2><div class="grid grid2"><div class="card"><p style="margin:0">“Great experience and very professional team.”</p></div><div class="card"><p style="margin:0">“Easy to book and excellent service quality.”</p></div></div></section>
    <section id="contact" class="wrap" style="padding-bottom:40px"><div class="card"><h2 style="margin-top:0">Contact</h2><p class="muted">Phone: <a href="tel:${p}">${p}</a> · Email: <a href="mailto:${e}">${e}</a></p><a class="btn" href="mailto:${e}?subject=Appointment%20Request">${esc(d.ctaText)}</a></div></section>
  </main>`)
    },
  },
]

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) { c ^= buf[i]!; for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1 }
  return (c ^ 0xffffffff) >>> 0
}

export function makeZip(files: Array<{ name: string; content: string }>): Blob {
  const enc = new TextEncoder()
  const local: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const f of files) {
    const name = enc.encode(f.name)
    const data = enc.encode(f.content)
    const crc = crc32(data)
    const lh = new Uint8Array(30 + name.length)
    const dv = new DataView(lh.buffer)
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0, true); dv.setUint16(8, 0, true)
    dv.setUint16(10, 0, true); dv.setUint16(12, 0, true); dv.setUint32(14, crc, true); dv.setUint32(18, data.length, true)
    dv.setUint32(22, data.length, true); dv.setUint16(26, name.length, true); dv.setUint16(28, 0, true)
    lh.set(name, 30)
    local.push(lh, data)
    const ch = new Uint8Array(46 + name.length)
    const cv = new DataView(ch.buffer)
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0, true)
    cv.setUint16(10, 0, true); cv.setUint16(12, 0, true); cv.setUint16(14, 0, true); cv.setUint32(16, crc, true)
    cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true)
    cv.setUint16(30, 0, true); cv.setUint16(32, 0, true); cv.setUint16(34, 0, true); cv.setUint16(36, 0, true)
    cv.setUint32(38, 0, true); cv.setUint32(42, offset, true)
    ch.set(name, 46)
    central.push(ch)
    offset += lh.length + data.length
  }
  const csize = central.reduce((n, a) => n + a.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(4, 0, true); ev.setUint16(6, 0, true); ev.setUint16(8, files.length, true)
  ev.setUint16(10, files.length, true); ev.setUint32(12, csize, true); ev.setUint32(16, offset, true); ev.setUint16(20, 0, true)
  return new Blob([...local, ...central, end] as BlobPart[], { type: 'application/zip' })
}

export function makeDeployPack(template: WebsiteTemplate, data: WebsiteTemplateData): Blob {
  const html = template.build(data)
  const readme = `# ${data.businessName} website\n\nTemplate: ${template.name}\n\n## Deploy\n1. Unzip this folder.\n2. Deploy the folder as a static site (Netlify Drop, Vercel, GitHub Pages, or any static host).\n3. Keep \`index.html\` at the site root.\n\nThis is a static starter generated from FlowSuite. Customize text, images, and forms before publishing.\n`
  return makeZip([{ name: 'index.html', content: html }, { name: 'README.md', content: readme }])
}
