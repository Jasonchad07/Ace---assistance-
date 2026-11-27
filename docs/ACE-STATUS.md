# ACE status

Checked on 27 November 2026. This note describes the project as it is, including what was seen on the live brain that day. It is not a promise that later phases already work.

## Current architecture

ACE is a personal assistant with two parts.

The website is a single page, `index.html`, published by GitHub Pages from the `main` branch at `https://jasonchad07.github.io/Ace---assistance-/`. Typing, a quick command, or the microphone sends the words as `POST {"message":"..."}` to `https://ace-brain.jasonchadpillay-07.workers.dev`. A successful answer is `{"reply":"...","model":"..."}`. The page shows `reply` as plain text. The microphone and the spoken reply use the phone or computer browser, not Cloudflare.

The brain is a Cloudflare Worker named `ace-brain`. The copy in `worker/ace-brain.js` is the reference script. It is not updated by merging a pull request. Someone has to deploy it on purpose. The key `GEMINI_API_KEY` stays in a Cloudflare secret. It is not in this repository.

On 27 November 2026 the live worker was healthy:

- `GET` returned 200 and `{"status":"online","assistant":"ACE","brain":"Gemini"}`.
- A short introduction request returned 200 in under a second. The model that answered was `gemini-3.5-flash-lite`.
- The reply was plain: "I am ACE, your personal assistant for planning, research, business ideas, and task management." It did not sound like the old British gentleman.
- The browser permission headers allow `https://jasonchad07.github.io`, which is the right address for the published site.

The reference script tries `gemini-3.5-flash-lite`, then `gemini-3.1-flash-lite`, then `gemini-3.8-flash`. That third name matches the extra fallback already added on the live worker. The first model answered the live test, so the third one was not needed that time.

There is no login on the worker. Anyone who can reach that public address can spend the free Gemini allowance. There is no memory store, no calendar, no notification sender, and no control of other apps.

## Bugs and limitations found

- The live persona is still the plain one until the owner deploys the updated script. Changing the file in git does not change Cloudflare.
- Spoken replies use the browser speech engine. On this project that means the Web Speech API. The words can include markdown stars and brackets unless they are cleaned first. Cleaning is in this branch; it is not on the published site until this work is merged.
- The chat shows the reply exactly as Gemini wrote it, including any markdown marks. That is deliberate: the cleaner is only for speech. The screen does not turn markdown into bold or links, because building HTML from a model reply is an easy way to create a security hole.
- Chrome often fills the voice list a moment after the page opens. The picker has to wait for that. A saved choice can also disappear if the phone's voice list changes.
- The microphone needs a tap. There is no "Hey ACE", and the page cannot keep listening with the screen off.
- Quick commands send immediately. There is no approval step yet, because those four commands only ask for advice.
- There is no emergency stop beyond turning voice off or leaving the page.
- There is no memory. Nothing is kept between visits except the chosen voice in this browser's local storage, and whether the page was installed.
- Device control, banking, messages and social apps are not connected. The page says so.
- A copy of the page opened as a file on a computer cannot call the brain. The live worker only accepts the GitHub Pages address and a few local test addresses.
- The published site address is a project page, `.../Ace---assistance-/`, not the root of `jasonchad07.github.io`. The installable app has to live in that folder.

## Voice today, and what would sound more natural

What ACE uses now is the browser's own speech synthesis. The page asks for British English, a calm rate (0.94) and a pitch just under normal (0.86). It prefers a British male voice by name, then any British voice that is not named as female, then any British voice, then an English male, then any English voice. The owner can override that with the voice menu. The choice is stored only on that browser.

The automated page test ran in headless Chrome on a computer with no installed voices, so the menu showed only "Automatic British male" and no audio was heard. The preference order was checked separately with stand-in voice names. It still has to be heard on the phone.

On Chrome for Android, that engine is usually Google's on-device text-to-speech. The names people actually see are often "Google UK English Male" and "Google UK English Female", or a Samsung voice such as "English (United Kingdom)" if Samsung's engine is the one selected in Android settings. Those voices are understandable. They do not sound like a recorded person. This was not tried on the Galaxy A53. The names above are how Chrome on Android usually exposes the system voices, not a list read from that phone.

A cloud voice would sound much more natural. It also needs a new Google Cloud speech account, billing turned on, and a new secret. None of that was added here.

Rough cost, from Google's pricing pages on 27 November 2026. Confirm before spending money; prices change.

| Voice | British male examples | Free allowance | After that | Notes |
|---|---|---|---|---|
| Browser voice, used now | Google UK English Male, or whatever the phone has | Free | Free | No extra key. Quality is the weak part. Works offline once the voice is installed. |
| Cloud Neural2 | en-GB-Neural2-B, en-GB-Neural2-D, en-GB-Neural2-O | First 1 million characters a month | About $16 per million characters | Clearly better than the phone voice. Needs Cloud billing even to use the free amount. A separate key from the Gemini chat key. |
| Cloud Studio | en-GB-Studio-B | First 1 million characters a month | About $160 per million characters | More polished, much more expensive. Same new key and billing. |
| Chirp 3 HD | en-GB-Chirp3-HD-Achird, Charon, Enceladus, and other named male voices | First 1 million characters a month | About $30 per million characters | The most natural fixed British voices in that catalogue. Same new key and billing. |
| Gemini TTS | Male voices such as Achird or Charon, with en-GB still marked preview on the Cloud speech docs | No free allowance on the price table checked | Charged per token from the first request. Gemini 3.8 Flash TTS was about $0.50 per million text tokens and $9 per million audio tokens through 31 December 2026, then higher. Audio is about 25 tokens a second. | Can follow a style note such as "calm British gentleman". Not the same as the existing free Gemini chat key. The newest Gemini TTS models were documented on a different Google API from the one ACE uses for chat. |

For a single person talking through the day, Neural2's free million characters is a lot of speech (a million characters is several hours of reading). Studio and Chirp burn the free allowance faster in money once it is gone. Gemini TTS had no free tier on the price table that was checked, so it can cost from the first reply.

Recommendation: keep the phone voice until the owner has listened to it on the A53 and decided it is not good enough. If it is not, the next step is Cloud Neural2 or Chirp 3 HD through the Worker, with a new secret the owner creates. Do not reuse the chat key unless Google's docs say that same key is allowed for that speech API. Do not put the new key in git.

## Recommended Android shape

Use the website as an installable home-screen app now. That is the right first step on the A53: Chrome, Add to Home screen, then ACE opens like an app. It can take microphone permission while it is open. It can show text and speak. It cannot reliably be a hands-free assistant.

A website, even an installed one, cannot:

- keep the microphone open while the screen is locked or another app is in front
- start listening again by itself after a reboot
- open WhatsApp, Samsung Messages, or a social app and tap controls for you
- be an always-on "Hey ACE" listener

Those need a small Android app the owner installs himself. It should be a companion, not a replacement: the same page can stay inside a simple app window, and the extra Android pieces do only what the website cannot.

Suggested split:

1. Installed website for chat, advice, the voice picker, and quick commands. This phase.
2. Later, a companion app with a normal notification when ACE has a reminder. Web Push can do some of this, but Android is fussy about it and it still cannot wake the microphone.
3. A foreground service, started by the owner while ACE is on screen, with a visible "ACE is listening" notification. Android 14 and later require the microphone foreground-service type, and the microphone permission only counts as granted while the app is in use. The service cannot be started from the background, and it cannot be started from boot. After every reboot the owner opens ACE once. Android 16 does not remove that rule.
4. Wake word inside that service, not inside the browser. OpenWakeWord is the free, on-device option and needs no extra key. Picovoice Porcupine is more polished and needs a Picovoice key, which would be another secret. Either one still needs the foreground microphone service. The phone will show a microphone notification the whole time, and it will use battery.
5. Opening other apps should be a short, named list. Drafting a message is allowed. Sending, publishing, or paying is not, unless the owner has just approved that exact action. An Accessibility service can press buttons in other apps, but it can also read everything on screen. It must refuse banking and payment packages entirely. Google Play is strict about accessibility services. For a personal tool, installing the app directly on this phone is more realistic than a public store listing.

Do not build the companion app until the installed website has been tried on the phone and the owner still wants hands-free listening.

## Security implementation plan

Nothing in this phase touches another app. The rules below are the plan for when that starts. They match the owner's brief.

Hard stops, in the brain and in any future phone code:

- Never open, read, or type into a banking or payment app.
- Never ask for, store, or repeat a password, PIN, card number, or one-time code.
- Social apps may be opened and a post may be drafted on screen. Nothing is published unless the owner approves that exact text.
- SMS, WhatsApp and email may be drafted. Nothing is sent unless the owner approves that exact message.
- Harmless work, such as a briefing or a to-do list, can run on its own.
- Anything that leaves the phone, spends money, deletes data, or cannot be undone needs an approval on screen.
- An emergency stop must cut listening, speech, and any pending action immediately.
- A permission screen must list what ACE is allowed to do, and the owner must be able to turn each item off.
- Memory, when it exists, must be readable, editable and deletable, and must refuse credentials. Local storage of the chosen voice is not memory of the owner's life.
- The public worker should eventually have a simple shared secret or other check so strangers cannot drain the free Gemini allowance. That check must not be committed as a real key.

The gentleman prompt in this branch already says not to ask for secrets and not to pretend a draft was sent. That only takes effect after the worker is deployed.

## Phased roadmap

1. Inspect. Done. The page, the worker contract, and the live 502 cause were written up with the first pull request.
2. Stabilise. Done on the live worker. Health and a real reply were checked again on 27 November 2026. The earlier 502 was Gemini being too busy, and the current model list got past that in the live test.
3. Voice. Started here: clean the words before they are spoken, prefer a British male voice, remember the owner's choice, and put the gentleman persona back in the script that will be deployed later. Cloud speech is not started.
4. Android. Started only as far as a home-screen install. Notifications, reminders, and controlled app opening are not built.
5. "Hey ACE". Not started. It needs the companion app and a foreground microphone service. It will not work as a website feature.
6. Memory and autonomy. Not started. No database, no scheduled tasks, no approval screen, no emergency stop yet.

## Blockers only the owner can clear

- Deploy `worker/ace-brain.js` after approving it. Merging the website pull request does not do this. Do not replace `GEMINI_API_KEY` if it is already set. This work did not read or change that secret.
- On the Galaxy A53, open the published site in Chrome after the website changes are merged, allow the microphone, and use Add to Home screen. Confirm the voice menu lists a British male voice and that speech is understandable.
- Decide whether the phone voice is good enough before anyone creates a Cloud speech key.
- For a later companion app: install the app himself, grant microphone and notification permission, and accept that listening after a reboot means opening ACE once. An accessibility service, if it is ever used, needs a separate explicit yes and must exclude banking apps.
- Any new speech or wake-word account is a new secret the owner creates in that provider's console. It must not be pasted into git.

## What this branch changes

- `js/speech.js` cleans markdown out of the spoken text only. Tests are in `js/test-speech.mjs`.
- The page prefers a British male voice, with a menu that remembers the choice in local storage.
- `worker/ace-brain.js` restores the calm British gentleman, uses "brother" only occasionally, and keeps `gemini-3.8-flash` as the third model so a later deploy does not drop it.
- `manifest.webmanifest`, `sw.js` and `icons/` make the site installable. The service worker does not cache the brain, and it tries the network before the saved copy so an update is not stuck on the phone.
