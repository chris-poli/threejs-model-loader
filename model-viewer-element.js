// model-viewer element
// Loads and displays a 3D model

// Events
// model-change: Fires when a model is going to load
// model-loaded: Fires when all the geometry has been fully loaded
class ModelViewer extends HTMLElement {

    static get observedAttributes() {
        return ['src', 'display-shadow', 'ambient-color', 'show-grid'];
    }

    get loadingManager() {
        return this._loadingManager = this._loadingManager || new THREE.LoadingManager();
    }

    get modelLoader() {
        return this._modelLoader = this._modelLoader || new THREE.ModelLoader(this.loadingManager);
    }

    get src() { return this.getAttribute('src') || ''; }
    set src(val) { this.setAttribute('src', val); }

    get displayShadow() { return this.hasAttribute('display-shadow') || false; }
    set displayShadow(val) {
        val = !!val;
        val ? this.setAttribute('display-shadow', '') : this.removeAttribute('display-shadow');
    }

    get ambientColor() { return this.getAttribute('ambient-color') || '#455A64'; }
    set ambientColor(val) {
        val ? this.setAttribute('ambient-color', val) : this.removeAttribute('ambient-color');
    }

    get showGrid() { return this.hasAttribute('show-grid') || false; }
    set showGrid(val) {
        val ? this.setAttribute('show-grid', true) : this.removeAttribute('show-grid');
    }

    /* Lifecycle Functions */
    constructor() {
        super()

        // Scene setup
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
        camera.position.z = 10;

        const ambientLight = new THREE.AmbientLight(this.ambientColor);
        scene.add(ambientLight);

        // Light setup
        const dirLight = new THREE.DirectionalLight(0xffffff);
        dirLight.position.set(0, 10, 0);
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.castShadow = true;
        
        scene.add(dirLight);

        // Containers setup
        const scaleContainer = new THREE.Object3D();
        scene.add(scaleContainer);

        const rotator = new THREE.Object3D();
        scaleContainer.add( rotator );

        const plane = new THREE.Mesh(
            new THREE.PlaneGeometry(),
            new THREE.ShadowMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.25 })
        );
        plane.rotation.set(-Math.PI / 2, 0, 0);
        plane.scale.multiplyScalar(20);
        plane.receiveShadow = true;
        scaleContainer.add(plane);

        const gridHelper = new THREE.GridHelper(10, 10, 0xffffff, 0xeeeeee);
        gridHelper.material.transparent = true;
        gridHelper.material.opacity = 0.6;
        gridHelper.visible = false;
        scaleContainer.add(gridHelper);

        // Renderer setup
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setClearColor(0xffffff);
        renderer.setClearAlpha(0);
        renderer.shadowMap.enabled = true;

        // Controls setup
        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.rotateSpeed = 2.0;
        controls.zoomSpeed = 5;
        controls.panSpeed = 2;
        controls.enableZoom = true;
        controls.enablePan = true;
        controls.enableDamping = false;
        controls.maxDistance = 50;
        controls.minDistance = 0.25;
        controls.addEventListener('change', () => this._dirty = true);
        
        this.rotator = rotator;
        this.scaleContainer = scaleContainer;
        this.renderer = renderer;
        this.camera = camera;
        this.controls = controls;
        this.plane = plane;
        this.gridHelper = gridHelper;
        this.ambientLight = ambientLight;
        this._model = null;
        this._requestId = 0;

        const _do = () => {
            if(this.parentNode) {
                this.refresh();
                this.controls.update();
                if (this._dirty) {
                    this.renderer.render(scene, camera);
                    this._dirty = false;
                }
            }
            this._renderLoopId = requestAnimationFrame(_do);
        }
        _do();
    }

    connectedCallback() {
        // Add our initialize styles for the element if they haven't
        // been added yet
        if (!this.constructor._styletag) {
            const styletag = document.createElement('style');
            styletag.innerHTML =
            `
                ${this.tagName} { display: block; }
                ${this.tagName} canvas {
                    width: 100%;
                    height: 100%;
                }
            `;
            document.head.appendChild(styletag);
            this.constructor._styletag = styletag;
        }

        // add the renderer
        if (this.childElementCount === 0) {
            this.appendChild(this.renderer.domElement);
        }

        this.refresh();
        requestAnimationFrame(() => this.refresh());
    }

    disconnectedCallback() {
        cancelAnimationFrame(this._renderLoopId);
    }

    attributeChangedCallback(attr, oldval, newval) {
        this._dirty = true;

        switch(attr) {
            case 'src': {
                this._loadModel(this.src);
                break;
            }

            case 'ambient-color': {
                this.ambientLight.color.set(this.ambientColor);
                break;
            }

            case 'show-grid': {
                this.gridHelper.visible = this.showGrid;
                break;
            }
        }
    }

    /* Public API */
    refresh() {
        const r = this.renderer;
        const w = this.clientWidth;
        const h = this.clientHeight;
        const currsize = r.getSize();

        if (currsize.width != w || currsize.height != h) {
            this._dirty = true;

            r.setPixelRatio(window.devicePixelRatio);
            r.setSize(w, h, false);

            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
        }
    }

    /* Private Functions */ 
    _loadModel(src) {

        if (this._prevsrc === src) return;

        if (this._model) {
            this._model.parent.remove(this._model);
            this._model = null;
            this._dirty = true;
        }

        if (src) {    
            this._prevsrc = src;

            this.dispatchEvent(new CustomEvent('model-change', { bubbles: true, cancelable: true, composed: true, detail: src }));

            // Keep track of this request and make
            // sure it doesn't get overwritten by
            // a subsequent one
            this._requestId ++;
            const requestId = this._requestId;

            this.modelLoader
                .load(src, res => {
                    if (this._requestId !== requestId) return;

                    const mat = new THREE.MeshBasicMaterial( { color: 0xffffff } );
                    let obj = res.scene || res.object || res;
                    obj = obj.isBufferGeometry || obj.isGeometry ? new THREE.Mesh(obj, mat) : obj;

                    this._addModel(obj);

                    this.dispatchEvent(new CustomEvent('model-loaded', { bubbles: true, cancelable: true, composed: true }));
                }, null, err => {
                    this.dispatchEvent(new CustomEvent('error', { bubbles: true, cancelable: true, composed: true, detail: err }));
                });

        }
    }

    _addModel(obj) {
        const rotator = this.rotator;
        const scaleContainer = this.scaleContainer;
        const plane = this.plane;
        const gridHelper = this.gridHelper;

        this._model = obj;

        // Get the bounds of the model and scale and set appropriately
        obj.updateMatrixWorld( true );
        const box = new THREE.Box3().expandByObject( obj );
        const sphere = box.getBoundingSphere( new THREE.Sphere() );
        const s = 3 / sphere.radius;

        rotator.add( obj );
        rotator.rotation.set( 0, 0, 0 );
        obj.position
            .copy( sphere.center )
            .negate();

        scaleContainer.scale.set( 1, 1, 1 ).multiplyScalar( s );

        // add an additional tiny offset so the shadow plane won't
        // z-fight with the bottom of the model
        const offset = Math.abs(box.max.y - box.min.y) * 1e-5;
        plane.position.y = obj.position.y + box.min.y - offset;
        plane
            .scale
            .set( 1, 1, 1 )
            .multiplyScalar( 100 / s );

        gridHelper.position.copy(plane.position);
        gridHelper.position.y -= offset;

        // make sure the obj will cast shadows
        obj.traverse(c => {

            if ( 'castShadow' in c ) c.castShadow = true;

            if ( c instanceof THREE.Mesh ) {

                if ( c.material instanceof THREE.MeshBasicMaterial ) {

                    const mat = new THREE.MeshPhongMaterial({ color: 0x888888 });
                    if ( c.geometry instanceof THREE.BufferGeometry && 'color' in c.geometry.attributes
                        || c.geometry instanceof THREE.Geometry ) {

                        mat.vertexColors = THREE.VertexColors;

                    }

                    if ( c.geometry instanceof THREE.BufferGeometry && !( 'normal' in c.geometry.attributes )) {

                        c.geometry.computeVertexNormals();

                    }

                    c.material = mat;

                }

            }

        });

        this._dirty = true;

    }
}

window.ModelViewer = ModelViewer