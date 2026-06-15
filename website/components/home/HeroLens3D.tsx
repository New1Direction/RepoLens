'use client';

import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import {
  Environment,
  Lightformer,
  MeshTransmissionMaterial,
  Sparkles,
  useVideoTexture,
} from '@react-three/drei';
import * as THREE from 'three';

// Static assets aren't auto-prefixed with the GitHub Pages basePath, so prefix by hand.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/**
 * Vee — the live mascot clip — on a disc directly behind the lens, sized to sit
 * fully within the lens silhouette so he's only ever seen *through* the glass
 * (refracted), never as a bare rectangle. The video texture means he actually
 * moves. Swap mascot.mp4 for a transparent cutout/render later for a cleaner float.
 */
function VeeDisc() {
  const tex = useVideoTexture(`${BASE}/mascot.mp4`, {
    muted: true,
    loop: true,
    start: true,
    playsInline: true,
    crossOrigin: 'anonymous',
  });
  tex.colorSpace = THREE.SRGBColorSpace;
  // Ease the playback so the loop reads gentler and more continuous.
  const video = tex.image as HTMLVideoElement | undefined;
  if (video) video.playbackRate = 0.8;
  return (
    <mesh position={[0, 0.02, -0.55]}>
      <circleGeometry args={[1.02, 64]} />
      <meshBasicMaterial map={tex} toneMapped={false} />
    </mesh>
  );
}

/** The glass lens + its glowing cyan aperture rim. Tilts toward the cursor and
 *  idles with a slow drift. */
function Lens() {
  const group = useRef<THREE.Group>(null);
  const hovered = useRef(false);
  useFrame((state, delta) => {
    const g = group.current;
    if (!g) return;
    // The glass rests perfectly still until hovered; then it tilts toward the
    // cursor and eases back to rest on leave. No idle motion.
    const targetY = hovered.current ? state.pointer.x * 0.5 : 0;
    const targetX = hovered.current ? -state.pointer.y * 0.4 : 0;
    const k = 1 - Math.pow(0.0016, delta); // frame-rate-independent damping
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, targetY, k);
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, targetX, k);
  });

  return (
    <group
      ref={group}
      onPointerOver={() => {
        hovered.current = true;
      }}
      onPointerOut={() => {
        hovered.current = false;
      }}
    >
      {/* the lens: a flattened sphere → a thick magnifying disc. Near-clear glass
          (minimal distortion) so Vee reads almost directly through it. */}
      <mesh scale={[1, 1, 0.42]}>
        <sphereGeometry args={[1.12, 64, 64]} />
        <MeshTransmissionMaterial
          transmission={1}
          thickness={0.8}
          roughness={0.02}
          ior={1.28}
          chromaticAberration={0.012}
          anisotropicBlur={0.015}
          distortion={0}
          distortionScale={0}
          temporalDistortion={0}
          samples={6}
          resolution={512}
        />
      </mesh>
      {/* glowing aperture rim — a ring around the lens edge, facing the viewer
          (no rotation: TorusGeometry already lies in the camera-facing plane). */}
      <mesh>
        <torusGeometry args={[1.16, 0.034, 28, 140]} />
        <meshStandardMaterial
          color="#86b6ee"
          emissive="#2f7fe0"
          emissiveIntensity={1.45}
          roughness={0.3}
          metalness={0.45}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

export default function HeroLens3D() {
  return (
    <Canvas
      camera={{ position: [0, 0, 5], fov: 34 }}
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true, preserveDrawingBuffer: false }}
      style={{ background: 'transparent' }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 4, 5]} intensity={1.1} />
      <pointLight position={[-3, -1, 2]} intensity={0.6} color="#9ec5ff" />
      <Suspense fallback={null}>
        <VeeDisc />
        <Lens />
        {/* drifting motes of light around the lens */}
        <Sparkles
          count={26}
          scale={[3.4, 3.4, 1.6]}
          size={3}
          speed={0.35}
          opacity={0.55}
          color="#acd0ff"
          position={[0, 0, 0.5]}
        />
        {/* Procedural studio env — NO external HDR (keeps zero external calls). */}
        <Environment resolution={256}>
          <Lightformer form="rect" intensity={2.2} position={[2.5, 3, 2]} scale={[5, 5, 1]} color="#cfe6ff" />
          <Lightformer form="rect" intensity={1.5} position={[-3.5, 1, 1.5]} scale={[4, 4, 1]} color="#ffdede" />
          <Lightformer form="circle" intensity={2} position={[0, -2.5, 2.5]} scale={4} color="#bcd4ff" />
        </Environment>
      </Suspense>
    </Canvas>
  );
}
