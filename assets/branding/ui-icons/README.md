# UI icon overrides

The app uses Lucide icons by default (requirements R31). A file in this folder replaces the icon with the same name. Rebuild the app to apply a change.

## Rules

- The file name is the icon name with `.svg`, for example `menu.svg`.
- The app draws the file as a CSS mask in the current text color. Only the shape counts. Fill colors in the file have no effect.
- Use a square `viewBox`. The icon shows at 16 px in most places.
- The file must pass `npm run check:svg`: a `viewBox`, no `<text>`, `<image>`, `<filter>`, `<foreignObject>` or `<script>` element and no http reference.
- A file with an unknown name is ignored.

## Icon names

The names come from `src/components/icons.tsx`:

| Name | Use |
|---|---|
| `close` | Close control in widget headers |
| `columns` | Columns Library mode |
| `grip` | Drag grip in widget headers |
| `heart` | Favorites |
| `menu` | Menu button |
| `next` | Next |
| `pause` | Pause |
| `play` | Play |
| `previous` | Previous |
| `repeat` | Repeat |
| `search` | Search field |
| `shuffle` | Shuffle |
| `stop` | Stop |
| `topBottom` | Top/bottom Library mode |
| `tree` | Tree Library mode |
| `volume` | Volume |

## Windows high contrast

Under forced colors, override icons paint in the system text color (`CanvasText`), so they stay visible.
