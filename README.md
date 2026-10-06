# Association website

Static site built with [Eleventy](https://www.11ty.dev/) (3.x), edited through
[Sveltia CMS](https://github.com/sveltia/sveltia-cms) (`/admin/`), deployed by
GitHub Actions to GitHub Pages at https://maisondela.fr. User-facing content is in French.

## Local development

```bash
npm install
npx @11ty/eleventy --serve   # http://localhost:8080
```

The site is generated into `_site/` (`npm run build`).

## Structure

The repository is split into three bricks, one per owner:

**Editor brick — written by the CMS only, never edited by hand:**

- `content/articles/`, `content/events/` — Markdown content. The
  `articles.json` / `events.json` files apply layout, tags and permalink:
  the editor never fills in technical fields.
- `content/data/association.json` — global info (name, address, email),
  editable in the CMS under "Paramètres du site".
- `uploads/` — images uploaded from the CMS (served at `/uploads`).

**Developer brick — rendering:**

- `src/_includes/layouts/` — `base.njk` (skeleton), `article.njk`, `event.njk`.
- `src/_includes/components/` — header, footer and `*-card.njk` macros.
- `src/pages/` — home, agenda, news (data logic: loops, filters).
- `src/assets/css/style.css` — single stylesheet, plain CSS (served at `/assets`).

**CMS brick — the contract between the two:**

- `admin/config.yml` — collections and fields; must match exactly what the
  templates consume.
- `admin/sveltia-cms.js` — pinned Sveltia CMS bundle.

Build config lives in `eleventy.config.js`; output goes to `_site/`.

**Data contract**: fields declared in `admin/config.yml` must match exactly
what the templates consume. Any schema change happens on both sides at once.

## Initial setup (maintainer)

1. Make sure `repo:` in `admin/config.yml` points to this repository.
2. *Settings → Pages → Build and deployment → Source*: **GitHub Actions**.
3. *Settings → Pages → Custom domain*: `maisondela.fr`, then tick
   **Enforce HTTPS** once the certificate is issued.
4. Require 2FA on every GitHub account with access to the repository.

## Editor access (GitHub token)

The editor signs in at `https://<domain>/admin/` with a **fine-grained GitHub
personal access token**:

1. The editor's GitHub account must be a collaborator on the repository
   (write) with 2FA enabled.
2. GitHub → *Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token*.
3. **Repository access**: *Only select repositories* → this repository only.
4. **Permissions**: *Contents: Read and write*. Nothing else.
5. Set an **expiration date** (1 year max; renew afterwards).
6. In `/admin/`, choose token sign-in and paste the token.

The token must never be committed or shared.

## Updating Sveltia CMS

The bundle is **pinned** and committed in the repository as
`admin/sveltia-cms.js`. The file name must not change: Sveltia's auto-init
only triggers when the script URL ends with `/sveltia-cms.js`. The pinned
version is recorded here: **currently 0.170.5**. The project is in beta with
frequent releases (including security fixes): update regularly.

```bash
npm view @sveltia/cms version
curl -sL -o admin/sveltia-cms.js \
  "https://unpkg.com/@sveltia/cms@<version>/dist/sveltia-cms.js"
```

Then update the version recorded above, test `/admin/` locally and commit.

## Deployment

Push to `main` → `.github/workflows/deploy.yml`: Eleventy build, then the
`_site/` artifact is published to GitHub Pages. No secrets are needed. The
build reads the Pages base path (`/website` until the custom domain is set,
then empty) through `PATH_PREFIX`, so every root-relative URL is prefixed by
Eleventy's `HtmlBasePlugin`; CSS and JS reference assets with relative paths. Every
CMS save is a commit on `main`, so the site rebuilds within a couple of
minutes.

## DNS (maisondela.fr)

At the domain registrar:

| Type | Name | Value |
|---|---|---|
| `A` | `@` | `185.199.108.153` |
| `A` | `@` | `185.199.109.153` |
| `A` | `@` | `185.199.110.153` |
| `A` | `@` | `185.199.111.153` |
| `AAAA` | `@` | `2606:50c0:8000::153` |
| `AAAA` | `@` | `2606:50c0:8001::153` |
| `AAAA` | `@` | `2606:50c0:8002::153` |
| `AAAA` | `@` | `2606:50c0:8003::153` |
| `CNAME` | `www` | `maisondela.github.io.` |

Remove any other `A`/`AAAA` records on `@`. To prevent domain takeover, verify
`maisondela.fr` in the organization settings (*Settings → Pages → Add a
domain*).

## Security — non-negotiable rules

- No secrets in the repository (the `/admin/` page is public and powerless).
- Fine-grained editor tokens, restricted to this repository, with expiration.
- Pinned CMS bundle, updated manually.
- 2FA required on GitHub.
