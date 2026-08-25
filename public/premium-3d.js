const VERTEX_SHADER = `
precision mediump float;
attribute vec3 aPosition;
attribute vec3 aNormal;
uniform float uTime;
uniform float uCube;
uniform float uAspect;
uniform float uParallax;
uniform float uVariant;
uniform float uMist;
varying vec3 vNormal;
varying vec3 vPosition;

mat3 rotateX(float angle) {
  float c = cos(angle), s = sin(angle);
  return mat3(1.0,0.0,0.0, 0.0,c,-s, 0.0,s,c);
}
mat3 rotateY(float angle) {
  float c = cos(angle), s = sin(angle);
  return mat3(c,0.0,s, 0.0,1.0,0.0, -s,0.0,c);
}
mat3 rotateZ(float angle) {
  float c = cos(angle), s = sin(angle);
  return mat3(c,-s,0.0, s,c,0.0, 0.0,0.0,1.0);
}

void main() {
  vec3 offset;
  float scale;
  float phase = uCube * 1.37;
  float falling = step(0.5, uVariant);
  if (falling > 0.5 && uMist < 0.5) {
    float lane = mod(uCube, 3.0) - 1.0;
    float row = floor(uCube / 3.0);
    offset = vec3(lane * 1.38 + sin(phase) * 0.14, mod(3.0 - uTime * (0.42 + row * 0.05) - phase, 6.0) - 3.0, (mod(uCube, 2.0) - 0.5) * 0.62);
    scale = 0.13 + mod(uCube, 3.0) * 0.025;
  } else if (uMist > 0.5) {
    offset = vec3(mod(uCube, 2.0) < 0.5 ? -0.92 : 0.94, sin(uTime * 0.16 + phase) * 0.46, -0.35);
    scale = falling > 0.5 ? 0.24 : 0.19;
  } else if (uCube < 0.5) {
    offset = vec3(-1.72, 1.34, 0.25); scale = 0.20;
  } else if (uCube < 1.5) {
    offset = vec3(1.68, 1.08, -0.15); scale = 0.18;
  } else {
    offset = vec3(1.58, -1.42, 0.05); scale = 0.16;
  }
  float drift = sin(uTime * 0.42 + phase) * (uMist > 0.5 ? 0.11 : 0.05);
  mat3 rotation = rotateZ(uTime * 0.08 + phase) * rotateY(uTime * 0.17 + phase * 0.4) * rotateX(0.48 + sin(uTime * 0.12 + phase) * 0.2);
  vec3 local = aPosition * scale;
  if (uMist > 0.5) local *= vec3(3.2, 0.58, 0.42);
  vec3 world = rotation * local + offset + vec3(0.0, drift + uParallax, 0.0);
  vNormal = normalize(rotation * aNormal);
  vPosition = world;
  float depth = 4.1 - world.z;
  vec2 projected = world.xy / depth * 2.6;
  gl_Position = vec4(projected.x / uAspect, projected.y, (depth - 2.0) / 4.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform float uTime;
uniform float uMist;
varying vec3 vNormal;
varying vec3 vPosition;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vec3(0.0, 0.0, 1.0));
  vec3 lightDir = normalize(vec3(-0.45, 0.78, 0.65));
  float diffuse = max(dot(normal, lightDir), 0.0);
  float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.4);
  float specular = pow(max(dot(reflect(-lightDir, normal), viewDir), 0.0), 26.0);
  float facet = 0.5 + 0.5 * sin(dot(vPosition, vec3(13.0, 17.0, 11.0)) + uTime * 0.08);
  vec3 deepIce = vec3(0.10, 0.63, 0.82);
  vec3 clearIce = vec3(0.82, 0.98, 1.0);
  vec3 colour = mix(deepIce, clearIce, 0.34 + diffuse * 0.46 + facet * 0.12);
  colour += specular * vec3(1.0);
  float alpha = uMist > 0.5
    ? 0.018 + fresnel * 0.055
    : 0.04 + fresnel * 0.20 + specular * 0.12;
  gl_FragColor = vec4(colour, clamp(alpha, 0.018, uMist > 0.5 ? 0.09 : 0.28));
}`;

function cubeGeometry() {
  const faces = [
    { n: [1,0,0], p: [[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]] },
    { n: [-1,0,0], p: [[-1,-1,1],[-1,1,1],[-1,1,-1],[-1,-1,-1]] },
    { n: [0,1,0], p: [[-1,1,-1],[-1,1,1],[1,1,1],[1,1,-1]] },
    { n: [0,-1,0], p: [[-1,-1,1],[-1,-1,-1],[1,-1,-1],[1,-1,1]] },
    { n: [0,0,1], p: [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]] },
    { n: [0,0,-1], p: [[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]] },
  ];
  const data = [];
  for (const face of faces) {
    for (const index of [0,1,2,0,2,3]) data.push(...face.p[index], ...face.n);
  }
  return new Float32Array(data);
}

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Shader compilation failed';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl) {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'Program link failed';
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

export function mountPremiumIceScene(host, options = {}) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.setAttribute('role', 'presentation');
  host.append(canvas);
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: !options.mobile,
    depth: true,
    premultipliedAlpha: true,
    powerPreference: options.mobile ? 'low-power' : 'default',
  });
  if (!gl) {
    canvas.remove();
    throw new Error('WebGL context unavailable');
  }

  let program;
  let buffer;
  let frame = 0;
  let visible = true;
  let destroyed = false;
  let parallax = 0;
  const started = performance.now();
  const horeca = options.variant === 'horeca';

  const releaseResources = () => {
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    buffer = null;
    program = null;
  };

  const initialize = () => {
    releaseResources();
    program = createProgram(gl);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, cubeGeometry(), gl.STATIC_DRAW);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
  };

  const resize = () => {
    const rect = host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, options.mobile ? 1.5 : 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  };

  const render = now => {
    frame = 0;
    if (destroyed || !visible || document.hidden || !program) return;
    resize();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const position = gl.getAttribLocation(program, 'aPosition');
    const normal = gl.getAttribLocation(program, 'aNormal');
    gl.enableVertexAttribArray(position);
    gl.enableVertexAttribArray(normal);
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 24, 0);
    gl.vertexAttribPointer(normal, 3, gl.FLOAT, false, 24, 12);
    gl.uniform1f(gl.getUniformLocation(program, 'uTime'), (now - started) / 1000);
    gl.uniform1f(gl.getUniformLocation(program, 'uAspect'), canvas.width / canvas.height);
    gl.uniform1f(gl.getUniformLocation(program, 'uParallax'), parallax);
    gl.uniform1f(gl.getUniformLocation(program, 'uVariant'), horeca ? 1 : 0);
    const cube = gl.getUniformLocation(program, 'uCube');
    const mist = gl.getUniformLocation(program, 'uMist');
    const solidCount = horeca ? 6 : 3;
    const totalCount = solidCount + 2;
    for (let index = 0; index < totalCount; index += 1) {
      gl.uniform1f(cube, index);
      gl.uniform1f(mist, index >= solidCount ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 36);
    }
    frame = requestAnimationFrame(render);
  };

  const syncAnimation = () => {
    if (destroyed || !visible || document.hidden || frame) return;
    frame = requestAnimationFrame(render);
  };
  const onVisibility = () => {
    if (document.hidden && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else syncAnimation();
  };
  const onScroll = () => {
    const rect = host.getBoundingClientRect();
    parallax = Math.max(-0.12, Math.min(0.12, (window.innerHeight * 0.5 - (rect.top + rect.height * 0.5)) / window.innerHeight * 0.12));
  };
  const onContextLost = event => {
    event.preventDefault();
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    program = null;
    buffer = null;
    host.dataset.enhancement = 'fallback';
    host.dataset.fallbackReason = 'context-lost';
  };
  const onContextRestored = () => {
    try {
      initialize();
      host.dataset.enhancement = 'active';
      delete host.dataset.fallbackReason;
      syncAnimation();
    } catch {
      host.dataset.enhancement = 'fallback';
      host.dataset.fallbackReason = 'context-restore-failed';
    }
  };

  const intersection = new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting);
    if (!visible && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else syncAnimation();
  }, { threshold: 0.01 });
  const resizeObserver = new ResizeObserver(resize);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('scroll', onScroll, { passive: true });
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);
  intersection.observe(host);
  resizeObserver.observe(host);
  initialize();
  onScroll();
  resize();
  syncAnimation();

  return {
    canvas,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (frame) cancelAnimationFrame(frame);
      intersection.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('scroll', onScroll);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      releaseResources();
      canvas.remove();
    },
  };
}
