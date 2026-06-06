# 🚀 Publishing this project to GitHub

This guide gets the Quantum Logic Visualiser onto **GitHub** (so the code is
open-source) and onto the **web** (so anyone can use it from a link — perfect
for a classroom). No prior GitHub experience needed.

You only have to do this once. Pick **Option A** if you'd rather click buttons,
or **Option B** if you're comfortable with a terminal.

---

## Step 1 — Make a free GitHub account

1. Go to <https://github.com> and sign up (a school or personal email is fine).
2. Choose a username. This guide assumes **`ValentinaCarmignani`** — if you pick
   something different, see *"One small edit"* at the bottom.

---

## Step 2 — Create the repository

1. Click the **+** in the top-right of GitHub → **New repository**.
2. **Repository name:** `quantum-logic-visualiser`
3. Add a short description, e.g. *"See quantum computing as colourful
   ZX-diagrams — an educational tool."*
4. Choose **Public** (so it's open-source).
5. **Do not** tick "Add a README" — we already have one.
6. Click **Create repository**.

---

## Step 3 — Upload the files

### Option A — the easy, click-only way (GitHub Desktop)

1. Download **GitHub Desktop**: <https://desktop.github.com>
2. Install it and sign in with your GitHub account.
3. **File → Add Local Repository…** and choose this project folder
   (the one containing `README.md` and the `web/` folder).
   - If it says "this isn't a Git repository", click **"create a repository"**
     when prompted — that's fine.
4. GitHub Desktop will list all the files. Type a short summary like
   *"Initial commit"* in the bottom-left box and click **Commit to main**.
5. Click **Publish repository** at the top. Untick "Keep this code private",
   then **Publish**.

Done — your code is now on GitHub! 🎉

### Option B — the command-line way

Open a terminal **inside this project folder** and run:

```bash
git init
git add .
git commit -m "Initial commit: Quantum Logic Visualiser"
git branch -M main
git remote add origin https://github.com/ValentinaCarmignani/quantum-logic-visualiser.git
git push -u origin main
```

(GitHub will ask you to sign in the first time.)

---

## Step 4 — Put the web app online (GitHub Pages)

This makes the website live at a public link, for free.

1. On your repository page, click **Settings** (top menu).
2. In the left sidebar, click **Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Set **Branch** to `main` and the folder to **`/ (root)`**, then **Save**.
5. Wait 1–2 minutes, then refresh. GitHub shows your live link near the top.

Your visualiser will be live at:

```
https://ValentinaCarmignani.github.io/quantum-logic-visualiser/
```

(A small `index.html` at the repo root automatically forwards visitors to the
app in the `web/` folder, so this clean link just works.)

Share that link with classmates, teachers, anyone. It works on phones too.

---

## One small edit (only if your username isn't `ValentinaCarmignani`)

Two files mention the example web address. Update them so the links point at
your real repo:

- `web/app.js` — the line near the top: `const REPO_URL = "…";`
- `README.md` — the **Live demo** link.

Find-and-replace `ValentinaCarmignani` with your GitHub username and re-upload.

---

## Updating the project later

Any time you change the code:

- **GitHub Desktop:** write a short summary → **Commit to main** → **Push origin**.
- **Terminal:** `git add . && git commit -m "what changed" && git push`

GitHub Pages re-publishes your site automatically within a minute or two.

Happy quantum building! ⚛
