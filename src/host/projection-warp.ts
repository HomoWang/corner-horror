import * as THREE from 'three';
import {
  computeUnitSquareHomography,
  invertHomography,
  toRenderQuad,
  type ProjectionCorners,
} from '../shared/calibration';

const VERTEX_SHADER = `
  varying vec2 vOutputUv;
  void main() {
    vOutputUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform sampler2D sceneTexture;
  uniform mat3 inverseHomography;
  varying vec2 vOutputUv;

  void main() {
    vec3 projected = inverseHomography * vec3(vOutputUv, 1.0);
    if (projected.z <= 0.00001) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    vec2 sourceUv = projected.xy / projected.z;
    if (sourceUv.x < 0.0 || sourceUv.x > 1.0 || sourceUv.y < 0.0 || sourceUv.y > 1.0) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    gl_FragColor = texture2D(sceneTexture, sourceUv);
    #include <colorspace_fragment>
  }
`;

export class ProjectionWarp {
  private readonly target = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
  });
  private readonly outputScene = new THREE.Scene();
  private readonly outputCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly inverseMatrix = new THREE.Matrix3();
  private readonly material: THREE.ShaderMaterial;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        sceneTexture: { value: this.target.texture },
        inverseHomography: { value: this.inverseMatrix },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.outputScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }

  setCorners(corners: ProjectionCorners): void {
    const inverse = invertHomography(computeUnitSquareHomography(toRenderQuad(corners)));
    this.inverseMatrix.set(...(inverse as [number, number, number, number, number, number, number, number, number]));
  }

  resize(width: number, height: number, pixelRatio: number): void {
    this.target.setSize(Math.max(1, Math.round(width * pixelRatio)), Math.max(1, Math.round(height * pixelRatio)));
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.setRenderTarget(this.target);
    this.renderer.clear();
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.outputScene, this.outputCamera);
  }
}
