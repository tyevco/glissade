/**
 * Studio alpha (DESIGN.md §6, slice 1 — read-only): viewport on
 * Canvas2DBackend, transport with scrub, timeline panel rendering the
 * compiled document, inspector with live signal values. Keyframe editing and
 * sidecar persistence land in slice 2.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { compileTimeline } from '@glissade/core';
import { type Scene, type SceneModule } from '@glissade/scene';
import { mount, type Mounted } from '@glissade/player';
import goldenShapes from '../../examples/src/scenes/golden-shapes.js';
import goldenBounce from '../../examples/src/scenes/golden-bounce.js';
import { Transport } from './Transport.js';
import { TimelinePanel } from './TimelinePanel.js';
import { Inspector } from './Inspector.js';

const corpus: Record<string, SceneModule> = {
  shapes: goldenShapes,
  bounce: goldenBounce,
};

export function App() {
  const [sceneName, setSceneName] = useState('shapes');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [session, setSession] = useState<{ scene: Scene; mounted: Mounted } | null>(null);

  const mod = corpus[sceneName]!;
  const compiled = useMemo(() => compileTimeline(mod.timeline), [mod]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = mod.createScene();
    const mounted = mount(scene, mod.timeline, canvas, { loop: true });
    setSession({ scene, mounted });
    setSelectedNode(null);
    return () => {
      mounted.dispose();
      setSession(null);
    };
  }, [mod]);

  return (
    <div className="studio">
      <div className="viewport">
        <select
          className="scene-picker"
          value={sceneName}
          onChange={(e) => setSceneName(e.target.value)}
        >
          {Object.keys(corpus).map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        <canvas ref={canvasRef} width={640} height={360} />
      </div>
      {session && <Transport player={session.mounted.player} />}
      <div className="inspector">
        {session && (
          <Inspector scene={session.scene} selected={selectedNode} onSelect={setSelectedNode} />
        )}
      </div>
      <div className="timeline">
        {session && <TimelinePanel compiled={compiled} player={session.mounted.player} />}
      </div>
    </div>
  );
}
