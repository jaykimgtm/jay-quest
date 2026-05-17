# Recruiter Jay Kim's Quest

A Pokemon-style 2D RPG about Recruiter Jay Kim's journey from Salesforce to Anthropic. Built with Phaser 3 and Vite.

## Local Development

Install dependencies:

```sh
npm install
```

Start the local dev server:

```sh
npm run dev
```

Open the URL Vite prints in the terminal. The game uses a fixed 640x524 Phaser canvas; mobile sizing is handled with CSS around the canvas.

## Asset Folders

Future sessions should place assets under:

- `public/assets/characters/`
- `public/assets/tiles/`
- `public/assets/backgrounds/`
- `public/assets/bgm/`
- `public/assets/sfx/`

Register new assets in `public/assets/index.json`. The current schema is intentionally empty:

```json
{
  "version": 1,
  "characters": [],
  "tiles": [],
  "backgrounds": [],
  "bgm": [],
  "sfx": []
}
```

Later sessions can add metadata such as keys, paths, frame sizes, frame counts, frame rates, anchors, offsets, and scale.

## Build

Create the production build:

```sh
npm run build
```

The built site will be written to `dist/`.

## Deploy To GitHub Pages

This repo is published at:

```text
https://jaykimgtm.github.io/jay-quest/
```

The Vite base path is configured as `/jay-quest/` in `vite.config.js`.

To publish the contents of `dist/` to the `gh-pages` branch:

```sh
npm run build
git worktree add -B gh-pages ../jay-quest-gh-pages origin/gh-pages
rsync -av --delete dist/ ../jay-quest-gh-pages/
cd ../jay-quest-gh-pages
touch .nojekyll
git add -A
git commit -m "Deploy jay-quest"
git push origin gh-pages
cd -
git worktree remove ../jay-quest-gh-pages
```

If `origin/gh-pages` does not exist yet, create the worktree from the current branch instead:

```sh
git worktree add -B gh-pages ../jay-quest-gh-pages
```

Then continue with the `rsync`, commit, and push steps above.
