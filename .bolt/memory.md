# Project memory

## Product intent & audience

- Payroll/settlement ("liquidación") calculation tool, likely for Colombian context given terminology.
- End users generate and download a settlement document with a company logo.
- Mobile usage is important; users expect share/save behavior on phones.

## Brand personality & voice

- Spanish-language UI and assistant responses.
- Practical, direct tone; user communicates briefly and reports issues plainly.

## Visual design & UX direction

- Settlement is rendered as an HTML block captured to image via `html2canvas` for download.
- Download button labeled "Descargar liquidación con logo".
- Mobile: prefer native Web Share API (`navigator.share` / `share` with files) when available; fall back to direct download.
- On failure, show on-screen error message instead of failing silently.
- Potential edge cases to watch: colors not captured and clipped/cropped sections in the exported image.

## Decisions, constraints & rationale

- Stack: Vite + React, Tailwind CSS, Lucide React icons; `@/` path alias for `src/`.
- `html2canvas` is an approved dependency for the download feature (needed despite default no-extra-packages rule).
- TypeScript type checking is run separately from build because the build does not check types.
- Prior bug: download button broke due to missing `html2canvas` import after an incomplete edit; keeping imports intact on edits is critical.

## Open questions & assumptions

- Download has not been verified on a real mobile device; awaiting user confirmation.
- Assumption: the settlement image export renders with correct colors and no cropping; may need `html2canvas` options tuning if reported.
- Assumption: Web Share API file sharing works on target mobile browsers; fallback download covers unsupported cases.