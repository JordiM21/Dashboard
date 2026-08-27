# Gamification bar sound files (optional)

The Teaching view's bottom toolbar (Confetti / Victory / Drum Roll / Applause)
plays synthesized Web Audio sounds by default — no files needed, works out
of the box.

To use real recorded sound effects instead, drop MP3 files here with these
**exact** names:

- `confetti.mp3`
- `victory.mp3`
- `drumroll.mp3`
- `applause.mp3`

`lib/soundEffects.ts` checks for each file first and plays it if present;
if a file is missing (or fails to load), that button falls back to the
synthesized version automatically — no code changes needed either way.

Make sure any file you add here is one you're actually allowed to
redistribute inside this app (a purchased/royalty-free sound library, or
something you recorded yourself) — a page that just *embeds* another
site's player (e.g. an iframe from a soundboard site) can't be triggered
by our button anyway, since cross-origin iframes can't be controlled by
the parent page's JavaScript; it would only show a widget someone has to
click themselves. An actual downloaded MP3 file dropped here is what
works.
