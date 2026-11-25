import React, { useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Center, Grid } from '@react-three/drei'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'

// decode a base64 STL string to an ArrayBuffer
function b64ToBuf(b64) {
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

function PartMesh({ buffer, color, visible }) {
  const geo = useMemo(() => {
    if (!buffer) return null
    const g = new STLLoader().parse(buffer)
    g.computeVertexNormals()
    return g
  }, [buffer])
  if (!geo || !visible) return null
  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]}>
      <meshStandardMaterial color={color} metalness={0.1} roughness={0.7} />
    </mesh>
  )
}

// parts: [{ part, label, color, buffer }]  (buffer = ArrayBuffer)
export default function StlViewer({ parts }) {
  const list = parts && parts.length ? parts : []
  const [vis, setVis] = useState({})   // part name -> bool

  // default everything visible whenever a new part set arrives
  useEffect(() => {
    const v = {}
    list.forEach(p => { v[p.part] = true })
    setVis(v)
  }, [list.map(p => p.part).join(',')])

  const isVis = (p) => vis[p] !== false

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas camera={{ position: [90, 90, 90], fov: 45 }} style={{ background: '#1a1a22' }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[100, 120, 80]} intensity={1.1} />
        <directionalLight position={[-80, 60, -60]} intensity={0.5} />
        <Grid args={[400, 400]} cellSize={10} sectionSize={50} infiniteGrid
              fadeDistance={400} cellColor="#333" sectionColor="#555" />
        <Center>
          {list.map(p => (
            <PartMesh key={p.part} buffer={p.buffer} color={p.color} visible={isVis(p.part)} />
          ))}
        </Center>
        <OrbitControls makeDefault />
      </Canvas>

      {/* per-part show/hide toggles */}
      {list.length > 0 && (
        <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6,
                      background: 'rgba(20,20,30,0.75)', padding: 6, borderRadius: 7 }}>
          {list.map(p => (
            <button key={p.part} onClick={() => setVis({ ...vis, [p.part]: !isVis(p.part) })}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', fontSize: 12,
                cursor: 'pointer', borderRadius: 5, border: '1px solid #444',
                background: isVis(p.part) ? '#2a2a38' : 'transparent',
                color: isVis(p.part) ? '#fff' : '#777',
              }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: p.color,
                             opacity: isVis(p.part) ? 1 : 0.35 }} />
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
