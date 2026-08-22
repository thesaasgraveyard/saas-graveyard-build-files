# The Build Files

The actual code behind **The SaaS Graveyard** — a first-person series about a non-technical small business owner replacing paid software with tools built using Claude.

- **Read the stories:** [thesaasgraveyard.substack.com](https://thesaasgraveyard.substack.com)
- **The businesses:** MAG Beverages (wholesale kava beverages) and Sweet Tapioca Cafe, Saint Louis, MO.
- **Running total:** $1,080+/year in cancelled subscriptions, built in under 20 hours of actual working time, with zero coding background.

These are not products. They are the genuine, small-business-grade tools I built for two real businesses, shared here so you can take one and adapt it to yours instead of just reading about mine. Every build includes the plain-language prompts that produced it, because the prompt is the part most people never get to see — and it is the part that actually matters.

> **Before you trust any of this:** these tools are shared as-is, with no support and no warranty. **Credentials, live URLs, PINs, and employee names have been removed and replaced with `PASTE_YOUR_...` / `YOUR_..._HERE` placeholders** — you must fill in your own before anything will run. Costs, links, and third-party services may have changed since the articles were written. Read the code (or have Claude read it to you) before running it in your own business.

---

## What's in here

Each folder is one build: what it does, what it replaced, what it runs on, and the real prompts.

### `digital-signage/` — TV signage (replaced OptiSigns, $240/yr)
Shows images and short videos on the cafe's TVs. Content lives in a Google Drive folder; drop a file in and the screen updates within minutes. Includes the browser-based web player and a native Roku channel.
- **Stack:** Google Apps Script · Google Drive · Netlify · Roku (BrightScript)
- **Story:** SaaS Graveyard, Part Two
- **Set before running:** each Apps Script's `FOLDER_ID` (your Drive folder), the deployed Web App URLs in `player/netlify.toml` and `roku-channel/source/config.brs`.

**Prompts that worked**
- `[AUTHOR: paste the prompt you used to design the signage player / Roku channel]`

### `timeclock/` — Employee time clock (replaced part of Homebase, $288/yr with the scheduler)
A QR code on the wall opens a phone page where employees tap to clock in and out. A Google Sheet logs every punch and keeps a running pay-period summary, so the math is already done on payday.
- **Stack:** Google Apps Script · Google Sheets
- **Story:** SaaS Graveyard, Part Three
- **Set before running:** the `EMPLOYEES` list, `PAY_PERIOD_EPOCH`, and the deployed Web App URL in the printable QR sheet.

**Prompts that worked**
- `[AUTHOR: paste the time-clock prompt if it was separate from the scheduler]`

### `scheduler/` — Staff scheduler (replaced part of Homebase, $288/yr with the time clock)
A weekly shift grid employees view through a shared link, and a manager edits behind a PIN. A "Copy Last Week" button handles the weeks that don't change, which is most of them.
- **Stack:** Google Apps Script · Google Sheets
- **Story:** SaaS Graveyard, Part Three
- **Set before running:** the `EMPLOYEES` list, and a `MANAGER_PIN` (change the `0000` default, or set a `MANAGER_PIN` Script Property).

**Prompts that worked**
- *The original design prompt (built in Claude Cowork):*
  > The goal is to replace a paid Homebase subscription (the time clock app) for a few employees. Explore and present the tradeoffs of using a free service you find (analyze the competitors of Homebase for viable options) or just coding our own from scratch (can be as simple as needed — just a simple clock in and clock out feature).

  *(After reading the tradeoffs I chose to build from scratch, so I could customize it exactly. That's also where Claude suggested the auto-updating "Weekly Summary" tab that recalculates payroll totals every time someone clocks in or out.)*
- *A later improvement prompt (in Claude Code):*
  > The Scheduler is a little slow but functional. I need you to review all the code for any inefficiencies and vulnerabilities, and suggest edits that will improve the UI and code. The functionality does not need to change much if at all, and attached is the color palette for the brand.

---

### Coming soon
Two more builds are documented in the series and will be added here after their own credential scrub:
- **CRM dashboard** (Part Four) — a Monday.com-style dashboard + a redirect to a Google Sheet.
- **Wholesale order system** (Part Six, forthcoming) — a direct order page with Net 60 terms and invoicing.

---

## How to adapt any of this with Claude

You do not need to know how to code to use these. Here is the whole method:

1. **Download the folder** for the build closest to what you need.
2. **Open Claude** (the desktop app, or Claude Code if you have it) and give it the folder. Ask it, in plain language, to read everything and explain what the tool does and what it would need to run.
3. **Describe your business,** specifically. Not "a cafe" — *your* cafe: your product names, your prices, your terms, the exact thing you want changed. The clearer you are, the better this goes. That is the actual skill.
4. **Ask for the changes** one at a time, and ask Claude to explain what each change does in plain terms before you accept it.
5. **Fill in the placeholders.** Anywhere you see `PASTE_YOUR_...` or `YOUR_..._HERE`, that is a spot for your own value — a Drive folder, a deployed URL, a PIN. Ask Claude how to get each one; it will walk you through the setup steps.
6. **Expect a few things to break,** and paste the errors back to Claude. That back-and-forth is not you failing. It is the normal, unglamorous middle of every build in this series.

If you get something working, or get stuck, the newsletter comments are open. This repository grows as the series does.

---

*Built with Claude by a non-technical small business owner. Nothing in the articles is invented — including the parts that went wrong.*
