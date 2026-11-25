import React, { useState, useEffect } from 'react'
import StlViewer from './StlViewer.jsx'
import BoardEditor, { buildSpec } from './BoardEditor.jsx'
import PropsPanel from './PropsPanel.jsx'
import { useTheme } from './theme.jsx'

const API = import.meta.env.VITE_API || 'http://localhost:8000'

export default function App() {
  const t = useTheme()
  const [library, setLibrary] = useState([])
  const [mode, setMode] = useState('editor')
  const [name, setName] = useState('myboard')
  const [placed, setPlaced] = useState([])
  const [connections, setConnections] = useState([])
  const [junctions, setJunctions] = useState({})   // { "comp.pin": count } extra holes
  const [highways, setHighways] = useState([])   // [{y}] user-placed corridors
  const [boardSize, setBoardSize] = useState(null)  // {length,width} if locked, else null (auto)
  const [selected, setSelected] = useState(null)    // {type:'component',id} | {type:'highway',index}
  const [addingHoles, setAddingHoles] = useState(null)  // comp.id when in add-hole mode
  const [addingNubs, setAddingNubs] = useState(false)   // true when in click-to-add-nub mode
  const [extraNubs, setExtraNubs] = useState([])    // [{x,y,d}] manual retention nubs
  const [layout, setLayout] = useState(null)        // live /layout (shared editor + props panel)
  // board-wide global settings (defaults; per-item overrides still win)
  const [settings, setSettings] = useState({
    street_w: 1.8, town_w: 5.0, highway_w: 8.0, street_len: 8.0, pin_hole_d: 1.0,
    base_h: 6, cap_h: 2, wall: 4,
    make_clamps: true, make_lid: true, cap_type: 'nest',
    clamp_fit: 0.3,   // clamp tightness (mm the plug is narrower than the groove)
    lid_fit: 0.3,     // lid tightness (mm clearance per side between plug & cavity)
    exit_doors: true, labels: false, label_depth: 0.6, label_size: 0,
    pin_funnel: 0,     // contact funnel mouth diameter (0 = off); helps pins self-center
    street_nubs: false, town_nubs: false,   // extra serpentine retention nubs
  })
  const [specText, setSpecText] = useState('')
  const [parts, setParts] = useState(null)   // [{part,label,color,buffer}] for the 3D viewer
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch(`${API}/components`).then(r => r.json())
      .then(d => setLibrary(d.components || []))
      .catch(() => setStatus('⚠ API not reachable at ' + API))
  }, [])

  function currentSpec() {
    if (mode === 'editor') return buildSpec(name, placed, connections, junctions, highways, boardSize, settings, extraNubs)
    try { return JSON.parse(specText) }
    catch (e) { setStatus('✗ invalid JSON: ' + e.message); return null }
  }

  async function preview() {
    const spec = currentSpec(); if (!spec) return
    setBusy(true); setStatus('generating 3D preview…')
    try {
      const r = await fetch(`${API}/preview_parts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spec) })
      if (!r.ok) throw new Error(await r.text())
      const data = await r.json()
      // decode each part's base64 STL to an ArrayBuffer for the viewer
      const decoded = data.parts.map(p => ({
        part: p.part, label: p.label, color: p.color,
        buffer: Uint8Array.from(atob(p.stl_b64), c => c.charCodeAt(0)).buffer,
      }))
      setParts(decoded)
      setStatus(`✓ preview ready — ${decoded.map(p => p.label).join(' + ')} · drag to rotate`)
    } catch (e) { setStatus('✗ ' + e.message) } finally { setBusy(false) }
  }

  async function download() {
    const spec = currentSpec(); if (!spec) return
    setBusy(true); setStatus('generating all parts…')
    try {
      const r = await fetch(`${API}/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spec) })
      if (!r.ok) throw new Error(await r.text())
      const url = URL.createObjectURL(await r.blob())
      const a = document.createElement('a')
      a.href = url; a.download = (spec.name || 'board') + '.zip'; a.click()
      URL.revokeObjectURL(url)
      setStatus('✓ downloaded ' + (spec.name || 'board') + '.zip')
    } catch (e) { setStatus('✗ ' + e.message) } finally { setBusy(false) }
  }

  function showJSON() {
    setSpecText(JSON.stringify(buildSpec(name, placed, connections, junctions, highways, boardSize, settings, extraNubs), null, 2))
    setMode('json')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: 'system-ui, sans-serif', background: t.bg, color: t.text }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: `1px solid ${t.border}`, background: t.panelBg }}>
        <b style={{ fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/favicon.svg" alt="" width={20} height={20} style={{ borderRadius: 4 }} />
          Grooveboard
        </b>
        <span style={{ color: t.textMuted, fontSize: 13 }}>Design &amp; 3D-print your own PWB — solderless</span>
        <input value={name} onChange={e => setName(e.target.value)}
          style={{ marginLeft: 12, padding: '4px 8px', border: `1px solid ${t.borderStrong}`, borderRadius: 5, background: t.cardBg, color: t.text }} />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={t.toggle} title={t.mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            style={ghostBtn(t)}>{t.mode === 'dark' ? '☀️ Light' : '🌙 Dark'}</button>
          <button onClick={() => setMode('editor')} style={tab(t, mode === 'editor')}>Editor</button>
          <button onClick={showJSON} style={tab(t, mode === 'json')}>JSON</button>
          <button onClick={preview} disabled={busy} style={btnBig(t)}>{busy ? <Spinner label="Generating…" /> : 'Preview 3D'}</button>
          <button onClick={download} disabled={busy} style={{ ...btnBig(t), background: t.success }}>{busy ? <Spinner label="Generating…" /> : 'Download'}</button>
        </div>
      </div>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div style={{ width: '44%', borderRight: `1px solid ${t.border}`, minHeight: 0 }}>
          {mode === 'editor'
            ? <BoardEditor library={library} name={name} placed={placed} setPlaced={setPlaced}
                connections={connections} setConnections={setConnections}
                highways={highways} setHighways={setHighways}
                boardSize={boardSize} setBoardSize={setBoardSize}
                junctions={junctions} setJunctions={setJunctions}
                selected={selected} setSelected={setSelected}
                settings={settings}
                addingHoles={addingHoles} setAddingHoles={setAddingHoles}
                extraNubs={extraNubs} setExtraNubs={setExtraNubs}
                addingNubs={addingNubs} setAddingNubs={setAddingNubs}
                layout={layout} setLayout={setLayout} />
            : <textarea value={specText} onChange={e => setSpecText(e.target.value)}
                style={{ width: '100%', height: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: 12, padding: 10, border: 'none', background: t.bg, color: t.text }} />}
        </div>
        {/* properties / edit panel (left of the 3D preview) */}
        <div style={{ width: 280, borderRight: `1px solid ${t.border}`, minHeight: 0, background: t.panelBg }}>
          <PropsPanel selected={selected} setSelected={setSelected}
            placed={placed} setPlaced={setPlaced}
            highways={highways} setHighways={setHighways}
            junctions={junctions} setJunctions={setJunctions}
            settings={settings} setSettings={setSettings}
            layout={layout}
            addingHoles={addingHoles} setAddingHoles={setAddingHoles}
            extraNubs={extraNubs} setExtraNubs={setExtraNubs}
            addingNubs={addingNubs} setAddingNubs={setAddingNubs} />
        </div>
        <div style={{ flex: 1, minHeight: 0 }}>
          {parts ? <StlViewer parts={parts} />
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888', background: t.viewerBg }}>
                {busy ? <><Spinner size={22} /> <span>Generating 3D preview…</span></> : 'Build a board → Preview 3D'}
              </div>}
        </div>
      </div>
      <div style={{ padding: '6px 16px', fontSize: 13, color: t.textMuted, borderTop: `1px solid ${t.borderSoft}`, background: t.bgAlt }}>
        {status} <span style={{ float: 'right', color: t.hint, fontSize: 11 }}>API: {API}</span>
      </div>
    </div>
  )
}
const tab = (t, on) => ({ padding: '7px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 5, border: '1px solid ' + (on ? t.accent : t.borderStrong), background: on ? t.accent : t.cardBg, color: on ? '#fff' : t.text })
const btnBig = (t) => ({ padding: '7px 14px', fontSize: 13, fontWeight: 'bold', color: '#fff', background: t.accent, border: 'none', borderRadius: 5, cursor: 'pointer' })
const ghostBtn = (t) => ({ padding: '7px 12px', fontSize: 13, cursor: 'pointer', borderRadius: 5, border: `1px solid ${t.borderStrong}`, background: t.cardBg, color: t.text })

// small inline spinner so busy states (API calls that can take several
// seconds for OpenSCAD rendering) give visible feedback, not just a status
// line easy to miss at the bottom of the screen.
function Spinner({ size = 13, label }) {
  const w = Math.max(2, size / 7)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        width: size, height: size, borderRadius: '50%', display: 'inline-block',
        boxSizing: 'border-box', border: `${w}px solid currentColor`,
        borderRightColor: 'transparent', opacity: 0.85,
        animation: 'groove-spin 0.8s linear infinite',
      }} />
      {label}
      <style>{'@keyframes groove-spin { to { transform: rotate(360deg); } }'}</style>
    </span>
  )
}
