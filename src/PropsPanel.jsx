import React, { useState } from 'react'
import { useTheme } from './theme.jsx'

// Properties / edit panel. Sits between the 2D editor and the 3D preview.
// Shows the selected component or highway and lets you edit the road
// dimensions that feed straight into the layout + 3D/print.
//
// Width overrides are PER-ITEM (per component, per highway); lengths are
// computed (read-only) except the per-component junction break-out runway.

const DEF = { street_w: 1.8, town_w: 5.0, highway_w: 8.0, junction_gap: 6.0, street_len: 8.0 }
const MAX_JUNCTION = 4   // cap extra break-out holes per pin (keeps the board small)

// small -/N/+ stepper, clamped to [min,max]
function Stepper({ t, value, min = 0, max = 9, onChange }) {
  const btn = (txt, d, disabled) => (
    <button disabled={disabled} onClick={() => onChange(value + d)}
      style={{ width: 22, height: 22, fontSize: 14, lineHeight: '18px', cursor: disabled ? 'default' : 'pointer',
               border: `1px solid ${t.borderStrong}`, borderRadius: 4, background: disabled ? t.borderSoft : t.cardBg,
               color: disabled ? t.borderStrong : t.textMuted }}>{txt}</button>
  )
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      {btn('−', -1, value <= min)}
      <span style={{ minWidth: 14, textAlign: 'center', fontWeight: value > 0 ? 700 : 400,
                     color: value > 0 ? '#c60' : t.textFainter }}>{value}</span>
      {btn('+', +1, value >= max)}
    </span>
  )
}

function Row({ t, label, children, hint }) {
  return (
    <div style={{ margin: '10px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: 12, color: t.textMuted }}>{label}</span>
        {children}
      </div>
      {hint && <div style={{ fontSize: 10, color: t.textFainter, marginTop: 2 }}>{hint}</div>}
    </div>
  )
}

// a labelled slider + number box bound to a value, calls onChange(number)
function Slider({ t, value, def, min, max, step, onChange }) {
  const v = value ?? def
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input type="range" min={min} max={max} step={step} value={v}
        onChange={e => onChange(parseFloat(e.target.value))} style={{ width: 90 }} />
      <input type="number" min={min} max={max} step={step} value={v}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: 52, fontSize: 12, padding: '2px 4px', border: `1px solid ${t.borderStrong}`, borderRadius: 4, background: t.cardBg, color: t.text }} />
      <span style={{ fontSize: 11, color: t.textFaint }}>mm</span>
    </span>
  )
}

export default function PropsPanel({ selected, setSelected, placed, setPlaced,
                                     highways, setHighways, junctions, setJunctions,
                                     settings, setSettings, layout,
                                     addingHoles, setAddingHoles,
                                     extraNubs, setExtraNubs,
                                     addingNubs, setAddingNubs }) {
  const t = useTheme()
  const [tab, setTab] = useState('selection')   // 'selection' | 'board'
  // jump to the Selection tab whenever something new is selected
  const [lastSel, setLastSel] = useState(null)
  if (selected !== lastSel) {
    setLastSel(selected)
    if (selected && tab !== 'selection') setTab('selection')
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
                  background: t.panelBg, color: t.text, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', borderBottom: `1px solid ${t.border}` }}>
        <Tab t={t} on={tab === 'selection'} onClick={() => setTab('selection')}>Selection</Tab>
        <Tab t={t} on={tab === 'board'} onClick={() => setTab('board')}>Board</Tab>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {tab === 'board'
          ? <BoardView t={t} settings={settings} setSettings={setSettings} layout={layout}
              extraNubs={extraNubs} setExtraNubs={setExtraNubs}
              addingNubs={addingNubs} setAddingNubs={setAddingNubs} />
          : <SelectionView t={t} selected={selected} setSelected={setSelected}
              placed={placed} setPlaced={setPlaced} highways={highways} setHighways={setHighways}
              junctions={junctions} setJunctions={setJunctions} settings={settings} layout={layout}
              gotoBoard={() => setTab('board')}
              addingHoles={addingHoles} setAddingHoles={setAddingHoles} />}
      </div>
    </div>
  )
}

function Tab({ t, on, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '9px 0', fontSize: 12, fontWeight: on ? 700 : 500, cursor: 'pointer',
      border: 'none', borderBottom: '2px solid ' + (on ? t.accent : 'transparent'),
      background: on ? t.accentBg : t.panelBg, color: on ? t.accentText : t.textMuted,
    }}>{children}</button>
  )
}

// ================= BOARD (global settings) =================
function BoardView({ t, settings, setSettings, layout, extraNubs, setExtraNubs, addingNubs, setAddingNubs }) {
  const s = settings
  const set = (patch) => setSettings({ ...s, ...patch })
  return (
    <div style={{ padding: 14 }}>
      <SectionTitle t={t}>Board dimensions</SectionTitle>
      <div style={{ fontSize: 10, color: t.textFainter, margin: '2px 0 4px' }}>
        Drag the board edges in the editor to resize/move the outline.
        {layout?.board && <> Current: {Math.round(layout.board.length)}×{Math.round(layout.board.width)}mm.</>}
      </div>
      <Row t={t} label="Base height"><Slider t={t} value={s.base_h} def={6} min={3} max={14} step={0.5} onChange={base_h => set({ base_h })} /></Row>
      <Row t={t} label="Wall thickness"><Slider t={t} value={s.wall} def={4} min={1.5} max={6} step={0.5} onChange={wall => set({ wall })} /></Row>

      <SectionTitle t={t}>Default road widths</SectionTitle>
      <div style={{ fontSize: 10, color: t.textFainter, margin: '2px 0 4px' }}>
        Board-wide defaults. A component/highway with its own width overrides these.
      </div>
      <Row t={t} label="Street width"><Slider t={t} value={s.street_w} def={1.8} min={0.8} max={6} step={0.1} onChange={street_w => set({ street_w })} /></Row>
      <Row t={t} label="Street length" hint="Distance from pins out to the town road. Longer pushes the town road farther from the component.">
        <Slider t={t} value={s.street_len} def={8} min={3} max={30} step={0.5} onChange={street_len => set({ street_len })} /></Row>
      <Row t={t} label="Town width"><Slider t={t} value={s.town_w} def={5} min={2} max={14} step={0.5} onChange={town_w => set({ town_w })} /></Row>
      <Row t={t} label="Highway width"><Slider t={t} value={s.highway_w} def={8} min={3} max={20} step={0.5} onChange={highway_w => set({ highway_w })} /></Row>

      <SectionTitle t={t}>Pin holes</SectionTitle>
      <PinFit t={t} value={s.pin_hole_d} onChange={pin_hole_d => set({ pin_hole_d })} />
      <Toggle t={t} label="Contact funnel (self-centering mouth)" checked={!!s.pin_funnel} onChange={on => set({ pin_funnel: on ? Math.max(s.pin_hole_d + 0.8, 1.8) : 0 })}
        hint="Widens the top of each pin hole into a cone, so a pin that isn't perfectly straight slides down onto the wire instead of needing to be forced. Fixes 'have to push the component to make contact.'" />
      {!!s.pin_funnel && (
        <Row t={t} label="Funnel mouth" hint="Must stay below ~2.3mm so neighboring funnels at 2.54mm pitch don't merge.">
          <Slider t={t} value={s.pin_funnel} def={1.8} min={s.pin_hole_d + 0.3} max={2.3} step={0.1} onChange={pin_funnel => set({ pin_funnel })} />
        </Row>
      )}

      <SectionTitle t={t}>Wire retention</SectionTitle>
      <div style={{ fontSize: 10, color: t.textFainter, margin: '2px 0 4px', lineHeight: 1.4 }}>
        Highways already get center nubs. Turn these on if wires still slip out of
        the town/street grooves (e.g. on a board without clamps, or extra
        insurance under the clamp).
      </div>
      <Toggle t={t} label="Nubs on town roads" checked={!!s.town_nubs} onChange={town_nubs => set({ town_nubs })}
        hint="Serpentine bumps along each component's town road — wire must weave past them." />
      <Toggle t={t} label="Nubs on streets" checked={!!s.street_nubs} onChange={street_nubs => set({ street_nubs })}
        hint="Same, on the short per-pin street grooves. Only for longer streets (street length ≳ 10mm)." />
      <button
        onClick={() => setAddingNubs(!addingNubs)}
        style={{
          width: '100%', margin: '6px 0 2px', padding: '7px', fontSize: 12, cursor: 'pointer', borderRadius: 5,
          background: addingNubs ? t.junctionMagenta : t.cardBg,
          color: addingNubs ? '#fff' : t.junctionMagenta,
          border: '1px solid ' + (addingNubs ? t.junctionMagenta : t.junctionMagentaSoft),
        }}>
        {addingNubs ? '✓ Click a road to add a nub (click here to stop)' : '+ Add nub at a spot (click mode)'}
      </button>
      <div style={{ fontSize: 10, color: t.textFainter, margin: '4px 0 2px', lineHeight: 1.4 }}>
        {addingNubs ? 'Click anywhere on a highway/town/street in the editor to drop a nub there. Right-click an existing nub to remove it.'
          : 'Spot-fix one place where a wire keeps slipping, instead of nubbing the whole road.'}
        {extraNubs.length > 0 && <> <b>{extraNubs.length}</b> manual nub{extraNubs.length === 1 ? '' : 's'} placed.</>}
      </div>
      {extraNubs.length > 0 && (
        <button onClick={() => setExtraNubs([])}
          style={{ ...bulkBtn(t), width: '100%', marginTop: 4, color: t.danger, borderColor: t.dangerBorder, background: t.dangerBg }}>
          Clear all manual nubs
        </button>
      )}

      <SectionTitle t={t}>Parts to generate</SectionTitle>
      <Toggle t={t} label="Base tray" checked disabled hint="Always produced." />
      <Toggle t={t} label="Clamps (solderless plugs)" checked={s.make_clamps} onChange={make_clamps => set({ make_clamps })}
        hint="Road-shaped press-fit plugs that hold the wires." />
      {s.make_clamps && <ClampTightness t={t} value={s.clamp_fit} onChange={clamp_fit => set({ clamp_fit })} />}
      <Toggle t={t} label="Lid / case" checked={s.make_lid} onChange={make_lid => set({ make_lid })} />
      {s.make_lid && (
        <div style={{ margin: '6px 0 2px', paddingLeft: 10 }}>
          <Radio t={t} name="cap_type" value="nest" cur={s.cap_type} onChange={cap_type => set({ cap_type })}
            label="Nest (flush plug, lift-off)" />
          <Radio t={t} name="cap_type" value="slide" cur={s.cap_type} onChange={cap_type => set({ cap_type })}
            label="Slide (pencil-box lid)" />
          {s.cap_type === 'nest' && <LidTightness t={t} value={s.lid_fit} onChange={lid_fit => set({ lid_fit })} />}
          <Toggle t={t} label="Component labels on lid" checked={s.labels} onChange={labels => set({ labels })}
            hint="Each component's name on the top of the lid, sized to fit and kept clear of the pin holes." />
          {s.labels && <LabelDepth t={t} value={s.label_depth} onChange={label_depth => set({ label_depth })}
            size={s.label_size} onSize={label_size => set({ label_size })} />}
        </div>
      )}

      <SectionTitle t={t}>Wire exits</SectionTitle>
      <Toggle t={t} label="Exit doors (out gate)" checked={s.exit_doors} onChange={exit_doors => set({ exit_doors })}
        hint="Gaps in the wall where highways reach the edge, so wires exit to motors/battery." />
    </div>
  )
}

// Pin fit: `pin_hole_d` = the pin hole diameter. SMALLER = tighter grip on the
// pin/wire contact (fixes "have to push the component to get it connected"),
// at the cost of needing a straighter pin to drop in easily.
const PIN_PRESETS = [
  { key: 'tight', label: 'Tight', val: 0.7 },
  { key: 'fit',   label: 'Fit',   val: 1.0 },
  { key: 'loose', label: 'Loose', val: 1.4 },
]
function PinFit({ t, value, onChange }) {
  const v = value ?? 1.0
  const active = PIN_PRESETS.find(p => Math.abs(p.val - v) < 0.001)?.key
  const desc = v <= 0.8 ? 'Tight — pin grips the hole wall and presses onto the wire with no slack. Best fix for a loose/wiggly contact; needs a straight pin to seat.'
    : v <= 1.1 ? 'Fit — matches a standard 0.64mm header pin with FDM tolerance. Recommended default.'
    : 'Loose — easy to drop a pin in, but more likely to need a push to reach the wire. Pair with the contact funnel below if you use this.'
  return (
    <div style={{ margin: '2px 0 4px' }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {PIN_PRESETS.map(p => (
          <button key={p.key} onClick={() => onChange(p.val)} style={presetBtn(t, active === p.key)}>{p.label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, color: t.textFaint }}>tight</span>
        <input type="range" min="0.6" max="2.5" step="0.1" value={v}
          onChange={e => onChange(parseFloat(e.target.value))} style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: t.textFaint }}>loose</span>
        <input type="number" min="0.6" max="2.5" step="0.1" value={v}
          onChange={e => onChange(parseFloat(e.target.value))}
          style={{ width: 48, fontSize: 11, padding: '2px 4px', border: `1px solid ${t.borderStrong}`, borderRadius: 4, background: t.cardBg, color: t.text }} />
        <span style={{ fontSize: 10, color: t.textFaint }}>mm</span>
      </div>
      <div style={{ fontSize: 10, color: t.textFainter, marginTop: 5, lineHeight: 1.4 }}>
        <b>{v.toFixed(1)} mm</b> hole diameter. {desc}
      </div>
    </div>
  )
}

// Clamp tightness: `clamp_fit` = how much NARROWER the plug is than the groove.
// LOWER value = tighter (plug fills the groove), HIGHER = looser. Presets +
// manual slider + inline help so the numbers are meaningful.
const CLAMP_PRESETS = [
  { key: 'tight', label: 'Tight', val: 0.0 },
  { key: 'fit',   label: 'Fit',   val: 0.3 },
  { key: 'loose', label: 'Loose', val: 0.6 },
]
// lid tightness: clearance per side between the flush plug and the cavity walls.
// smaller = tighter fit. Tight may need a push; loose lifts off easily.
const LID_PRESETS = [
  { key: 'tight', label: 'Tight', val: 0.15 },
  { key: 'snug',  label: 'Snug',  val: 0.3 },
  { key: 'loose', label: 'Loose', val: 0.5 },
]
function LidTightness({ t, value, onChange }) {
  const v = value ?? 0.3
  const active = LID_PRESETS.find(p => Math.abs(p.val - v) < 0.001)?.key
  const desc = v <= 0.2 ? 'Tight — snaps in firmly, needs a push to seat and to lift off. Best if your prints run loose.'
    : v <= 0.4 ? 'Snug — seats with light pressure, stays put but lifts off by hand. Recommended.'
    : 'Loose — drops in and lifts off freely. Good for frequent access or tight-printing machines.'
  return (
    <div style={{ margin: '8px 0 4px', paddingLeft: 2 }}>
      <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>Lid tightness</div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {LID_PRESETS.map(p => (
          <button key={p.key} onClick={() => onChange(p.val)} style={presetBtn(t, active === p.key)}>{p.label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, color: t.textFaint }}>tight</span>
        <input type="range" min="0.1" max="0.8" step="0.05" value={v}
          onChange={e => onChange(parseFloat(e.target.value))} style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: t.textFaint }}>loose</span>
        <input type="number" min="0.1" max="0.8" step="0.05" value={v}
          onChange={e => onChange(parseFloat(e.target.value))}
          style={{ width: 48, fontSize: 11, padding: '2px 4px', border: `1px solid ${t.borderStrong}`, borderRadius: 4, background: t.cardBg, color: t.text }} />
        <span style={{ fontSize: 10, color: t.textFaint }}>mm</span>
      </div>
      <div style={{ fontSize: 10, color: t.textFainter, marginTop: 5, lineHeight: 1.4 }}>
        <b>{v.toFixed(2)} mm</b> gap per side. {desc}
      </div>
    </div>
  )
}

function ClampTightness({ t, value, onChange }) {
  const v = value ?? 0.3
  // which preset (if any) matches the current value
  const active = CLAMP_PRESETS.find(p => Math.abs(p.val - v) < 0.001)?.key
  const desc = v <= 0.1 ? 'Plug = groove width. Tightest press-fit — grips hard, may need a firm push; best if prints come out loose.'
    : v <= 0.4 ? 'Plug slightly narrower than the groove. Snug — slides in with firm pressure and holds the wire well. Recommended default.'
    : 'Plug clearly narrower. Loose — easy to insert and remove, lighter grip on the wire. Good for frequent rewiring or tight-printing machines.'
  return (
    <div style={{ margin: '6px 0 4px', paddingLeft: 10 }}>
      <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>Clamp tightness</div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {CLAMP_PRESETS.map(p => (
          <button key={p.key} onClick={() => onChange(p.val)} style={presetBtn(t, active === p.key)}>{p.label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, color: t.textFaint }}>tight</span>
        {/* reversed scale so the slider reads left=tight, right=loose */}
        <input type="range" min="0" max="1" step="0.05" value={v}
          onChange={e => onChange(parseFloat(e.target.value))} style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: t.textFaint }}>loose</span>
        <input type="number" min="0" max="1" step="0.05" value={v}
          onChange={e => onChange(parseFloat(e.target.value))}
          style={{ width: 48, fontSize: 11, padding: '2px 4px', border: `1px solid ${t.borderStrong}`, borderRadius: 4, background: t.cardBg, color: t.text }} />
        <span style={{ fontSize: 10, color: t.textFaint }}>mm</span>
      </div>
      <div style={{ fontSize: 10, color: t.textFainter, marginTop: 5, lineHeight: 1.4 }}>
        <b>{v.toFixed(2)} mm</b> gap between plug and groove. {desc}
      </div>
    </div>
  )
}

// Label depth: how the text sits on the lid top.
//   > 0  raised (embossed) by that many mm
//   < 0  engraved (cut into the lid) by that many mm
//   = 0  flat / no text
const LABEL_PRESETS = [
  { key: 'engraved', label: 'Engraved', val: -0.8 },
  { key: 'raised',   label: 'Raised',   val: 0.6 },
]
function LabelDepth({ t, value, onChange, size, onSize }) {
  const v = value ?? 0.6
  const sz = size ?? 0
  const active = LABEL_PRESETS.find(p => Math.abs(p.val - v) < 0.001)?.key
  const kind = v > 0 ? `raised ${v.toFixed(1)}mm above the lid`
    : v < 0 ? `engraved ${Math.abs(v).toFixed(1)}mm into the lid`
    : 'flat (no text)'
  return (
    <div style={{ margin: '6px 0 2px', paddingLeft: 2 }}>
      <div style={{ fontSize: 11, color: t.textMuted, marginBottom: 4 }}>Label depth</div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
        {LABEL_PRESETS.map(p => (
          <button key={p.key} onClick={() => onChange(p.val)} style={presetBtn(t, active === p.key)}>{p.label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 10, color: t.textFaint }}>engrave</span>
        <input type="range" min="-1.5" max="1.5" step="0.1" value={v}
          onChange={e => onChange(parseFloat(e.target.value))} style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: t.textFaint }}>raise</span>
        <input type="number" min="-1.5" max="1.5" step="0.1" value={v}
          onChange={e => onChange(parseFloat(e.target.value))}
          style={{ width: 48, fontSize: 11, padding: '2px 4px', border: `1px solid ${t.borderStrong}`, borderRadius: 4, background: t.cardBg, color: t.text }} />
        <span style={{ fontSize: 10, color: t.textFaint }}>mm</span>
      </div>
      <div style={{ fontSize: 10, color: t.textFainter, marginTop: 5, lineHeight: 1.4 }}>
        Text is <b>{kind}</b>. Raised prints proud of the surface; engraved cuts in
        (good with a contrasting filament swap or just as a recessed mark).
      </div>

      {/* text size: 0 = auto-fit (largest that clears the pin holes). A value
          only makes the text SMALLER — it never overruns the holes. */}
      <div style={{ fontSize: 11, color: t.textMuted, margin: '8px 0 4px' }}>Text size</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <label style={{ fontSize: 10, color: sz === 0 ? t.accent : t.textFainter, cursor: 'pointer' }}>
          <input type="checkbox" checked={sz === 0} onChange={e => onSize(e.target.checked ? 0 : 3)}
            style={{ verticalAlign: 'middle', marginRight: 3 }} />auto
        </label>
        <input type="range" min="1" max="8" step="0.5" value={sz || 3} disabled={sz === 0}
          onChange={e => onSize(parseFloat(e.target.value))} style={{ flex: 1, opacity: sz === 0 ? 0.4 : 1 }} />
        <input type="number" min="1" max="8" step="0.5" value={sz || ''} placeholder="auto"
          onChange={e => onSize(e.target.value === '' ? 0 : parseFloat(e.target.value))}
          style={{ width: 48, fontSize: 11, padding: '2px 4px', border: `1px solid ${t.borderStrong}`, borderRadius: 4, background: t.cardBg, color: t.text }} />
        <span style={{ fontSize: 10, color: t.textFaint }}>mm</span>
      </div>
      <div style={{ fontSize: 10, color: t.textFainter, marginTop: 4, lineHeight: 1.4 }}>
        {sz === 0 ? 'Auto: largest size that fits between the pin holes.'
                  : `Font ${sz}mm (capped to what fits — holes stay clear).`}
      </div>
    </div>
  )
}

function Toggle({ t, label, checked, onChange, disabled, hint }) {
  return (
    <label style={{ display: 'block', margin: '7px 0', fontSize: 12, color: disabled ? t.hint : t.textMuted,
                    cursor: disabled ? 'default' : 'pointer' }}>
      <input type="checkbox" checked={checked} disabled={disabled}
        onChange={e => onChange && onChange(e.target.checked)}
        style={{ verticalAlign: 'middle', marginRight: 6 }} />
      {label}
      {hint && <div style={{ fontSize: 10, color: t.hint, margin: '1px 0 0 22px' }}>{hint}</div>}
    </label>
  )
}
function Radio({ t, name, value, cur, onChange, label }) {
  return (
    <label style={{ display: 'block', margin: '4px 0', fontSize: 12, color: t.textMuted, cursor: 'pointer' }}>
      <input type="radio" name={name} checked={cur === value} onChange={() => onChange(value)}
        style={{ verticalAlign: 'middle', marginRight: 6 }} />
      {label}
    </label>
  )
}

// ================= SELECTION (per-item) =================
function SelectionView({ t, selected, setSelected, placed, setPlaced,
                         highways, setHighways, junctions, setJunctions, layout, gotoBoard,
                         addingHoles, setAddingHoles }) {
  if (!selected) {
    return (
      <Shell t={t}>
        <div style={{ color: t.textFainter, fontSize: 13, padding: '20px 4px', lineHeight: 1.5 }}>
          Select a <b>component</b> or a <b>highway</b> in the editor to edit its
          road widths. Or open the <b style={{ color: t.accent, cursor: 'pointer' }}
            onClick={gotoBoard}>Board</b> tab for global settings (dimensions,
          default widths, parts, lid, exit doors).
        </div>
      </Shell>
    )
  }

  if (selected.type === 'highway') {
    const i = selected.index
    const h = highways[i]
    if (!h) return <Shell t={t}><Empty t={t} onClose={() => setSelected(null)} /></Shell>
    const set = (patch) => setHighways(highways.map((x, k) => k === i ? { ...x, ...patch } : x))
    // length = board length (spans edge to edge)
    const len = layout?.board ? Math.round(layout.board.length) : null
    return (
      <Shell t={t}>
        <Header t={t} title={`Highway #${i + 1}`} onClose={() => setSelected(null)} />
        <Row t={t} label="Width" hint="Groove width — holds the wire bundle. Wider = more bundles.">
          <Slider t={t} value={h.w} def={DEF.highway_w} min={3} max={20} step={0.5}
            onChange={w => set({ w })} />
        </Row>
        <Row t={t} label="Position Y">
          <Slider t={t} value={Math.round(h.y)} def={0} min={-150} max={150} step={1}
            onChange={y => set({ y })} />
        </Row>
        <Info t={t} label="Length" value={len != null ? `${len} mm (spans board)` : '—'} />
        <button onClick={() => { setHighways(highways.filter((_, k) => k !== i)); setSelected(null) }}
          style={delBtn(t)}>Delete highway</button>
      </Shell>
    )
  }

  // ---- component ----
  const comp = placed.find(p => p.id === selected.id)
  if (!comp) return <Shell t={t}><Empty t={t} onClose={() => setSelected(null)} /></Shell>
  const set = (patch) => setPlaced(placed.map(p => p.id === comp.id ? { ...p, ...patch } : p))
  // build the pin list with UNIQUE keys (duplicate names -> _2, _3), matching
  // the engine/editor dedupe. `nm` = display label, `key` = unique id.
  const pins = []
  const seen = {}
  comp.rows.forEach(r => r.pins.forEach(nm => {
    seen[nm] = (seen[nm] || 0) + 1
    const key = seen[nm] === 1 ? nm : `${nm}_${seen[nm]}`
    pins.push({ nm, key, side: r.side, dup: seen[nm] })
  }))
  // junctions: map { "comp.pinkey": count }. count = extra break-out holes on
  // that pin's street. 0 = none. Capped at MAX_JUNCTION to keep the board small.
  const jmap = junctions || {}
  const jCount = (key) => jmap[`${comp.id}.${key}`] || 0
  const setCount = (key, n) => {
    const next = { ...jmap }
    const v = Math.max(0, Math.min(MAX_JUNCTION, n))
    if (v > 0) next[`${comp.id}.${key}`] = v; else delete next[`${comp.id}.${key}`]
    setJunctions(next)
  }
  // bulk: add `d` to every pin on this component (clamped to [0, MAX]).
  const bumpAll = (d) => {
    const next = { ...jmap }
    pins.forEach(p => {
      const k = `${comp.id}.${p.key}`
      const v = Math.max(0, Math.min(MAX_JUNCTION, (next[k] || 0) + d))
      if (v > 0) next[k] = v; else delete next[k]
    })
    setJunctions(next)
  }
  const anyJunction = pins.some(p => jCount(p.key) > 0)
  // set absolute orientation (0/90/180/270). Rotating remaps each row's side;
  // pins/streets/town road all follow `side`, so this rotates the whole
  // component in both the editor and the printed board. We apply the delta from
  // the current angle as that many 90° clockwise steps.
  const cur = comp.rot || 0
  // TRUE 90° clockwise step: each pin (x,y) -> (y,-x). Pin lists read top->bottom
  // (index 0 = topmost) for left/right rows and left->right for top/bottom rows.
  // Under that convention the pin ORDER must reverse when a left/right row
  // rotates (left->top, right->bottom); top/bottom rows keep order. This flip is
  // what makes it a true rotation rather than a mirror.
  const stepCW = (row) => {
    const cw = { left: 'top', top: 'right', right: 'bottom', bottom: 'left' }
    const reverse = row.side === 'left' || row.side === 'right'
    return { ...row, side: cw[row.side] || row.side,
             pins: reverse ? [...row.pins].reverse() : row.pins }
  }
  const setRotation = (target) => {
    const steps = (((target - cur) / 90) % 4 + 4) % 4
    let rows = comp.rows
    for (let k = 0; k < steps; k++) rows = rows.map(stepCW)
    set({ rows, rot: target })
  }
  const twoRows = comp.rows.length === 2
  // SWAP ROWS: put each row on the OPPOSITE side (left<->right, top<->bottom).
  // Only meaningful for a 2-row component whose two sides read mirrored from
  // ours. Tracked by comp.swap so the toggle shows its state.
  const swapRows = () => {
    const opp = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' }
    const rows = comp.rows.map(r => ({ ...r, side: opp[r.side] || r.side }))
    set({ rows, swap: !comp.swap })
  }
  // FLIP PINS (upside down): reverse the pin order within every row, so each
  // column/row reads the other way. Tracked by comp.flip.
  const flipPins = () => {
    const rows = comp.rows.map(r => ({ ...r, pins: [...r.pins].reverse() }))
    set({ rows, flip: !comp.flip })
  }

  return (
    <Shell t={t}>
      <Header t={t} title={comp.name || comp.id} onClose={() => setSelected(null)} />
      <div style={{ fontSize: 11, color: t.textFaint, marginTop: -6, marginBottom: 6 }}>
        {comp.id} · {pins.length} pins
        {comp.footprint && <> · {comp.footprint.length}×{comp.footprint.width}mm</>}
      </div>

      <SectionTitle t={t}>Orientation</SectionTitle>
      <Row t={t} label="Rotation" hint="Rotate the component in 90° steps.">
        <select value={cur} onChange={e => setRotation(parseInt(e.target.value, 10))}
          style={{ fontSize: 12, padding: '3px 6px', border: `1px solid ${t.borderStrong}`, borderRadius: 4, background: t.cardBg, color: t.text }}>
          {[0, 90, 180, 270].map(a => <option key={a} value={a}>{a}°</option>)}
        </select>
      </Row>
      <Toggle t={t} label="Swap rows" checked={!!comp.swap} disabled={!twoRows} onChange={swapRows}
        hint={twoRows ? "Put each row on the opposite side — fixes a component whose two sides are mirrored from yours."
                      : "Only for 2-row components."} />
      <Toggle t={t} label="Flip pins (upside down)" checked={!!comp.flip} onChange={flipPins}
        hint="Reverse the pin order in every row — fixes a column that reads the wrong way." />

      <SectionTitle t={t}>Street roads (per pin → town)</SectionTitle>
      <Row t={t} label="Street width" hint="Green groove from each pin to the town road.">
        <Slider t={t} value={comp.street_w} def={DEF.street_w} min={0.8} max={6} step={0.1}
          onChange={street_w => set({ street_w })} />
      </Row>
      <Row t={t} label="Street length" hint="How far this component's town road sits from its pins.">
        <Slider t={t} value={comp.street_len} def={DEF.street_len} min={3} max={30} step={0.5}
          onChange={street_len => set({ street_len })} />
      </Row>

      <SectionTitle t={t}>Town road (this component's bus)</SectionTitle>
      <Row t={t} label="Town width" hint="Blue groove collecting all this component's streets.">
        <Slider t={t} value={comp.town_w} def={DEF.town_w} min={2} max={14} step={0.5}
          onChange={town_w => set({ town_w })} />
      </Row>

      {anyJunction && (
        <>
          <SectionTitle t={t}>Junction break-out</SectionTitle>
          <Row t={t} label="Break-out length" hint="How far a junction street runs past the town road for its extra holes.">
            <Slider t={t} value={comp.junction_gap} def={DEF.junction_gap} min={3} max={14} step={0.5}
              onChange={junction_gap => set({ junction_gap })} />
          </Row>
        </>
      )}

      <SectionTitle t={t}>Pins — extra holes</SectionTitle>
      <div style={{ fontSize: 10, color: t.textFainter, margin: '2px 0 6px', lineHeight: 1.4 }}>
        Extra <b>break-out holes</b> per pin let you tap more wires into that pin
        (e.g. a shared power/ground rail). Each hole lengthens that pin's street,
        so it grows the board — capped at {MAX_JUNCTION}.
      </div>
      {/* bulk: apply +1 / −1 to every pin on this component at once */}
      <div style={{ display: 'flex', gap: 6, margin: '0 0 6px' }}>
        <button onClick={() => bumpAll(+1)} style={bulkBtn(t)}>+1 all pins</button>
        <button onClick={() => bumpAll(-1)} style={{ ...bulkBtn(t), color: t.textFaint }}>−1 all pins</button>
      </div>
      {/* Add hole on street: click-to-add mode */}
      <button
        onClick={() => setAddingHoles(addingHoles === comp.id ? null : comp.id)}
        style={{
          ...bulkBtn(t), width: '100%', marginBottom: 6,
          background: addingHoles === comp.id ? t.success : t.accentBg,
          color: addingHoles === comp.id ? '#fff' : t.accentText,
          border: '1px solid ' + (addingHoles === comp.id ? t.success : t.accent),
        }}>
        {addingHoles === comp.id ? '✓ Click a street to add hole (or click here to cancel)' : '+ Add hole on street (click mode)'}
      </button>
      <div style={{ maxHeight: 220, overflowY: 'auto', border: `1px solid ${t.borderSoft}`, borderRadius: 5 }}>
        {pins.map(p => {
          const n = jCount(p.key)
          return (
            <div key={p.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                     padding: '4px 8px', fontSize: 12, borderBottom: `1px solid ${t.borderSoft}` }}>
              <span style={{ color: n > 0 ? '#c60' : t.text }}>
                <b>{p.nm}</b>
                {p.dup > 1 && <span style={{ color: t.hint, fontSize: 10 }}> #{p.dup}</span>}
                <span style={{ color: t.hint }}> ({p.side})</span>
              </span>
              <Stepper t={t} value={n} min={0} max={MAX_JUNCTION} onChange={v => setCount(p.key, v)} />
            </div>
          )
        })}
      </div>

      <button onClick={() => { setPlaced(placed.filter(p => p.id !== comp.id)); setSelected(null) }}
        style={delBtn(t)}>Remove component</button>
    </Shell>
  )
}

// ---- little presentational helpers ----
function Shell({ t, children }) {
  return (
    <div style={{ width: '100%', height: '100%', boxSizing: 'border-box', overflowY: 'auto',
                  padding: 14, background: t.panelBg, color: t.text, fontFamily: 'system-ui, sans-serif' }}>
      {children}
    </div>
  )
}
function Header({ t, title, onClose }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <b style={{ fontSize: 15 }}>{title}</b>
      <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer',
                                        color: t.hint, fontSize: 16 }}>×</button>
    </div>
  )
}
function SectionTitle({ t, children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: t.accent, textTransform: 'uppercase',
                       letterSpacing: 0.4, marginTop: 14 }}>{children}</div>
}
function Info({ t, label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '8px 0', fontSize: 12 }}>
      <span style={{ color: t.textMuted }}>{label}</span>
      <span style={{ color: t.textFaint }}>{value}</span>
    </div>
  )
}
function Empty({ t, onClose }) {
  return <div style={{ color: t.textFainter, fontSize: 13 }}>
    That item is gone. <button onClick={onClose} style={{ cursor: 'pointer' }}>Clear</button>
  </div>
}
const delBtn = (t) => ({
  width: '100%', marginTop: 16, padding: '7px', fontSize: 12, cursor: 'pointer',
  border: `1px solid ${t.dangerBorder}`, borderRadius: 5, background: t.dangerBg, color: t.danger,
})
const bulkBtn = (t) => ({
  flex: 1, padding: '5px', fontSize: 11, cursor: 'pointer',
  border: `1px solid ${t.borderStrong}`, borderRadius: 5, background: t.accentBg, color: t.accentText,
})
const presetBtn = (t, active) => ({
  flex: 1, padding: '5px 0', fontSize: 11, cursor: 'pointer', borderRadius: 5,
  border: '1px solid ' + (active ? t.accent : t.borderStrong),
  background: active ? t.accentBg : t.cardBg,
  color: active ? t.accentText : t.textMuted, fontWeight: active ? 700 : 500,
})
