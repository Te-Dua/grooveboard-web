import React, { useRef, useState, useEffect } from 'react'
import { useTheme } from './theme.jsx'

const API = import.meta.env.VITE_API || 'http://localhost:8000'

// Visual board editor (SVG, top-down). Place components, drag pin->pin to
// connect, click a pin to toggle it as a junction (break-out). Emits the
// Grooveboard spec via onSpecChange.
//
// Coordinate model: editor works in mm, same as the engine. SVG is scaled by
// SCALE px/mm and centered. Component origin = its center.

const DEFAULT_SCALE = 4  // px per mm
const PITCH = 2.54       // pin pitch (mm)
const PIN_R = 3          // pin dot radius (px)

function pinPositions(comp) {
  // returns [{name, key, side, x, y}] in mm relative to component center.
  // `name` = display label (may repeat, e.g. two "GND"); `key` = unique id
  // within the component (duplicates get _2, _3 ...), matching the engine's
  // dedupe so routing/junctions/connections address each pin independently.
  const out = []
  const off = (comp.row_gap || 14) / 2
  const seen = {}
  const uniq = (nm) => {
    seen[nm] = (seen[nm] || 0) + 1
    return seen[nm] === 1 ? nm : `${nm}_${seen[nm]}`
  }
  comp.rows.forEach((row) => {
    const n = row.pins.length
    const span = (n - 1) * PITCH
    row.pins.forEach((nm, i) => {
      const key = uniq(nm)
      if (row.side === 'left' || row.side === 'right') {
        const px = row.side === 'left' ? -off : off
        // index 0 = TOP pin (reads top->bottom like the silkscreen)
        out.push({ name: nm, key, side: row.side, x: px, y: span / 2 - i * PITCH })
      } else {
        const py = row.side === 'bottom' ? -off : off
        out.push({ name: nm, key, side: row.side, x: -span / 2 + i * PITCH, y: py })
      }
    })
  })
  return out
}

export default function BoardEditor({ library, placed, setPlaced,
                                      connections, setConnections,
                                      junctions, setJunctions,
                                      highways, setHighways,
                                      boardSize, setBoardSize, name,
                                      selected, setSelected, settings,
                                      addingHoles, setAddingHoles,
                                      extraNubs, setExtraNubs,
                                      addingNubs, setAddingNubs,
                                      layout: layoutProp, setLayout: setLayoutProp }) {
  const t = useTheme()
  const svgRef = useRef(null)
  const [drag, setDrag] = useState(null)       // dragging a component
  const [hwDrag, setHwDrag] = useState(null)   // dragging a highway (index)
  const [edgeDrag, setEdgeDrag] = useState(null)  // dragging a board edge: 'L'|'R'|'T'|'B'
  const [wire, setWire] = useState(null)       // {from:{comp,pin,x,y}, to:{x,y}}
  const [hoverPin, setHoverPin] = useState(null)  // {x,y,label} currently-hovered pin
  const [hoverStreet, setHoverStreet] = useState(null)  // {comp,pin,previewPos} hover state
  // layout may be lifted to the parent (shared with the props panel); fall back
  // to local state if the props aren't supplied.
  const [layoutLocal, setLayoutLocal] = useState(null)
  const layout = layoutProp !== undefined ? layoutProp : layoutLocal
  const setLayout = setLayoutProp || setLayoutLocal
  const [SCALE, setScale] = useState(DEFAULT_SCALE)   // px per mm (zoom)
  const [viewW, viewH] = [760, 560]

  // Fit: scale so the whole board (from layout) fills the canvas with padding.
  function fitView() {
    const bl = layout?.board?.length || 60, bw = layout?.board?.width || 50
    const pad = 30
    const s = Math.min((viewW - pad) / bl, (viewH - pad) / bw)
    setScale(Math.max(1, Math.min(s, 12)))
  }

  // Live road layout: debounced /layout call whenever the board changes, so the
  // editor shows the ACTUAL streets/town-roads/highway that will be printed.
  useEffect(() => {
    if (!placed.length) { setLayout(null); return }
    const t = setTimeout(() => {
      const spec = buildSpec(name, placed, connections, junctions, highways, boardSize, settings, extraNubs)
      fetch(`${API}/layout`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spec),
      }).then(r => r.ok ? r.json() : null)
        .then(setLayout).catch(() => {})
    }, 300)
    return () => clearTimeout(t)
  }, [placed, connections, junctions, highways, boardSize, name, settings, extraNubs])

  const toMM = (clientX, clientY) => {
    const r = svgRef.current.getBoundingClientRect()
    return {
      x: (clientX - r.left - viewW / 2) / SCALE,
      y: -(clientY - r.top - viewH / 2) / SCALE,   // y up
    }
  }

  // add a component from the palette at center-ish
  function addComponent(libComp) {
    const id = libComp.id + '_' + (placed.filter(p => p.lib === libComp.id).length + 1)
    setPlaced([...placed, {
      id, lib: libComp.id, name: libComp.name,
      footprint: libComp.footprint, rows: libComp.rows, row_gap: libComp.row_gap,
      x: (placed.length % 2 === 0 ? -20 : 20), y: 0,
    }])
  }

  function pinWorld(comp, pin) {
    return { x: comp.x + pin.x, y: comp.y + pin.y }
  }

  // ---- mouse handlers ----
  function onPinDown(e, comp, pin) {
    e.stopPropagation()
    const w = pinWorld(comp, pin)
    setWire({ from: { comp: comp.id, pin: pin.key, ...w }, to: w })
  }
  function onMove(e) {
    if (drag) {
      const m = toMM(e.clientX, e.clientY)
      setPlaced(placed.map(p => p.id === drag.id
        ? { ...p, x: m.x - drag.dx, y: m.y - drag.dy } : p))
    } else if (hwDrag !== null) {
      const m = toMM(e.clientX, e.clientY)
      setHighways(highways.map((h, i) => i === hwDrag ? { y: m.y } : h))
    } else if (edgeDrag) {
      // FREE board rectangle: drag one edge to where the cursor is; the OTHER
      // three edges stay put. Nothing in the content moves. We just recompute
      // the board's size + center from the four edges. The board may end up
      // off-center or smaller than the content (that's allowed; Preview will
      // error until it fits).
      const m = toMM(e.clientX, e.clientY)
      const b = boardRect()                    // {x0,x1,y0,y1} current edges
      if (edgeDrag === 'L') b.x0 = Math.min(m.x, b.x1 - 10)
      if (edgeDrag === 'R') b.x1 = Math.max(m.x, b.x0 + 10)
      if (edgeDrag === 'B') b.y0 = Math.min(m.y, b.y1 - 10)
      if (edgeDrag === 'T') b.y1 = Math.max(m.y, b.y0 + 10)
      setBoardSize({
        length: +(b.x1 - b.x0).toFixed(1),
        width: +(b.y1 - b.y0).toFixed(1),
        cx: +((b.x0 + b.x1) / 2).toFixed(2),
        cy: +((b.y0 + b.y1) / 2).toFixed(2),
      })
    } else if (wire) {
      setWire({ ...wire, to: toMM(e.clientX, e.clientY) })
    }
  }
  function addHighwayAt(y) {
    setHighways([...highways, { y: Math.round(y) }])
  }
  // nearest point on a line segment to (px,py) — used to snap a click onto the
  // road it was aimed at, so the nub actually sits centered in the groove.
  function nearestOnSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1
    const len2 = dx * dx + dy * dy
    const t = len2 < 1e-6 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2))
    return { x: x1 + t * dx, y: y1 + t * dy }
  }
  function addNubNear(mm) {
    if (!layout) return
    const segs = [...layout.highway, ...layout.towns, ...layout.streets, ...layout.connectors]
    let best = null, bestD = Infinity
    for (const r of segs) {
      const p = nearestOnSeg(mm.x, mm.y, r.a[0], r.a[1], r.b[0], r.b[1])
      const d = Math.hypot(p.x - mm.x, p.y - mm.y)
      if (d < bestD) { bestD = d; best = p }
    }
    if (best && bestD < 10) setExtraNubs([...extraNubs, { x: best.x, y: best.y }])
  }
  function removeNubNear(mm) {
    if (!extraNubs.length) return
    let bi = -1, bd = Infinity
    extraNubs.forEach((n, i) => {
      const d = Math.hypot(n.x - mm.x, n.y - mm.y)
      if (d < bd) { bd = d; bi = i }
    })
    if (bi >= 0 && bd < 4) setExtraNubs(extraNubs.filter((_, i) => i !== bi))
  }
  // current board rectangle edges (world mm). Prefer the locked boardSize for
  // instant feedback; fall back to the live layout; else a default.
  function boardRect() {
    const L = boardSize?.length || layout?.board?.length || 60
    const W = boardSize?.width || layout?.board?.width || 50
    const cx = boardSize?.cx ?? layout?.board?.cx ?? 0
    const cy = boardSize?.cy ?? layout?.board?.cy ?? 0
    return { x0: cx - L / 2, x1: cx + L / 2, y0: cy - W / 2, y1: cy + W / 2 }
  }
  function onUp(e, comp, pin) {
    if (wire && comp && pin && comp.id !== wire.from.comp) {
      // complete a connection (use the unique pin key, not the display name)
      const to = `${comp.id}.${pin.key}`
      const from = `${wire.from.comp}.${wire.from.pin}`
      if (!connections.some(c => (c.from === from && c.to === to) ||
                                 (c.from === to && c.to === from))) {
        setConnections([...connections, { from, to }])
      }
    }
    setWire(null); setDrag(null); setHwDrag(null); setEdgeDrag(null)
  }

  // junctions stored as a map { "comp.pin": count }. Double-click toggles 0<->1.
  const jcount = (key) => (junctions && junctions[key]) || 0
  function setJunctionCount(key, n) {
    const next = { ...(junctions || {}) }
    if (n > 0) next[key] = n; else delete next[key]
    setJunctions(next)
  }
  function toggleJunction(comp, pin) {
    const key = `${comp.id}.${pin.key}`
    setJunctionCount(key, jcount(key) > 0 ? 0 : 1)
  }
  const MAX_HOLES = 4
  // add/remove a hole on a pin's street (used by click-mode on a street)
  function addHoleToPin(comp, pin) {
    const key = `${comp.id}.${pin.key}`
    const cur = jcount(key)
    if (cur >= MAX_HOLES) return
    setJunctionCount(key, cur + 1)
  }
  function removeHoleFromPin(comp, pin) {
    const key = `${comp.id}.${pin.key}`
    const cur = jcount(key)
    if (cur > 0) setJunctionCount(key, cur - 1)
  }

  // SVG transform: mm -> px, centered, y-up
  const X = (mm) => viewW / 2 + mm * SCALE
  const Y = (mm) => viewH / 2 - mm * SCALE

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* palette */}
      <div style={{ width: 150, flex: '0 0 150px', minWidth: 0, borderRight: `1px solid ${t.border}`, padding: 8, overflowY: 'auto', overflowX: 'hidden', boxSizing: 'border-box', background: t.panelBg, color: t.text }}>
        <b style={{ fontSize: 12 }}>Components</b>
        {library.map(c => (
          <div key={c.id} onClick={() => addComponent(c)}
            style={{ padding: '6px 8px', margin: '4px 0', fontSize: 12, cursor: 'pointer',
                     border: `1px solid ${t.borderStrong}`, borderRadius: 5, background: t.cardBg,
                     boxSizing: 'border-box', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
            {c.name || c.id}
            <div style={{ fontSize: 10, color: t.textFainter }}>
              {c.footprint?.length}×{c.footprint?.width}mm · {c.rows?.reduce((a, r) => a + r.pins.length, 0)} pins
            </div>
          </div>
        ))}
        <button onClick={() => addHighwayAt(0)}
          style={{ width: '100%', marginTop: 10, padding: '6px', fontSize: 12, cursor: 'pointer',
                   border: `1px solid ${t.highwayHandle}`, borderRadius: 5, background: t.accentBg, color: t.highwayText }}>
          + Add Highway
        </button>

        {/* zoom */}
        <div style={{ marginTop: 12, fontSize: 11, color: t.textMuted }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <b>Zoom</b><span>{SCALE.toFixed(1)}×</span>
          </div>
          <input type="range" min="1" max="12" step="0.5" value={SCALE}
            onChange={e => setScale(parseFloat(e.target.value))} style={{ width: '100%' }} />
          <button onClick={fitView}
            style={{ width: '100%', padding: '4px', fontSize: 12, cursor: 'pointer',
                     border: `1px solid ${t.roadBlue}`, borderRadius: 5, background: t.accentBg, color: t.accentText }}>
            Fit to board
          </button>
          {layout?.board && <div style={{ color: t.textFainter, marginTop: 4 }}>
            board: {Math.round(layout.board.length)}×{Math.round(layout.board.width)}mm
            {boardSize ? ' (locked)' : ' (auto)'}
          </div>}
        </div>

        {/* board size: drag edges to resize (locks), or auto-fit to contents */}
        <div style={{ marginTop: 12, fontSize: 11, color: t.textMuted }}>
          <b>Board size</b>
          <div style={{ color: t.textFaint, margin: '3px 0 5px' }}>
            Drag the dashed board edges to resize/move it.
          </div>
          {layout?.fits === false && (
            <div style={{ color: t.boardEdgeError, margin: '3px 0 6px', fontWeight: 600 }}>
              ⚠ {layout.fit_error || 'parts outside board — enlarge to print'}
            </div>
          )}
          <button onClick={() => setBoardSize(null)} disabled={!boardSize}
            style={{ width: '100%', padding: '4px', fontSize: 12,
                     cursor: boardSize ? 'pointer' : 'default',
                     border: '1px solid ' + (boardSize ? t.boardEdgeLocked : t.border), borderRadius: 5,
                     background: boardSize ? t.accentBg : t.cardBg,
                     color: boardSize ? t.boardEdgeLocked : t.hint }}>
            Auto-fit (unlock size)
          </button>
        </div>

        <div style={{ fontSize: 10, color: t.textFaint, marginTop: 10 }}>
          Click a component to add. Drag a pin→pin to connect. Double-click a pin = junction.
          Highways: drag the orange lines to move; double-click one to delete; double-click empty board to add.
          Drag the purple board edges to resize; Auto-fit unlocks it.
        </div>
      </div>

      {/* SVG canvas */}
      <svg ref={svgRef} width={viewW} height={viewH}
        style={{ background: t.canvasBg, flex: 'none', cursor: addingNubs ? 'copy' : undefined }}
        onMouseMove={onMove} onMouseUp={() => onUp(null)}
        onClick={(e) => { if (addingNubs) addNubNear(toMM(e.clientX, e.clientY)) }}
        onContextMenu={(e) => { if (addingNubs) { e.preventDefault(); removeNubNear(toMM(e.clientX, e.clientY)) } }}
        onDoubleClick={(e) => {
          // double-click empty board space adds a highway at that Y
          if (!addingNubs && e.target === svgRef.current) addHighwayAt(toMM(e.clientX, e.clientY).y)
        }}
        onMouseLeave={() => { setWire(null); setDrag(null); setHwDrag(null); setEdgeDrag(null) }}>
        {/* grid */}
        {Array.from({ length: Math.ceil(viewW / (PITCH * SCALE)) }).map((_, i) => (
          <line key={'v' + i} x1={i * PITCH * SCALE} y1={0} x2={i * PITCH * SCALE} y2={viewH}
            stroke={t.borderSoft} strokeWidth="1" />
        ))}

        {/* ROADS (live from the API) — the actual grooves that get printed.
            Drawn behind components. highway=orange, town=blue, street=green. */}
        {layout && <g opacity="0.45">
          {layout.highway.map((r, i) => (
            <line key={'h' + i} x1={X(r.a[0])} y1={Y(r.a[1])} x2={X(r.b[0])} y2={Y(r.b[1])}
              stroke={t.roadOrange} strokeWidth={(r.w || layout.widths.highway) * SCALE} strokeLinecap="round" />
          ))}
          {/* exit-door markers: a red tick at each highway/board-edge crossing,
              shown only when exit doors are enabled. Lets you confirm the toggle
              without opening the 3D view. */}
          {settings?.exit_doors !== false && layout.highway.map((r, i) => {
            const w = (r.w || layout.widths.highway) * SCALE
            return [r.a, r.b].map((pt, k) => (
              <rect key={'d' + i + '_' + k} x={X(pt[0]) - 3} y={Y(pt[1]) - w / 2}
                width={6} height={w} fill={t.boardEdgeError} opacity="0.8" rx="1">
                <title>exit door (wire out-gate)</title>
              </rect>
            ))
          })}
          {layout.connectors.map((r, i) => (
            <line key={'c' + i} x1={X(r.a[0])} y1={Y(r.a[1])} x2={X(r.b[0])} y2={Y(r.b[1])}
              stroke={t.roadOrange} strokeWidth={(r.w || layout.widths.town) * SCALE} strokeLinecap="round" />
          ))}
          {layout.towns.map((r, i) => (
            <line key={'t' + i} x1={X(r.a[0])} y1={Y(r.a[1])} x2={X(r.b[0])} y2={Y(r.b[1])}
              stroke={t.roadBlue} strokeWidth={(r.w || layout.widths.town) * SCALE} strokeLinecap="round" />
          ))}
          {layout.streets.map((r, i) => (
            <line key={'s' + i} x1={X(r.a[0])} y1={Y(r.a[1])} x2={X(r.b[0])} y2={Y(r.b[1])}
              stroke={t.roadGreen} strokeWidth={r.w * SCALE} strokeLinecap="round" />
          ))}
          {/* junction break-out holes */}
          {layout.holes.map((h, i) => (
            <circle key={'jh' + i} cx={X(h.x)} cy={Y(h.y)} r={PIN_R} fill={t.roadYellow} stroke={t.roadYellowBorder} />
          ))}
        </g>}

        {/* ADD-NUB CLICK MODE: highlight every road so it's clear clicks will
            snap onto them, and render manual retention nubs already placed. */}
        {addingNubs && layout && <g opacity="0.3" pointerEvents="none">
          {[...layout.highway, ...layout.towns, ...layout.streets, ...layout.connectors].map((r, i) => (
            <line key={'nubhl' + i} x1={X(r.a[0])} y1={Y(r.a[1])} x2={X(r.b[0])} y2={Y(r.b[1])}
              stroke={t.junctionMagenta} strokeWidth={(r.w || 4) * SCALE} strokeLinecap="round" />
          ))}
        </g>}
        {extraNubs.map((n, i) => (
          <circle key={'nub' + i} cx={X(n.x)} cy={Y(n.y)} r={4}
            fill={t.junctionMagenta} fillOpacity="0.5" stroke="#a0098c" strokeWidth="1.5"
            style={{ cursor: addingNubs ? 'not-allowed' : 'default' }}>
            <title>retention nub ({n.x.toFixed(1)}, {n.y.toFixed(1)}) — right-click in nub mode to remove</title>
          </circle>
        ))}

        {/* ADD-HOLE CLICK MODE: when active for a component, overlay its streets
            as highlighted clickable strips. Hover shows a preview hole dot at the
            next slot; left-click adds, right-click removes. */}
        {addingHoles && layout && (() => {
          const comp = placed.find(p => p.id === addingHoles)
          if (!comp) return null
          const PITCH_MM = 2.54
          return pinPositions(comp).map((pin) => {
            const key = `${comp.id}.${pin.key}`
            const n = jcount(key)
            const w = pinWorld(comp, pin)
            // street runs from pin outward (away from component center). Direction:
            const vert = pin.side === 'left' || pin.side === 'right'
            const dir = pin.side === 'left' ? -1 : pin.side === 'right' ? 1
              : pin.side === 'bottom' ? -1 : 1
            // existing holes sit at pin + k*PITCH outward; preview = next slot
            const nextK = n + 1
            const previewMM = vert
              ? { x: w.x + dir * nextK * PITCH_MM, y: w.y }
              : { x: w.x, y: w.y + dir * nextK * PITCH_MM }
            // clickable strip from pin outward ~ street length (covers holes + gap)
            const stripLen = (nextK * PITCH_MM + 8)
            const endMM = vert
              ? { x: w.x + dir * stripLen, y: w.y }
              : { x: w.x, y: w.y + dir * stripLen }
            const isHover = hoverStreet && hoverStreet.key === key
            return (
              <g key={'addhole_' + key}>
                {/* highlighted street strip (clickable) — vivid magenta, unique vs
                    green streets / blue towns / orange highways */}
                <line x1={X(w.x)} y1={Y(w.y)} x2={X(endMM.x)} y2={Y(endMM.y)}
                  stroke={isHover ? t.junctionMagenta : t.junctionMagentaSoft} strokeWidth={PITCH * SCALE * 0.95}
                  strokeLinecap="round" opacity={isHover ? 0.85 : 0.5}
                  style={{ cursor: n >= MAX_HOLES ? 'not-allowed' : 'copy' }}
                  onMouseEnter={() => setHoverStreet({ key, x: previewMM.x, y: previewMM.y, full: n >= MAX_HOLES })}
                  onMouseLeave={() => setHoverStreet(h => (h && h.key === key) ? null : h)}
                  onClick={(e) => { e.stopPropagation(); if (n < MAX_HOLES) addHoleToPin(comp, pin) }}
                  onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); removeHoleFromPin(comp, pin) }} />
                {/* preview dot at next slot (only if not full) */}
                {isHover && !hoverStreet.full && (
                  <circle cx={X(previewMM.x)} cy={Y(previewMM.y)} r={PIN_R + 1}
                    fill={t.junctionMagenta} fillOpacity="0.3" stroke={t.junctionMagenta} strokeWidth="2.5"
                    strokeDasharray="3 2" pointerEvents="none" />
                )}
              </g>
            )
          })
        })()}

        {/* DRAGGABLE BOARD EDGES — grab an edge to resize the physical board.
            Dashed purple outline; each edge is a thick invisible drag handle.
            Resizing locks the size (clamped to minimum by the engine). */}
        {layout && (() => {
          // the board rectangle in world mm (off-center aware). Instant from
          // boardSize while dragging; otherwise the live layout.
          const r = boardRect()
          const ex0 = X(r.x0), ex1 = X(r.x1), ey0 = Y(r.y1), ey1 = Y(r.y0)
          const tooSmall = layout.fits === false   // content outside the board
          const col = tooSmall ? t.boardEdgeError : (boardSize ? t.boardEdgeLocked : t.boardEdge)
          const edge = (key, x1, y1, x2, y2, cursor) => (
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth="14"
              style={{ cursor }} onMouseDown={(e) => { e.stopPropagation(); setEdgeDrag(key) }} />
          )
          return <g>
            <rect x={ex0} y={ey0} width={(r.x1 - r.x0) * SCALE} height={(r.y1 - r.y0) * SCALE}
              fill="none" stroke={col} strokeWidth={tooSmall ? 2 : 1.5}
              strokeDasharray="6 4" pointerEvents="none" />
            {edge('L', ex0, ey0, ex0, ey1, 'ew-resize')}
            {edge('R', ex1, ey0, ex1, ey1, 'ew-resize')}
            {edge('T', ex0, ey0, ex1, ey0, 'ns-resize')}
            {edge('B', ex0, ey1, ex1, ey1, 'ns-resize')}
            <text x={ex0 + 4} y={ey0 - 5} fontSize="10" fill={col} pointerEvents="none">
              board {Math.round(r.x1 - r.x0)}×{Math.round(r.y1 - r.y0)}mm
              {tooSmall ? '  ⚠ parts outside board — enlarge to print'
                        : (boardSize ? '  (locked — drag edges)' : '  (auto)')}
            </text>
          </g>
        })()}

        {/* USER HIGHWAY HANDLES: draggable horizontal lines. Drag to move,
            double-click to delete. The actual printed highway (orange above)
            follows these via the spec. */}
        {highways.map((h, i) => (
          <g key={'hw' + i}>
            {/* wide invisible hit-area for easy grabbing */}
            <line x1={0} y1={Y(h.y)} x2={viewW} y2={Y(h.y)}
              stroke="transparent" strokeWidth="16" style={{ cursor: 'ns-resize' }}
              onMouseDown={(e) => { e.stopPropagation(); setHwDrag(i); setSelected?.({ type: 'highway', index: i }) }}
              onDoubleClick={(e) => { e.stopPropagation(); setHighways(highways.filter((_, j) => j !== i)) }} />
            <line x1={0} y1={Y(h.y)} x2={viewW} y2={Y(h.y)}
              stroke={selected?.type === 'highway' && selected.index === i ? t.highwayHandleActive : t.highwayHandle}
              strokeWidth={selected?.type === 'highway' && selected.index === i ? 4 : 2.5}
              strokeDasharray="10 5" pointerEvents="none" />
            <text x={6} y={Y(h.y) - 5} fontSize="10" fill={t.highwayText} pointerEvents="none">
              highway (drag · double-click to delete)
            </text>
          </g>
        ))}

        {/* components (drawn over roads; connection lines render on top).
            The box is sized to the PIN bounding rectangle (not the footprint)
            so it never covers the streets emerging from the pin rows. */}
        {placed.map(comp => {
          const pins = pinPositions(comp)
          const xs = pins.map(p => p.x), ys = pins.map(p => p.y)
          // Box = pin rectangle, kept THIN in the street-exit direction so it
          // never covers the streets. A single-row component only grows a small
          // THICKNESS toward the component center (opposite the street), never
          // in the street direction.
          const sides = new Set(comp.rows.map(r => r.side))
          const vertical = sides.has('left') || sides.has('right')   // pins run along Y
          const THICK = 2.5   // mm of box thickness behind the pin row
          let bx0 = Math.min(...xs), bx1 = Math.max(...xs)
          let by0 = Math.min(...ys), by1 = Math.max(...ys)
          if (vertical && (bx1 - bx0) < 0.1) {
            // single vertical row: pins at one x; box = thin strip toward center
            const px = bx0
            if (px <= 0) { bx0 = px; bx1 = px + THICK } else { bx0 = px - THICK; bx1 = px }
          } else if (!vertical && (by1 - by0) < 0.1) {
            const py = by0
            if (py <= 0) { by0 = py; by1 = py + THICK } else { by0 = py - THICK; by1 = py }
          }
          const w = (bx1 - bx0) * SCALE, h = (by1 - by0) * SCALE
          const cx = (bx0 + bx1) / 2 + comp.x, cy = (by0 + by1) / 2 + comp.y
          return (
            <g key={comp.id}>
              <rect x={X(cx) - w / 2} y={Y(cy) - h / 2} width={w} height={h}
                rx="3" fill={selected?.type === 'component' && selected.id === comp.id ? t.accentBg : t.cardBg}
                stroke={selected?.type === 'component' && selected.id === comp.id ? t.accent : t.textFaint}
                strokeWidth={selected?.type === 'component' && selected.id === comp.id ? 2.5 : 1.5}
                style={{ cursor: 'move' }}
                onMouseDown={(e) => {
                  const m = toMM(e.clientX, e.clientY)
                  setDrag({ id: comp.id, dx: m.x - comp.x, dy: m.y - comp.y })
                  setSelected?.({ type: 'component', id: comp.id })
                }} />
              <text x={X(cx)} y={Y(cy) - h / 2 - 4} textAnchor="middle"
                fontSize="11" fontWeight="bold" fill={t.textMuted}>{comp.id}</text>
              {pinPositions(comp).map((pin) => {
                const w2 = pinWorld(comp, pin)
                const n = jcount(`${comp.id}.${pin.key}`)
                const isJ = n > 0
                // show a label inline when pins are far enough apart (zoom); else
                // it only appears on hover. Label sits toward the component center
                // (over the box), never over the street.
                const roomy = PITCH * SCALE >= 13
                const inward = pin.side === 'left' ? 1 : pin.side === 'right' ? -1
                  : pin.side === 'bottom' ? 1 : -1
                const vert = pin.side === 'left' || pin.side === 'right'
                const lx = vert ? X(w2.x) + inward * (PIN_R + 2) : X(w2.x)
                const ly = vert ? Y(w2.y) : Y(w2.y) - inward * (PIN_R + 2)
                return (
                  <g key={pin.key}>
                    <circle cx={X(w2.x)} cy={Y(w2.y)} r={PIN_R}
                      fill={isJ ? t.roadYellow : t.panelBg} stroke={isJ ? t.roadYellowBorder : t.text} strokeWidth="1.5"
                      style={{ cursor: 'crosshair' }}
                      onMouseDown={(e) => onPinDown(e, comp, pin)}
                      onMouseUp={(e) => { e.stopPropagation(); onUp(e, comp, pin) }}
                      onMouseEnter={() => setHoverPin({ x: X(w2.x), y: Y(w2.y), label: pin.name, cid: comp.id, n })}
                      onMouseLeave={() => setHoverPin(h => (h && h.label === pin.name && h.cid === comp.id) ? null : h)}
                      onDoubleClick={(e) => { e.stopPropagation(); toggleJunction(comp, pin) }} />
                    {roomy && (
                      <text x={lx} y={ly} fontSize="8" fill={t.textMuted}
                        textAnchor={vert ? (inward > 0 ? 'start' : 'end') : 'middle'}
                        dominantBaseline={vert ? 'middle' : (inward > 0 ? 'hanging' : 'auto')}
                        pointerEvents="none">{pin.name}</text>
                    )}
                  </g>
                )
              })}
            </g>
          )
        })}

        {/* connections ON TOP — routed along the roads (from /layout), each a
            distinct color and slightly offset so shared-road wires are legible.
            Falls back to a straight line if the route isn't available yet. */}
        {connections.map((c, i) => {
          const color = t.wireColors[i % t.wireColors.length]
          const routed = layout?.routes?.find(r => r.from === c.from && r.to === c.to)
          const del = () => setConnections(connections.filter((_, j) => j !== i))
          if (routed) {
            const off = (i - (connections.length - 1) / 2) * 0.5   // lane offset (mm)
            const pts = routed.points.map(([x, y]) => `${X(x)},${Y(y + off)}`).join(' ')
            return <polyline key={i} points={pts} fill="none" stroke={color}
              strokeWidth="2.5" strokeDasharray="5 3" strokeLinejoin="round"
              style={{ cursor: 'pointer' }} onDoubleClick={del}>
              <title>{c.from} → {c.to} (double-click to delete)</title>
            </polyline>
          }
          // fallback straight line
          const comp1 = placed.find(p => p.id === c.from.split('.')[0])
          const comp2 = placed.find(p => p.id === c.to.split('.')[0])
          if (!comp1 || !comp2) return null
          const p1 = pinPositions(comp1).find(p => p.key === c.from.split('.')[1])
          const p2 = pinPositions(comp2).find(p => p.key === c.to.split('.')[1])
          if (!p1 || !p2) return null
          const w1 = pinWorld(comp1, p1); const w2 = pinWorld(comp2, p2)
          return <line key={i} x1={X(w1.x)} y1={Y(w1.y)} x2={X(w2.x)} y2={Y(w2.y)}
            stroke={color} strokeWidth="2.5" strokeDasharray="5 3"
            style={{ cursor: 'pointer' }} onDoubleClick={del} />
        })}

        {/* dragging wire (always topmost) */}
        {wire && <line x1={X(wire.from.x)} y1={Y(wire.from.y)} x2={X(wire.to.x)} y2={Y(wire.to.y)}
          stroke={t.accent} strokeWidth="2.5" pointerEvents="none" />}

        {/* hover pin label — a chip above the pin, always available (handy when
            pins are too close for inline labels). */}
        {hoverPin && (() => {
          const text = `${hoverPin.label}${hoverPin.n > 0 ? ` ×${hoverPin.n}` : ''}`
          const wpx = text.length * 6 + 10
          return (
            <g pointerEvents="none">
              <rect x={hoverPin.x - wpx / 2} y={hoverPin.y - PIN_R - 20} width={wpx} height={16}
                rx="3" fill="#222" opacity="0.9" />
              <text x={hoverPin.x} y={hoverPin.y - PIN_R - 12} textAnchor="middle"
                fontSize="10" fill="#fff">{text}</text>
            </g>
          )
        })()}
      </svg>
    </div>
  )
}

// Build the engine spec from editor state.
export function buildSpec(name, placed, connections, junctions, highways = [], boardSize = null, settings = null, extraNubs = []) {
  // junctions is a map { "comp.pin": count } (count = extra break-out holes).
  // Accept the legacy array form too (each entry = count 1).
  const jmap = Array.isArray(junctions)
    ? Object.fromEntries(junctions.map(k => [k, 1]))
    : (junctions || {})
  const comps = placed.map(p => {
    const jn = {}
    Object.entries(jmap).forEach(([k, n]) => {
      if (n > 0 && k.startsWith(p.id + '.')) jn[k.slice(p.id.length + 1)] = n
    })
    return {
      id: p.id, x: Math.round(p.x), y: Math.round(p.y),
      row_gap: p.row_gap,
      ...(Object.keys(jn).length ? { junctions: jn } : {}),
      // per-component road-width overrides (only emitted when set in the panel)
      ...(p.street_w != null ? { street_w: p.street_w } : {}),
      ...(p.town_w != null ? { town_w: p.town_w } : {}),
      ...(p.street_len != null ? { street_len: p.street_len } : {}),
      ...(p.junction_gap != null ? { junction_gap: p.junction_gap } : {}),
      rows: p.rows,
    }
  })
  // board-wide globals from the settings panel (defaults if none provided).
  // Per-component/per-highway overrides above still win in the engine.
  const s = settings || {}
  const board = {
    base_h: s.base_h ?? 6, cap_h: s.cap_h ?? 2, wall: s.wall ?? 4,
    street_w: s.street_w ?? 1.8, town_w: s.town_w ?? 5.0, highway_w: s.highway_w ?? 8.0,
    street_len: s.street_len ?? 8.0,
    pin_hole_d: s.pin_hole_d ?? 1.0,
    cap_type: s.cap_type ?? 'nest',
    clamp_fit: s.clamp_fit ?? 0.3,
    lid_fit: s.lid_fit ?? 0.3,
    make_clamps: s.make_clamps ?? true,
    make_lid: s.make_lid ?? true,
    exit_doors: s.exit_doors ?? true,
    labels: s.labels ?? false,
    label_depth: s.label_depth ?? 0.6,
    label_size: s.label_size ?? 0,
    pin_funnel: s.pin_funnel ?? 0,
    street_nubs: s.street_nubs ?? false,
    town_nubs: s.town_nubs ?? false,
  }
  if (highways && highways.length) {
    board.highways = highways.map(h => ({
      y: Math.round(h.y),
      ...(h.w != null ? { w: h.w } : {}),   // per-highway width override
    }))
  }
  if (extraNubs && extraNubs.length) {
    board.extra_nubs = extraNubs.map(n => ({
      x: Math.round(n.x * 10) / 10, y: Math.round(n.y * 10) / 10,
      ...(n.d != null ? { d: n.d } : {}),
    }))
  }
  // locked board rectangle: engine honors size + center VERBATIM (no clamp).
  // May be smaller than the content -> Preview/Download will error.
  if (boardSize) {
    board.auto_size = false
    board.length = Math.round(boardSize.length)
    board.width = Math.round(boardSize.width)
    board.center = { x: Math.round(boardSize.cx ?? 0), y: Math.round(boardSize.cy ?? 0) }
  }
  return { name: name || 'myboard', board, components: comps, connections }
}
