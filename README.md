# Grooveboard Web

Web editor + 3D viewer for **Grooveboard** — *design & 3D-print your own PWB
(Printed Wired Board). Like a PCB, but solderless.*

Design a board in the browser, preview it in 3D, download print-ready STLs.
Talks to the **grooveboard-api** backend (separate repo).

## Stack
- React + Vite
- three.js (`@react-three/fiber` + `drei`) for the 3D viewer

## Dev
```bash
npm install
echo "VITE_API=http://localhost:8000" > .env.local   # your running API
npm run dev
```

## Roadmap
- v0 — load/paste spec → 3D preview → download STLs  ✅
- v1 — visual editor: drag components, click pins to connect, live 3D
- v2 — accounts, save/share boards, AI "describe your circuit → spec"

## License
MIT.
