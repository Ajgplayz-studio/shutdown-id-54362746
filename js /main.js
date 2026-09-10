import { SandboxEngine } from './engine.js';

window.addEventListener('DOMContentLoaded', () => {
    const sandbox = new SandboxEngine();
    sandbox.start();
});
