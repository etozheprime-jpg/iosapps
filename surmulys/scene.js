// 3D-фон: спиральная галактика из светящихся частиц + «пульс» из каркасного икосаэдра и колец.
// Реагирует на указатель, наклон телефона и прокрутку; цвет следует за выбранной категорией.
import * as THREE from './vendor/three.module.min.js';

export function startScene(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch { return null; }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const small = Math.min(innerWidth, innerHeight) < 600;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  const accent = new THREE.Color('#ff4f8b');
  const target = accent.clone();
  const uniforms = { uTime: { value: 0 }, uAccent: { value: accent }, uPx: { value: renderer.getPixelRatio() } };

  // ---- галактика ----
  const N = small ? 2600 : 5200;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), seed = new Float32Array(N);
  const palette = ['#8b5cff', '#ff4f8b', '#ffb547', '#35e0d0', '#ffffff'].map(c => new THREE.Color(c));
  for (let i = 0; i < N; i++) {
    const arm = i % 3, r = Math.pow(Math.random(), 0.65) * 11 + 0.3;
    const a = (arm / 3) * Math.PI * 2 + r * 0.55 + (Math.random() - 0.5) * 0.7 / (0.4 + r * 0.12);
    const spread = 0.08 + r * 0.05;
    pos[i * 3] = Math.cos(a) * r + (Math.random() - 0.5) * spread * 4;
    pos[i * 3 + 1] = (Math.random() - 0.5) * spread * 3.2;
    pos[i * 3 + 2] = Math.sin(a) * r + (Math.random() - 0.5) * spread * 4;
    const c = palette[Math.random() < 0.18 ? 4 : Math.floor(Math.random() * 4)].clone().lerp(palette[0], r / 16);
    col.set([c.r, c.g, c.b], i * 3);
    size[i] = 0.6 + Math.random() * 2.2; seed[i] = Math.random() * 6.283;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const stars = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
    vertexShader: `
      attribute float aSize; attribute float aSeed; varying vec3 vCol; varying float vTw;
      uniform float uTime; uniform float uPx; uniform vec3 uAccent;
      void main(){
        vCol = mix(color, uAccent, 0.22);
        vTw = 0.55 + 0.45 * sin(uTime * 1.6 + aSeed * 5.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uPx * (34.0 / -mv.z) * (0.7 + vTw * 0.5);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vCol; varying float vTw;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d); a *= a;
        gl_FragColor = vec4(vCol * (0.8 + vTw * 0.6), a * (0.45 + vTw * 0.55));
      }`,
  }));
  stars.rotation.x = 0.5;
  scene.add(stars);

  // ---- центральный «пульс» ----
  const core = new THREE.Group();
  const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(1.35, 1),
    new THREE.MeshBasicMaterial({ color: accent, wireframe: true, transparent: true, opacity: 0.55 }));
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.92, 48, 48), new THREE.ShaderMaterial({
    uniforms, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV; uniform vec3 uAccent; uniform float uTime;
      void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.2); float p = 0.75 + 0.25*sin(uTime*2.0);
        gl_FragColor = vec4(mix(uAccent, vec3(1.0), f*0.35) * (0.25 + f*1.4) * p, 0.25 + f*0.85); }`,
  }));
  core.add(wire, glow);
  const rings = [];
  [[1.9, 0.012, 0.9, 0.2], [2.4, 0.008, -0.5, 1.1], [3.0, 0.006, 0.2, -0.7]].forEach(([r, t, rx, ry], i) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, 160),
      new THREE.MeshBasicMaterial({ color: i === 1 ? 0xffb547 : accent, transparent: true, opacity: 0.55 - i * 0.1 }));
    m.rotation.set(rx, ry, 0); m.userData.s = 0.25 + i * 0.12; rings.push(m); core.add(m);
  });
  scene.add(core);

  // ---- ввод ----
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', e => { mouse.tx = e.clientX / innerWidth - 0.5; mouse.ty = e.clientY / innerHeight - 0.5; }, { passive: true });
  addEventListener('deviceorientation', e => {
    if (e.gamma == null) return;
    mouse.tx = Math.max(-1, Math.min(1, e.gamma / 45)) * 0.5; mouse.ty = Math.max(-1, Math.min(1, (e.beta - 45) / 45)) * 0.5;
  }, { passive: true });
  let scroll = 0, scrollT = 0;
  addEventListener('scroll', () => { scrollT = scrollY; }, { passive: true });

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = w / h < 0.8 ? 11.5 : 9;
    camera.updateProjectionMatrix();
    core.scale.setScalar(w / h < 0.8 ? 0.8 : 1);
  }
  resize(); addEventListener('resize', resize);

  let burst = 0, running = true, last = performance.now(), t = 0;
  let raf = 0;
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running && !reduced) { last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); }
  });

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += reduced ? dt * 0.15 : dt;
    uniforms.uTime.value = t;
    mouse.x += (mouse.tx - mouse.x) * 0.05; mouse.y += (mouse.ty - mouse.y) * 0.05;
    scroll += (scrollT - scroll) * 0.08;
    accent.lerp(target, 0.06);
    wire.material.color.copy(accent); rings[0].material.color.copy(accent); rings[2].material.color.copy(accent);
    burst *= 0.92;

    stars.rotation.y = t * 0.05 + mouse.x * 0.5 + burst * 0.4;
    stars.rotation.x = 0.5 + mouse.y * 0.25 - scroll * 0.0004;
    core.rotation.y = t * 0.3 + mouse.x * 0.6;
    core.rotation.x = t * 0.17 + mouse.y * 0.5;
    wire.scale.setScalar(1 + Math.sin(t * 2) * 0.03 + burst * 0.25);
    rings.forEach((r, i) => { r.rotation.z += dt * r.userData.s * (i % 2 ? -1 : 1); });

    // ядро уезжает вверх и вдаль при прокрутке, камера «пролетает» сквозь галактику
    const portrait = camera.aspect < 0.8;
    core.position.set(portrait ? 0 : 3.4, (portrait ? 3.2 : 1.1) + scroll * 0.004, -scroll * 0.004);
    camera.position.x = mouse.x * 1.4; camera.position.y = -mouse.y * 1.0 - scroll * 0.0009;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
  }
  function tick(now) { if (!running) return; frame(now); raf = requestAnimationFrame(tick); }
  if (reduced) { frame(performance.now()); addEventListener('resize', () => frame(performance.now())); }
  else raf = requestAnimationFrame(tick);

  return {
    setColor(hex) { target.set(hex); },
    pulse() { burst = 1; },
  };
}
