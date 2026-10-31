import { useEffect, useRef } from 'react';

export default function PlannerScene({ theme }) {
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let cancelled = false;
    let cleanupScene;

    async function initializeScene() {
      const THREE = await import('three');
      if (cancelled || !hostRef.current) return;

      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
      } catch {
        return;
      }

    const isMobile = host.clientWidth < 600;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 1.8, isMobile ? 17 : 14.5);
    camera.lookAt(0, 0, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    const dark = theme === 'dark';
    const green = dark ? 0x7bd0a0 : 0x367a55;
    const sage = dark ? 0x8db7a1 : 0x829589;
    const muted = dark ? 0x9eb8a8 : 0x9eaca1;
    const illustration = new THREE.Group();
    illustration.scale.setScalar(isMobile ? 0.92 : 0.86);
    scene.add(illustration);

    const gridPoints = [];
    for (let index = -12; index <= 12; index += 1) {
      const point = index * 0.62;
      gridPoints.push(new THREE.Vector3(-8, -1.7, point), new THREE.Vector3(8, -1.7, point));
      gridPoints.push(new THREE.Vector3(point, -1.7, -7.5), new THREE.Vector3(point, -1.7, 7.5));
    }
    const gridGeometry = new THREE.BufferGeometry().setFromPoints(gridPoints);
    illustration.add(new THREE.LineSegments(gridGeometry, new THREE.LineBasicMaterial({
      color: muted,
      transparent: true,
      opacity: dark ? 0.2 : 0.28,
    })));

    const dial = new THREE.Group();
    dial.position.set(isMobile ? -0.15 : 2.4, isMobile ? -9.2 : 1.25, -1.4);
    dial.rotation.set(-0.2, -0.28, 0.12);
    illustration.add(dial);

    const addRing = (radius, thickness, color, opacity) => {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(radius, thickness, 6, 144),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity }),
      );
      dial.add(mesh);
    };
    addRing(2.62, 0.03, green, 0.72);
    addRing(2.28, 0.016, sage, 0.48);

    const minorTicks = [];
    const majorTicks = [];
    for (let tick = 0; tick < 60; tick += 1) {
      const angle = (tick / 60) * Math.PI * 2;
      const inner = tick % 5 === 0 ? 2.34 : 2.47;
      const outer = 2.53;
      const segments = tick % 5 === 0 ? majorTicks : minorTicks;
      segments.push(
        new THREE.Vector3(Math.cos(angle) * inner, Math.sin(angle) * inner, 0.03),
        new THREE.Vector3(Math.cos(angle) * outer, Math.sin(angle) * outer, 0.03),
      );
    }
    dial.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(minorTicks),
      new THREE.LineBasicMaterial({ color: muted, transparent: true, opacity: 0.58 }),
    ));
    dial.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(majorTicks),
      new THREE.LineBasicMaterial({ color: green, transparent: true, opacity: 0.82 }),
    ));

    const hands = new THREE.Group();
    hands.position.set(isMobile ? -0.15 : 2.4, isMobile ? -9.2 : 1.25, -0.9);
    illustration.add(hands);
    const longHand = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -0.72, 0), new THREE.Vector3(0, 1.42, 0)]),
      new THREE.LineBasicMaterial({ color: green, transparent: true, opacity: 0.86 }),
    );
    const shortHand = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.04, 0, 0.02), new THREE.Vector3(0.94, 0.54, 0.02)]),
      new THREE.LineBasicMaterial({ color: sage, transparent: true, opacity: 0.78 }),
    );
    hands.add(longHand, shortHand);

    const schedule = new THREE.Group();
    schedule.position.set(isMobile ? -4.05 : -4.05, 0, 0.3);
    schedule.visible = !isMobile;
    illustration.add(schedule);
    const rows = [
      { x: 0, y: 1.5, width: 1.65, color: green },
      { x: 0.48, y: 0.58, width: 2.65, color: sage },
      { x: -0.2, y: -0.36, width: 2.05, color: 0xc77f67 },
      { x: 0.6, y: -1.3, width: 2.9, color: green },
    ];
    rows.forEach(({ x, y, width, color }, index) => {
      const geometry = new THREE.BoxGeometry(width, 0.2, 0.14);
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color,
        transparent: true,
          opacity: dark ? 0.22 : 0.18,
      }));
      mesh.position.set(x, y, 0);
      mesh.userData.phase = index * 0.7;
      schedule.add(mesh);
      mesh.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.76 }),
      ));
    });

    const pointer = { x: 0, y: 0 };
    const onPointerMove = (event) => {
      pointer.x = (event.clientX / window.innerWidth - 0.5) * 2;
      pointer.y = (event.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const resizeObserver = new ResizeObserver(() => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.position.x = 0;
      camera.position.z = width < 600 ? 17 : 14.5;
      dial.position.x = width < 600 ? -0.15 : 2.4;
      dial.position.y = width < 600 ? -9.2 : 1.25;
      hands.position.x = width < 600 ? -0.15 : 2.4;
      hands.position.y = width < 600 ? -9.2 : 1.25;
      schedule.visible = width >= 600;
      illustration.scale.setScalar(width < 600 ? 0.92 : 0.86);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resizeObserver.observe(host);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const startedAt = performance.now();
    let animationFrame = 0;
    const animate = () => {
      animationFrame = window.requestAnimationFrame(animate);
      const elapsed = (performance.now() - startedAt) / 1000;
      if (!reducedMotion) {
        dial.rotation.z = 0.12 + Math.sin(elapsed * 0.16) * 0.015;
        hands.rotation.z = -elapsed * 0.14;
        schedule.position.y = Math.sin(elapsed * 0.25) * 0.035;
        schedule.children.forEach((row) => {
          row.rotation.z = Math.sin(elapsed * 0.2 + row.userData.phase) * 0.012;
        });
        illustration.rotation.y += (pointer.x * 0.035 - illustration.rotation.y) * 0.025;
        illustration.rotation.x += (-pointer.y * 0.02 - illustration.rotation.x) * 0.025;
      }
      renderer.render(scene, camera);
    };
    animate();

    cleanupScene = () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('pointermove', onPointerMove);
      resizeObserver.disconnect();
      scene.traverse((object) => {
        object.geometry?.dispose();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material?.dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
    }

    initializeScene().catch((error) => console.error('Unable to initialize planner background:', error));
    return () => {
      cancelled = true;
      cleanupScene?.();
    };
  }, [theme]);

  return <div className="scene-backdrop" ref={hostRef} aria-hidden="true" />;
}
