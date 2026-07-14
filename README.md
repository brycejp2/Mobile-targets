# Blind Shot

A mobile-first web game: throw a dart at a target you **can't see**. The target
sits off-screen, so you aim *blind* using the X/Y edge gauges — drag back to set
power and angle (slingshot style), release, and watch the camera reveal where it
landed.

Modes: **Endless**, **Time Attack** (60s), **Daily Challenge** (limited tries +
passing score), **Prediction** (guess where a fixed throw lands), and a
**Workshop** to build, save, and share your own levels.

Built with TypeScript + Vite, rendered on an HTML5 canvas. No frameworks.

---

## Play it on Windows (or any computer)

You need **Node.js** (which includes `npm`). Then it's three commands.

### 1. Install Node.js
Download the **LTS** installer from <https://nodejs.org> and run it (accept the
defaults). To confirm it worked, open **PowerShell** (Start menu → type
"PowerShell") and run:

```powershell
node --version
```

You should see a version like `v22.x`.

### 2. Get the code
If you have Git:

```powershell
git clone https://github.com/brycejp2/mobile-targets.git
cd mobile-targets
git checkout claude/dart-game-brainstorm-cb873f
```

No Git? On the GitHub page, switch to the `claude/dart-game-brainstorm-cb873f`
branch, click **Code → Download ZIP**, then unzip it and `cd` into the folder in
PowerShell.

### 3. Install and run

```powershell
npm install
npm run dev
```

Vite prints a URL — open **http://localhost:5173** in your browser. Press
`Ctrl+C` in PowerShell to stop the server when you're done.

### Production-style run (optional)
```powershell
npm run build
npm run preview
```

---

## Controls

- **Aim & throw:** press and drag **anywhere**, then release. Drag *length* =
  power; drag *direction* sets the angle (you launch **opposite** the pull, like
  a slingshot). The gauges on the top and right edges show how far the target is
  in X and Y.
- **Prediction mode:** the power/angle are fixed and shown — tap where you think
  the dart will land, then **Lock In**.
- **Workshop:** pick a tool (Target / Wall / Portal), tap or drag on the canvas
  to place it, adjust wind/mode, then **Test**, **Save**, or **Share**.

Mouse works fine on desktop. To feel the intended phone layout, open the
browser dev tools (`F12`) and toggle the device toolbar (`Ctrl+Shift+M`),
then pick a phone in portrait.

---

## Publishing levels without redeploying

The game fetches `public/content/levels.json` and `daily.json` at runtime, so
you can add levels or a new daily challenge by editing those files (or pointing
`CONFIG.contentUrl` in `src/config.ts` at any static host). See
[`public/content/README.md`](public/content/README.md) for the format.
