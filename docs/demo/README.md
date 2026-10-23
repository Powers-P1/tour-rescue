# Optional jury presentation

The [canonical 100-second final-v2 package](final-v2/README.md) supplies the player on [/judges/#walkthrough](https://tour-rescue.pages.dev/judges/#walkthrough). It replaces the earlier rejected mobile recording, which remains recoverable from Git history.

Only one MP4 source is tracked. The build verifies its SHA-256 and copies playback assets into ignored `dist/video/`; video is excluded from the PWA shell cache. This package does not upload a film to YouTube, submit to Devpost or establish a physical-device test.
