# zizidonna.com

Static site, no build step on the server. Six public pages (home, About, Sessions, Collaborations, Contact, 404), the media kit, one stylesheet, and no JavaScript on the public pages; the private dashboard below is the one exception. Hosted on GitHub Pages at the custom domain. The embeds and links carry the booking (Cal.com), email (Substack), forms (Tally) and shop (ShopMy).

The design (third version, October 2026) follows ysl.com:
- pure black and white, square corners, one sans and the Bodoni wordmark;
- a sticky white bar: Instagram and TikTok on the left, About, Sessions, Collaborations and Login on the right, ShopMy behind the bag icon;
- every photograph graded to one look.

On the home page each photograph carries one topic and opens its Instagram video.

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

## Things only you can change (outside this folder)

- **Cal.com:** rename and reprice the two events to match the Sessions page. `feature-first-session` becomes "Style consultation", 1 hour, $125, and `closet-edit` becomes "Shopping consultation", 2 hours, $200. Keep the two links as they are.
- **Substack and Tally:** their boxes cannot be styled from the site. Setting each account's accent colour to black makes them match.
- **ShopMy:** make sure the storefront shows its own commission disclosure, since the site no longer carries one.
- **Photographs:** larger files of two photographs would sharpen them on large high-resolution screens: the mother-and-daughter photograph (1333 px wide today) and the studio profile, IMG_5070 (1003 px).

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
| `dashboard/dashboard.css` | its styles, on top of the site's `/assets/style.css` (header, footer, type and colours come from there); black and white like the rest of the site since 29 October 2026 |
| `dashboard/dashboard.js` | sign-in, both views, autosave, CSV import/export (manager only), mock mode |
| `dashboard/firebase-config.js` | the Firebase web config (public by design; placeholders until setup step 8) |
| `dashboard/firestore.rules` | the security rules to paste into the Firebase console; the real lock. Re-paste and **Publish** whenever this file changes (the Pipeline fields need the October 2026 version) |

Preview the layout without Firebase at `/dashboard/?mock=1` (made-up rows, nothing saved; `&as=zizi` shows Zizi's view; add `#pipeline` to open the Pipeline view).

## Editing

- **The look:** colours, type and layout live in `assets/style.css`. Bump `?v=6` in every page when it changes.
- **The home page:** `index.html` is written by hand.
- **The other pages:** About, Sessions, Collaborations, Contact, 404 and the media kit are written by `tools/pages.py` and `tools/mediakit.py` in the project folder.
  - Edit the words there and run `python3 tools/pages.py`. That keeps the header and footer identical everywhere.
  - `python3 tools/pages.py --check` confirms `index.html` still has the same header and footer.
- **The media kit PDF:** after changing the media kit, serve the site locally and run `python3 tools/mediakit_pdf.py`.
- **Photographs:** see `assets/img/README.md`.

## Pages removed in October 2026

Guides, Letter, Cars and Brands were removed. Brands became Collaborations, at `/collaborations/`. Their old addresses now show the 404 page.
