# Clawdio Asset Checklist and Target Structure

The provided raster mockup is a **reference**, not a finished vector logo. Claude Code must produce the production assets after inspecting the repository.

## Proposed structure (adapt to existing conventions)

```text
docs/
  design.md
  brand-guidelines.md                  # optional
assets/branding/
  reference/clawdio-approved-mockup.png
  source/
    clawdio-wordmark.svg
    clawdio-cat.svg
    clawdio-monogram.svg
  export/
    clawdio-wordmark-primary.svg
    clawdio-wordmark-light.svg
    clawdio-wordmark-mono.svg
    clawdio-icon-full.svg
    clawdio-icon-simple.svg
    clawdio-icon-mono.svg
    clawdio-icon-16.png
    clawdio-icon-32.png
    clawdio-icon-64.png
    clawdio-icon-128.png
    clawdio-icon-256.png
    clawdio-icon-512.png
    clawdio-icon-1024.png
    clawdio.ico
  social/
    clawdio-readme-banner.png
    clawdio-social-preview.png
```

## Production checklist
- [ ] Original wordmark SVG: red `Claw`, steel `dio`, equalizer bars in `o`
- [ ] Original red-eyed cat silhouette SVG, clear at 16 and 32 px
- [ ] Angular C/eye/audio-bar monogram SVG
- [ ] Full-color and monochrome variants for dark and light backgrounds
- [ ] All vector masters contain viewBox and no embedded raster images
- [ ] PNG icons: 16, 32, 64, 128, 256, 512 and 1024 px where packaging needs them
- [ ] Multi-resolution Windows ICO and Linux launcher icon
- [ ] README banner and social image only if helpful
- [ ] Application title, executable metadata, manifests and About view renamed Clawdio
- [ ] Icon works in Windows taskbar and Linux app launchers
- [ ] Fonts and illustration assets compatible with open-source redistribution
- [ ] Missing-artwork placeholder with quiet branding
- [ ] Logo legible at actual icon sizes
- [ ] Test light backgrounds and high contrast
- [ ] No copyrighted MAD / Inspector Gadget artwork reproduced

Only create assets the actual application and repository need. Do not add animated mascot or wallpapers solely for decoration.
