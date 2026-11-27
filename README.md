# Ace---assistance-

My personal AI assistant — Project ACE

The website is one page, `index.html`, published by GitHub Pages from the `main` branch at `https://jasonchad07.github.io/Ace---assistance-/`.

The current architecture, voice limits, phone plan and what still needs the owner are in [docs/ACE-STATUS.md](docs/ACE-STATUS.md).

That page sends each command as `POST {"message":"..."}` to `https://ace-brain.jasonchadpillay-07.workers.dev` and shows `reply` from the JSON response. Voice input and spoken replies stay in the browser.

`worker/ace-brain.js` is a reference copy of the brain. It is not the script Cloudflare is running. Merging a pull request updates the website only. It does not update Cloudflare.

To replace the live brain, from the Cloudflare account that owns `ace-brain`:

```bash
cd worker
npx wrangler login
npx wrangler deploy
npx wrangler secret put GEMINI_API_KEY
```

Paste a free Google AI Studio key when asked. Do not commit the key. `worker/.dev.vars` is ignored on purpose.
