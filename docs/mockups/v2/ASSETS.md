# Production editorial assets

Created with the built-in ImageGen tool on 22 October 2026. Existing approved
boards were retained. Only missing standalone image assets were generated.
Optimized selected outputs are bundled under `web2/assets/`; they load offline.
These scenes are illustrations, not photographs of actual staff, a real artist,
supplier attendance, a completed repair or an event recording.

| Asset | Selected original | Use |
| --- | --- | --- |
| `touring-backstage-v2.webp` | `exec-d42122c2-1d53-4666-8f9a-1d932db0de2d.png` | Product hero |
| `touring-drum-v2.webp` | `exec-668df3e0-6aeb-4342-b417-7d9a6de7d474.png` | Local SOS editorial section |
| `touring-fan-v2.webp` | `exec-17955121-451e-4c27-a9a9-ce35c38e095c.png` | Fictional band's public fan preview |

Outputs were exported at 1200×800 as quality-85 WebP. No semantic changes were
made during format conversion. The first backstage image was rejected as too
polished; the selected edit follows Damian's request for ordinary, realistic
people working, rather than advertising extras. Raw generated originals remain
in the session's generated-images archive; only consumed assets enter Git.

## Final prompts

### Backstage: generation and selected edit

Initial prompt: “Use case: photorealistic-natural. Production website asset for
Tour Rescue, a calm touring manager app. Single landscape editorial photograph,
3:2. Blue-hour backstage loading yard of a small European concert venue. Dark
unbranded touring van parked to left, two crew members in practical dark clothes
calmly unloading a wheeled flight case near a warm amber open loading door to
right. Natural cinematic documentary photography, believable ordinary people,
authentic equipment and subtle wet asphalt reflections. Deep blue graphite
shadows, warm light, premium magazine realism, no panic, no celebrities, no logos,
no text, no UI or phone frames. Standalone photograph filling all edges. Must work
in a wide hero crop with main subjects visible around center.”

Selected edit, using that original as the edit target: “Edit this Tour Rescue
production photograph. The current result is much too glossy, staged and
cinematic-stock. Make it a believable candid tour diary photograph taken while
helping load gear, not an ad. Keep the working touring-van/loading-door/flightcase
subject and landscape crop. Remove the picturesque cathedral and postcard city
skyline entirely; plain cramped service yard behind an ordinary club, patched
concrete wall, utility pipes, taped loading notice with no legible text. Make the
van old with road grime, flight case scratched with old gaffer tape, equipment
partly obstructing foreground. Use muted low saturation and practical weak
sodium/fluorescent loading light, normal gray-blue dusk, no heroic orange/teal
grading, no dramatic sky, no glossy wet-road reflections. Two believable tired
crew in mismatched workwear pushing a wheeled case naturally, unposed, one
partially obscured by open van door. Slight documentary sensor grain and imperfect
available-light exposure. Realistic skin/hands, unobtrusive camera, no fashion
shoot, no branded logos, no readable text or UI.”

### Drum repair

“Use case: photorealistic-natural. Standalone landscape 3:2 editorial photograph
for Tour Rescue local equipment rescue section. Close view of a touring drum
technician replacing a bass drum head in a small venue backstage. Human hands
adjusting a chrome tension rod, convincing bass drum hardware and worn flight
case nearby, practical black clothes, face unnecessary. Warm amber worklight and
deep graphite blue background, candid realistic documentary photograph, premium
natural texture, calm competent work. No text, logos, UI, collage, or watermarks.”

### Band on stage

“Use case: photorealistic-natural. Standalone landscape 3:2 cinematic documentary
concert photograph for a fictional indie band's fan-interest page. Five musicians
seen from behind on stage in a small club, audience silhouettes beyond, warm
amber stage lights and deep graphite shadows. Ordinary working band, convincing
instruments, no identifiable celebrities. Strong wide composition, natural gritty
but polished editorial image, dark outer edges, no text, logos, UI or watermarks.”

## Typography

Variable Inter Latin/Latin Extended files came from the official Fontsource
package `@fontsource-variable/inter@5.2.8`. Their OFL-1.1 licence ships alongside
them in `web2/assets/fonts/OFL.txt`. No runtime Google Fonts request is needed.
