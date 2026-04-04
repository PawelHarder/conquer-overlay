# Native Helper

This directory will contain the separate Windows automation helper used by the Electron app.

Planned first milestone:
- stdio-framed JSON protocol handshake
- target window lookup
- foreground-window detection
- one-shot left/right/F7 actions
- Shift/Ctrl hold-release actions
- guaranteed modifier release on shutdown

Expected packaged output path:
- `native-helper/conquer-helper.exe`

During the current scaffolding phase, the Electron app treats the helper as optional and reports a missing-helper status until the executable exists.
