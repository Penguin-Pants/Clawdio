# Claude Code: Implement Clawdio Branding

## Mission
Apply the approved Clawdio visual identity to this existing minimalist cross-platform local music player. Use:
- `docs/design.md`
- `docs/asset-manifest.md`
- `theme/tokens.json`
- `assets/reference/clawdio-approved-mockup.png`

If inputs are inside `clawdio-brand-package/`, locate and read them there. Follow `AGENTS.md` and the existing repository's structure. **Read the whole relevant requirements document before implementation.**

## Phase 1: Repo and stack audit
1. Inspect README, product requirements, AGENTS.md, source, UI, manifests, build scripts, icon pipeline, documentation and tests.
2. Identify framework, desktop wrapper, native OS integration, styling solution, current brand files and all old product names.
3. Map the package paths into the existing repo without unnecessary duplication.
4. Inspect whether the UI is React/Tailwind compatible. MagicUI is a React/Tailwind component library. It is not a generic native desktop toolkit. Tauri/Electron may support it when the frontend is compatible, but do not replace a native or other framework solely to add MagicUI.
5. Consult current official MagicUI docs before using components: https://magicui.design/docs/installation and https://magicui.design/docs/components
6. Identify implementation risks and choose the smallest safe design change set. Proceed autonomously unless a destructive action, licensing issue or architecture migration needs a decision.

## Phase 2: Brand assets
1. Create original SVG wordmark with red `Claw`, silver/steel `dio` and audio bars inside the `o`.
2. Create an original black cat-head mark with narrow red eyes, recognizable ears and minimal whisker details. Use the supplied mockup as direction, not bitmap source.
3. Create original angular C + cat-eye + equalizer secondary mark.
4. Export necessary full-color, monochrome, PNG and Windows/Linux launcher icons. Check actual supported formats in the packaging toolchain. Test at small sizes.
5. Avoid direct copies of Inspector Gadget/MAD character art or emblems. Prefer flat SVG to complex filters or embedded raster data.

## Phase 3: Theme and UI
1. Map `theme/tokens.json` to existing styling system with semantic tokens. Avoid scattered hex literals.
2. Rename the product consistently throughout UI, package metadata, READMEs and launchers. Do not rename unrelated dependencies.
3. Implement dark matte UI with restrained red active states, muted surfaces and legible typography.
4. Apply styling to the existing shell, library and album views, now-playing area, controls, dialogs and supported lyrics/artwork views.
5. Preserve navigation, keyboard access, clear focus, contrast, window resizing and reduced-motion behavior.
6. If compatible, use a **minimal subset** of MagicUI components only where they improve usability or a special brand surface. Prefer plain transitions for most interactions.
7. Do not treat promotional fortress artwork, fictional song metadata or reference-only menu entries as product requirements.
8. Do not add streaming, radio, podcasts, accounts or other new features.
9. Preserve working library parsing, playback, queues, lyrics, metadata, settings and portable offline operation.

## Phase 4: Validation
1. Run existing formatting, lint, typecheck, tests and supported builds.
2. Verify SVG syntax, exports, correct icon dimensions and app metadata.
3. Test or inspect normal and narrow desktop windows. Check contrast, clear state and small-icon legibility.
4. Do a two-pass critical self-review: identify risks, then challenge findings and fix only confirmed problems.
5. Validate Windows and Linux artifacts where current environment permits. Report platform checks you could not perform.
6. Update design.md only to reflect justified implementation-specific differences.

## Final deliverable
Provide concise:
- Summary of actual changes with paths
- Assets and export sizes delivered
- MagicUI components added (or reason none were suitable)
- Tests/builds run and results
- Known limitations and unverified platform checks
- Any deviations from approved reference and why

## Constraints
Do not rewrite the music-player architecture for branding. Do not claim tests you did not run. Respect AGENTS.md. Do not make unnecessary libraries, animations or features. Do not commit or open PRs unless repository workflow requires it.
