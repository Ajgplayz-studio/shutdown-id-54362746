import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';

export class GameEngine {
    constructor() {
        this.container = document.body;
        this.score = 0;
        this.targets = [];
        this.projectiles = [];
        
        // Movement tracking for Desktop Screen Mode
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
        this.scene.background = new THREE.Color(0x050508);
        this.scene.fog = new THREE.FogExp2(0x050508, 0.03);

        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 100);
        this.camera.position.set(0, 1.6, 3);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.xr.enabled = true;
        this.container.appendChild(this.renderer.domElement);

        // WebXR VR Button
        const vrButton = VRButton.createButton(this.renderer);
        document.body.appendChild(vrButton);

        // Listen for entering/exiting WebXR VR session to update UI info
        this.renderer.xr.addEventListener('sessionstart', () => {
            document.getElementById('mode-instruction').innerText = "VR Mode Active";
        });
        this.renderer.xr.addEventListener('sessionend', () => {
            document.getElementById('mode-instruction').innerText = "Screen Mode: Click screen to lock mouse. WASD to move.";
        });
    }

    initEnvironment() {
        const ambientLight = new THREE.AmbientLight(0x222233, 1.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0x00ffcc, 2);
        directionalLight.position.set(5, 10, 5);
        this.scene.add(directionalLight);

        const gridHelper = new THREE.GridHelper(40, 40, 0x00ffcc, 0x1f1f2e);
        this.scene.add(gridHelper);

        const boxGeo = new THREE.BoxGeometry(1.5, 3, 1.5);
        const boxMat = new THREE.MeshStandardMaterial({ color: 0x12121c, roughness: 0.4 });
        
        for (let i = 0; i < 12; i++) {
            const obstacle = new THREE.Mesh(boxGeo, boxMat);
            const angle = (i / 12) * Math.PI * 2;
            const radius = 8 + Math.random() * 4;
            obstacle.position.set(Math.cos(angle) * radius, 1.5, Math.sin(angle) * radius);
            this.scene.add(obstacle);
        }
    }

    initControllers() {
        // VR Controllers
        this.controller1 = this.renderer.xr.getController(0);
        this.controller1.addEventListener('selectstart', () => this.onVRShoot(this.controller1));
        this.scene.add(this.controller1);

        this.controller2 = this.renderer.xr.getController(1);
        this.controller2.addEventListener('selectstart', () => this.onVRShoot(this.controller2));
        this.scene.add(this.controller2);

        const controllerModelFactory = new XRControllerModelFactory();
        this.controllerGrip1 = this.renderer.xr.getControllerGrip(0);
        this.controllerGrip1.add(controllerModelFactory.createControllerModel(this.controllerGrip1));
        this.scene.add(this.controllerGrip1);

        this.controllerGrip2 = this.renderer.xr.getControllerGrip(1);
        this.controllerGrip2.add(controllerModelFactory.createControllerModel(this.controllerGrip2));
        this.scene.add(this.controllerGrip2);

        // Visual lasers for VR controllers
        const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-1)]);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffcc });
        const line = new THREE.Line(lineGeo, lineMat);
        line.scale.z = 5;
        this.controller1.add(line.clone());
        this.controller2.add(line.clone());
    }

    initListeners() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // --- SCREEN MODE CONTROLS (Desktop Mouse & Keyboard) ---
        this.renderer.domElement.addEventListener('click', () => {
            if (!this.renderer.xr.isPresenting) {
                this.renderer.domElement.requestPointerLock();
            }
        });

        document.addEventListener('pointerlockchange', () => {
            this.isLocked = (document.pointerLockElement === this.renderer.domElement);
        });

        document.addEventListener('mousemove', (event) => {
            if (!this.isLocked || this.renderer.xr.isPresenting) return;

            const movementX = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
            const movementY = event.movementY || event.mozMovementY || event.webkitMovementY || 0;

            this.euler.setFromQuaternion(this.camera.quaternion);
            this.euler.y -= movementX * 0.002;
            this.euler.x -= movementY * 0.002;
            this.euler.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.euler.x));
            this.camera.quaternion.setFromEuler(this.euler);
        });

        document.addEventListener('keydown', (e) => this.onKeyChange(e, true));
        document.addEventListener('keyup', (e) => this.onKeyChange(e, false));

        // Screen mode click to shoot
        window.addEventListener('mousedown', (e) => {
            if (this.isLocked && !this.renderer.xr.isPresenting && e.button === 0) {
                const dir = new THREE.Vector3();
                this.camera.getWorldDirection(dir);
                this.spawnProjectile(this.camera.position, dir);
            }
        });
    }

    onKeyChange(event, isDown) {
        if (this.renderer.xr.isPresenting) return;
        switch (event.code) {
            case 'KeyW': this.moveState.forward = isDown; break;
            case 'KeyS': this.moveState.backward = isDown; break;
            case 'KeyA': this.moveState.left = isDown; break;
            case 'KeyD': this.moveState.right = isDown; break;
        }
    }

    updateDesktopMovement() {
        if (this.renderer.xr.isPresenting) return;

        const speed = 0.05;
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        dir.y = 0; // Keep movement locked to ground plane
        dir.normalize();

        const sideDir = new THREE.Vector3(-dir.z, 0, dir.x);

        if (this.moveState.forward) this.camera.position.addScaledVector(dir, speed);
        if (this.moveState.backward) this.camera.position.addScaledVector(dir, -speed);
        if (this.moveState.left) this.camera.position.addScaledVector(sideDir, speed);
        if (this.moveState.right) this.camera.position.addScaledVector(sideDir, -speed);
        
        // Lock player height
        this.camera.position.y = 1.6;
    }

    onVRShoot(controller) {
        const tempMatrix = new THREE.Matrix4();
        tempMatrix.identity().extractRotation(controller.matrixWorld);

        const position = new THREE.Vector3().setFromMatrixPosition(controller.matrixWorld);
        const direction = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix);

        this.spawnProjectile(position, direction);
    }

    spawnProjectile(origin, direction) {
        const geo = new THREE.SphereGeometry(0.06, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: 0xff0055 });
        const bullet = new THREE.Mesh(geo, mat);

        bullet.position.copy(origin);
        bullet.userData = {
            velocity: direction.multiplyScalar(0.7),
            life: 120
        };

        this.scene.add(bullet);
        this.projectiles.push(bullet);
    }

    spawnTarget() {
        const geo = new THREE.IcosahedronGeometry(0.4, 0);
        const mat = new THREE.MeshStandardMaterial({ 
            color: 0x00ffcc, 
            emissive: 0x004433,
            roughness: 0.2 
        });
        const target = new THREE.Mesh(geo, mat);

        const u = Math.random();
        const v = Math.random();
        const theta = u * 2.0 * Math.PI;
        const phi = Math.acos(2.0 * v - 1.0);
        const r = 6 + Math.random() * 4;

        target.position.set(
            r * Math.sin(phi) * Math.cos(theta),
            Math.max(0.5, r * Math.sin(phi) * Math.sin(theta)),
            r * Math.cos(phi)
        );

        this.scene.add(target);
        this.targets.push(target);
    }

    updateGame() {
        this.updateDesktopMovement();

        // Update Projectiles & Check Collisions
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.position.add(p.userData.velocity);
            p.userData.life--;

            for (let j = this.targets.length - 1; j >= 0; j--) {
                const t = this.targets[j];
                if (p.position.distanceTo(t.position) < 0.6) {
                    this.scene.remove(t);
                    this.targets.splice(j, 1);
                    
                    this.scene.remove(p);
                    this.projectiles.splice(i, 1);

                    this.score += 100;
                    document.getElementById('score').innerText = this.score;
                    break;
                }
            }

            if (p.userData.life <= 0 && this.projectiles.includes(p)) {
                this.scene.remove(p);
                this.projectiles.splice(i, 1);
            }
        }

        if (this.targets.length < 5 && Math.random() < 0.03) {
            this.spawnTarget();
        }
    }

    start() {
        this.renderer.setAnimationLoop(() => {
            this.updateGame();
            this.renderer.render(this.scene, this.camera);
        });
    }
}
