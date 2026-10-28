# zizidonna.com

Static site, no build step. Eight pages, one stylesheet, no JavaScript on the public pages (the private dashboard below is the one exception). Hosted on GitHub Pages at the custom domain; the embeds (Cal.com, Gumroad, Substack, Tally, ShopMy) carry the booking, payments, email and forms.

This folder is the whole repository. Keep the planning documents in the parent folder out of it; the repository is public.

## Publish

1. Create a **public** repository under the GitHub account that belongs to this project (not a work account). Name it anything; `zizidonna.com` is conventional.
2. From this folder:
   ```
   git init
   git add -A
   git commit -m "Site"
   git branch -M main
   git remote add origin git@github.com:franzbdoyan/zizidonna.com.git
   git push -u origin main
   ```
3. On GitHub: Settings → Pages → Source: "Deploy from a branch" → Branch `main`, folder `/ (root)` → Save.
4. Settings → Pages → Custom domain: `zizidonna.com` → Save. The `CNAME` file in this folder matches it, so a redeploy does not drop the setting.
5. When the DNS check passes (below), tick **Enforce HTTPS**.

## DNS at Squarespace

Domains → zizidonna.com → DNS.

1. Delete the forwarding rule added earlier (forwarding and A records conflict).
2. Add four **A** records, host `@`:
   - 185.199.108.153
   - 185.199.109.153
   - 185.199.110.153
   - 185.199.111.153
3. Add one **CNAME** record, host `www`, value `franzbdoyan.github.io` (the GitHub account name, not the repository).
4. Leave the Google Cloud DNS nameservers as they are.
5. Allow up to an hour, then check https://zizidonna.com in a private window. `www.zizidonna.com` redirects to the apex once GitHub sees both records.

## Before launch: replace these placeholders

Search the HTML for `data-todo` to find every one.

| Placeholder | Where | Replace with |
|---|---|---|
| ~~`shopmy-link`~~ | Home (twice) | done: `https://shopmy.us/zizidonna` is live |
| ~~`cal-link`~~ | Sessions (two buttons) | done: `cal.com/zizidonna/feature-first-session` and `/closet-edit`; update if the Cal.com username changes |
| ~~`substack-publication`~~ | Home, Guides, Letter | done: `zizidonna.substack.com` |
| `gumroad-proportions`, `gumroad-strong-nose` | Guides | Gumroad product links, and change the button text to "Buy", when the PDFs exist |
| ~~`tally-form`~~ | Brands, Contact | done: forms `OQDqX8` (partnership) and `X5xALj` (contact) |
| ~~`manager-email`~~ | Brands, Contact | done: `collab@zizidonna.com` (brands) and `info@zizidonna.com` (everything else), both Squarespace forwards |
| ~~`media-kit-link`~~ | Brands | done: `/media-kit/` page with a PDF download button |
| `about-her-words` | About | two or three sentences from Zizi |
| `upcoming-shows` | Cars | the next car show, or remove the list |
| `shopmy-driving-wardrobe` | Cars | remove `hidden` when the Driving-wardrobe collection exists |
| `recent-letters` | Letter | the three latest issues, once there are three |

The `about-her-words`, `upcoming-shows` and `recent-letters` hooks carry the `hidden` attribute; remove it when the hook is filled. The two `gumroad-*` links are the "Notice by letter" buttons.

Images: see `assets/img/README.md`.

## Analytics (optional, free)

Add one line before `</head>` on every page. GoatCounter:
```
<script data-goatcounter="https://SITE.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>
```
Cloudflare Web Analytics works the same way with its own snippet.

## Dashboard

`/dashboard/` is a private two-person page where the manager and Zizi work through the brand list (Google sign-in through Firebase; data in Cloud Firestore; only two accounts allowed, enforced by the database rules). It has two views over the same data: **Brands**, where Zizi answers "Would you buy or use this with your own money?" (0–5), and **Pipeline**, a small CRM for outreach status, contacts and follow-ups that only the manager can edit (Zizi sees it read-only). Every page header links to it as "Login". It is `noindex` and not in `sitemap.xml`. No brand data is in this repository: the list is imported into the database from the private tracker CSV.

Setup, from creating the Firebase project to the first import, is in `setup-dashboard.md` in the parent project folder.

| File | What it is |
|---|---|
| `dashboard/index.html` | the page |
| `dashboard/base.css` | a frozen copy of the public stylesheet as it was on 27 October 2026; the dashboard's header and layout depend on it; never edit |
| `dashboard/dashboard.css` | its styles, on top of `dashboard/base.css` |
| `dashboard/dashboard.js` | sign-in, both views, autosave, CSV import/export (manager only), mock mode |
| `dashboard/firebase-config.js` | the Firebase web config (public by design; placeholders until setup step 8) |
| `dashboard/firestore.rules` | the security rules to paste into the Firebase console; the real lock. Re-paste and **Publish** whenever this file changes (the Pipeline fields need the October 2026 version) |

Preview the layout without Firebase at `/dashboard/?mock=1` (made-up rows, nothing saved; `&as=zizi` shows Zizi's view; add `#pipeline` to open the Pipeline view).

## Editing

Every page repeats the same header and footer; change them in all nine public files (the eight pages and `404.html`); the dashboard has its own copy. Styles live in `assets/style.css`; the dashboard does not load it. Colours and fonts are the custom properties at the top.
