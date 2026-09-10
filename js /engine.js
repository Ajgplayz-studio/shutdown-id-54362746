import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

export class SandboxEngine {
    constructor() {
        this.container = document.body;
        this.spawnedObjects = [];
        this.menuOpen = false;
        
        // Movement state for PC Desktop mode
        this.moveState = { forward: false, backward: false, left: false, right: false };
        this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
        this.isLocked = false;

        this.initScene();
        this.initEnvironment();
        this.initControllers();
        this.initListeners();
    }

    initScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x080810);
        this.scene.fog = new THREE.FogExp2(0x080810, 0.025);

        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
        this.camera.position.set(0, 1.6, 4);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.xr.enabled = true;
        this.container.appendChild(this.renderer.domElement);

        // WebXR VR Button integration
        document.body.appendChild(VRButton.createButton(this.renderer));

        this.renderer.xr.addEventListener('sessionstart', () => {
            document.getElementById('instructions').innerText = "VR Mode Active. Use controllers to interact.";
        });
        this.renderer.xr.addEventListener('sessionend', () => {
            document.getElementById('instructions').innerText = "Click screen to capture mouse. WASD to move. Press Q for Spawner Menu.";
        });
    }

    initEnvironment() {
        const ambientLight = new THREE.AmbientLight(0x333344, 1.5);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0x00ffcc, 1.8);
        dirLight.position.set(10, 20, 10);
        this.scene.add(dirLight);

        // Grid arena floor
        const grid = new THREE.GridHelper(50, 50, 0x00ffcc, 0x1a1a2e);
        this.scene.add(grid);

        // Arena boundary walls / structural columns
        const colGeo = new THREE.BoxGeometry(2, 6, 2);
        const colMat = new THREE.MeshStandardMaterial({ color: 0x141420, roughness: 0.3 });
        
        for (let i = 0; i < 8; i++) {
            const pillar = new THREE.Mesh(colGeo, colMat);
            const angle = (i / 8) * Math.PI * 2;
            pillar.position.set(Math.cos(angle) * 15, 3, Math.sin(angle) * 15);
            this.scene.add(pillar);
        }
    }

    initControllers() {
        // VR Controllers configuration
        this.controller1 = this.renderer.xr.getController(0);
        this.controller1.addEventListener('selectstart', () => this.spawnObjectInFront('box'));
        this.scene.add(this.controller1);

        const controllerModelFactory = new XRControllerModelFactory();
        this.controllerGrip1 = this.renderer.xr.getControllerGrip(0);
        this.controllerGrip1.add(controllerModelFactory.createControllerModel(this.controllerGrip1));
        this.scene.add(this.controllerGrip1);
    }

    initListeners() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // Pointer lock setup for PC desktop controls
        const canvas = this.renderer.domElement;
        canvas.addEventListener('click', () => {
            if (!this.renderer.xr.isPresenting && !this.menuOpen) {
                canvas.requestPointerLock();
            }
        });

        document.addEventListener('pointerlockchange', () => {
            this.isLocked = (document.pointerLockElement === canvas);
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isLocked || this.renderer.xr.isPresenting) return;

            this.euler.setFromQuaternion(this.camera.quaternion);
            this.euler.y -= e.movementX * 0.002;
            this.euler.x -= e.movementY * 0.002;
            this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));
            this.camera.quaternion.setFromEuler(this.euler);
        });

        document.addEventListener('keydown', (e) => this.handleKeys(e, true));
        document.addEventListener('keyup', (e) => this.handleKeys(e, false));

        // Spawner Menu UI button hooks
        document.querySelectorAll('.spawn-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.target.getAttribute('data-type');
                this.spawnObjectInFront(type);
                this.toggleSpawnerMenu(false);
            });
        });
    }

    handleKeys(e, isDown) {
        if (this.renderer.xr.isPresenting) return;

        // Toggle Spawner Menu with 'Q'
        if (e.code === 'KeyQ' && isDown) {
            this.toggleSpawnerMenu(!this.menuOpen);
            return;
        }

        if (this.menuOpen) return;

        switch (e.code) {
            case 'KeyW': this.moveState.forward = isDown; break;
            case 'KeyS': this.moveState.backward = isDown; break;
            case 'KeyA': this.moveState.left = isDown; break;
            case 'KeyD': this.moveState.right = isDown; break;
        }
    }

    toggleSpawnerMenu(open) {
        this.menuOpen = open;
        const menu = document.getElementById('spawner-menu');
        if (open) {
            menu.classList.remove('hidden');
            document.exitPointerLock();
        } else {
            menu.classList.add('hidden');
        }
    }

    updateDesktopMovement() {
        if (this.renderer.xr.isPresenting || this.menuOpen) return;

        const speed = 0.07;
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        dir.y = 0;
        dir.normalize();

        const sideDir = new THREE.Vector3(-dir.z, 0, dir.x);

        if (this.moveState.forward) this.camera.position.addScaledVector(dir, speed);
        if (this.moveState.backward) this.camera.position.addScaledVector(dir, -speed);
        if (this.moveState.left) this.camera.position.addScaledVector(sideDir, speed);
        if (this.moveState.right) this.camera.position.addScaledVector(sideDir, -speed);

        this.camera.position.y = 1.6; // Keep head height fixed
    }

    spawnObjectInFront(type) {
        let geo, mat;
        const spawnPos = new THREE.Vector3();
        const spawnDir = new THREE.Vector3();
        
        this.camera.getWorldDirection(spawnDir);
        spawnPos.copy(this.camera.position).addScaledVector(spawnDir, 3); // 3 units ahead

        switch(type) {
            case 'box':
                geo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
                mat = new THREE.MeshStandardMaterial({ color: 0xff3366, roughness: 0.3 });
                break;
            case 'sphere':
                geo = new THREE.SphereGeometry(0.5, 16, 16);
                mat = new THREE.MeshStandardMaterial({ color: 0x33ccff, roughness: 0.2 });
                break;
            case 'barrel':
                geo = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 16);
                mat = new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.4 });
                break;
            case 'dummy':
                geo = new THREE.CapsuleGeometry(0.3, 1, 4, 8);
                mat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.5 });
                break;
            default:
                geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
                mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
        }

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(spawnPos);
        
        // Add random slight spin or drop physics simulation placeholder
        mesh.userData = { velocity: new THREE.Vector3(0, -0.02, 0) };

        this.scene.add(mesh);
        this.spawnedObjects.push(mesh);
    }

    updateGame() {
        this.updateDesktopMovement();

        // Simple physics tick for spawned objects falling down to floor
        for (let i = 0; i < this.spawnedObjects.length; i++) {
            const obj = this.spawnedObjects[i];
            if (obj.position.y > 0.5) {
                obj.position.add(obj.userData.velocity);
                obj.rotation.x += 0.01;
                obj.rotation.y += 0.01;
            }
        }
    }

    start() {
        this.renderer.setAnimationLoop(() => {
            this.updateGame();
            this.renderer.render(this.scene, this.camera);
        });
    }
}
