Sprich deutsch mit mir.

## Mission
Onepager für n8nAI (https://n8nai.io): bewirbt die kostenlose Chrome‑Extension, zeigt Video + Screenshots, Dark/Light‑Mode, EN (Default) + DE, Waitlist (E‑Mail an waitlist@n8nai.io). Privacy unter /privacy.html mit GDPR‑Hinweis. Design angelehnt an n8n (Akzent #ED7863), Font Space Mono.

## Anforderungen (Kurz)
- Statische Site (EN: /, DE: /de/) mit Header‑Switcher (EN/DE) und Theme‑Toggle.
- Sektionen: Hero, Features, Video (YouTube placeholder), Screenshots, CTA (Add to Chrome), Waitlist, FAQ, Footer/Disclaimer.
- Waitlist: Formular (Name, E‑Mail, optional Message, Checkbox Consent). Versand via SMTP (Strato) an waitlist@n8nai.io (Absender no-reply@n8nai.io). Keine DB. Kein Double‑Opt‑In.
- Cookie‑Banner: nur notwendige Cookies (Sprache, Consent, ggf. Video‑Consent nicht erforderlich, Video lädt bei Klick auf Play).
- SEO/GEO/AEO: strukturierte Daten (SoftwareApplication/BrowserExtension, FAQPage, HowTo, VideoObject placeholder, WebSite, Organization), hreflang, saubere Meta, OG/Twitter optional (deaktiviert auf Wunsch).
- Sicherheit: Keine Secrets im Repo; .env.example bereitstellen.

## Struktur
```
n8n_onepager/
  public/
    index.html        # EN default
    de/index.html     # DE
    privacy.html      # EN default (+ DE Toggle)
    assets/
      css/
      js/
      screenshots/    # ask_workflow.png, explain_canvas.png, settings.png, speech_to_text.png, ui.png
  server/
    index.js          # Express + Nodemailer (POST /api/waitlist)
    .env.example
  deploy/
    nginx.n8nai.io.conf.example
    systemd-n8nai-waitlist.service.example
    README_DEPLOY.md
```

## Umsetzungsschritte
1) Static Pages & Assets
2) i18n + Theme + Cookie Banner
3) Waitlist Endpoint (SMTP via env)
4) SEO/GEO/AEO (JSON‑LD, hreflang)
5) Deploy‑Templates (Nginx, TLS, systemd)

## Copy (EN/DE)
- Claim EN: "Build n8n workflows with AI — right inside the editor."
- Claim DE: "Erstelle n8n‑Workflows mit KI — direkt im Editor."
- Value EN: "Ask questions, auto‑create nodes, and insert workflows into the canvas. Free Chrome extension."
- Value DE: "Stelle Fragen, erstelle Knoten automatisch und füge Workflows in den Canvas ein. Kostenlose Chrome‑Extension."
- Disclaimer EN: "Not affiliated with n8n GmbH."
- Disclaimer DE: "Keine Verbindung zur n8n GmbH."

## Richtlinien
- Keine hartcodierten Secrets; env + .env.example.
- Barrierearme Kontraste; mobile‑first; minimale JS.
- Keine 3rd‑party Tracker; nur YouTube embed im privacy‑enhanced Modus (lädt bei Play).

