# Tour Rescue — publication receipt, 26 October 2026

Published with the owner's authorization on 26 October. This receipt records website, YouTube and Devpost deployment output, public browser QA, platform confirmation and anonymous readback.

| Item | Verified result |
| --- | --- |
| Source | [PR 36](https://github.com/Powers-P1/tour-rescue/pull/36) merged to main as `e1e39ef8b0fce253d1bb88a334243f8e311ccae4`; release source `2e57ab524f2f1699cb99af70b013d41ebf1d2447` has the same build tree |
| Production | [Canonical judges page](https://tour-rescue.pages.dev/judges/), deployment `6f3fd002-1023-4512-8e7c-7631d4e07c4a`; [immutable deployment](https://6f3fd002.tour-rescue.pages.dev/judges/) |
| YouTube | [Current final-v4 film](https://youtu.be/uwiPr3YNfNA): published confirmation and anonymous oEmbed HTTP 200 with the expected title/author |
| Devpost | [Tour Rescue](https://devpost.com/software/tour-rescue), submission `1259533`: video saved, SUBMITTED with 5/5 steps complete; public iframe contains `uwiPr3YNfNA` and excludes the old video |
| Previous YouTube film | `PT3Iysktgn0` saved as Private; fresh Studio state confirmed the saved setting and anonymous oEmbed returned 403. It was not permanently deleted |
| Worker | Existing version `2ff252ef-5810-4588-94a4-b1ffdbcdc10d`, unchanged at 100% traffic |

The current Devpost text also includes the new film link and the 398-test validation line. The landing page retains its normal judges links; no embedded video was added there. The [final-v2 source package](../demo/final-v2/README.md) and its hashes remain unchanged as an archive and rollback source.

## Media identity and platform checks

| Destination | Uploaded/served source | Identity |
| --- | --- | --- |
| Website | Clean H.264/AAC derivative, 23,144,942 bytes | SHA-256 `c9c6a5b8f3a25fc6d25093026567e57ec7cfe4e9fffe3f9da7b701a196c10d4f` |
| YouTube | Higher-bitrate clean master, 40,067,802 bytes | Upload-source SHA-256 `ffb7e749b14434b7682aa70c90a6f78a5f1bb37d6772c52ed0b826cda97be2c1` |

Both source files are 120 seconds at 1920×1080/60 fps. YouTube's UI shows 2:01; no frame-exact duration or hash is asserted for YouTube's transcoded streams. The website uses the default 39-cue English VTT with clean picture. YouTube accepted the separately prepared 39-cue English SRT as English (United States), and the final-v4 thumbnail was uploaded. Studio showed the manual English (US) captions as published on 26 October, separately from automatic English captions. A public-browser check selected the manual track in the player's settings and verified the visible cue “The crew needs a plan.” at 15 seconds, with 1080p60 HD selected. The publishing UI confirmed the published-success state, AI-content disclosure enabled, not made for kids, and no paid promotion. YouTube reported no copyright-check issues during upload; that platform result is not a rights certificate. Original account and rights records remain with the owner.

## Validation

- [Core, Worker and Pages CI](https://github.com/Powers-P1/tour-rescue/actions/runs/40247780605): strict TypeScript, **398/398 offline tests**, local/Pages builds and Worker dry build passed.
- [Complete visual CI](https://github.com/Powers-P1/tour-rescue/actions/runs/40247780568): all workflows passed. The real-film regression checks cancellation/error retry, native playback, 39 default cues, decoded frames at 3.2/35/87/116 seconds, download identity and transcript → Back → explicit reload at 390×844 and 1440×1000.
- The CI decoder comparison confirmed bundled Linux Chromium 141 lacks the film's H.264/AAC codecs (`DEMUXER_ERROR_NO_SUPPORTED_STREAMS`). Only the media regression uses installed Chrome 155; other UI checks retain bundled Chromium. Actual decoding and seeking assertions remain mandatory.
- Canonical public-production QA at 390×844 and 1440×1000 passed on 26 October: exact film hash/bytes, 120-second source playback, native play/pause, 39 showing English cues, seeks at 3.2/35/87/116 seconds, transcript/VTT/SRT/MP4 links and the 350 → 354.1 km recommendation reversal. There were no page errors or provider requests.
- The encoded derivative passed a full FFmpeg decode and sampled Qloo/SOS/closing-frame inspection. The earlier failed direct-URL preview and local Range-server result remain explicitly historical in [package QA](../demo/final-v4/QA.json).

The film retains separate labels for recorded real Qloo, the synthetic sensitivity experiment, authored AI replay and SOS supplier simulation. No real supplier was contacted, ordered or paid. Agency subscriptions and completed-service fees remain a business hypothesis requiring vetted local partners. Physical phone installation and camera QR validation are not claimed.
