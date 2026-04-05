---
description: "Use when working on backend, Electron main-process, collector, database, automation service, native helper, polling, IPC, contracts, storage, or infrastructure code. Keeps non-UI work functional, minimal, and separate from UI design workflows."
name: "Non-UI Engineering Focus"
# ...existing code...
applyTo: "collector/**,native-helper/**,src/main/**,src/api.js,src/automation-contracts.js,src/automation-helper-client.js,src/automation-service.js,src/main.js,src/preload.js,src/profile-store.js"
# ...existing code...
---
# Non-UI Engineering Focus

- For non-UI code, prioritize behavior, correctness, maintainability, and narrow changes over presentation or visual experimentation.
- Do not load UI-only design skills just because the repository also contains frontend code.
- Keep backend, collector, IPC, database, native-helper, and service changes minimal and task-focused.
- If a task spans both UI and non-UI areas, use UI skill workflows only for the UI-facing files and keep non-UI implementation pragmatic.
- Prefer explicit contracts, predictable error handling, and small diffs over stylistic refactors unless the user requests broader cleanup.