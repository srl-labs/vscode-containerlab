(function () {
    'use strict';
    const $$find = function (arr, predicate) {
        if (typeof predicate !== 'function') {
            throw new TypeError('predicate must be a function');
        }
        const length = arr.length >>> 0;
        const thisArg = arguments[1];
        let value;
        for (let i = 0; i < length; i++) {
            value = arr[i];
            if (predicate.call(thisArg, value, i, arr)) {
                return value;
            }
        }
        return undefined;
    };
    class LabelElement {
        constructor({ node, position = null, data = null, _cy }, params) {
            this._params = params;
            this.updateParams(params);
            this._node = node;
            this._cy = _cy;
            this.initStyles(params.cssClass);
            if (data) {
                this.updateData(data);
            }
            if (position && data['source'] && data['target']) {
                this.updateEdgePosition(position, data.id);
            }
            else if (position) {
                this.updatePosition(position);
            }
        }
        updateParams({ tpl = () => '', cssClass = null, halign = 'center', valign = 'center', halignBox = 'center', valignBox = 'center', }) {
            const _align = {
                top: -0.5,
                left: -0.5,
                center: 0,
                right: 0.5,
                bottom: 0.5,
            };
            this._align = [
                _align[halign],
                _align[valign],
                100 * (_align[halignBox] - 0.5),
                100 * (_align[valignBox] - 0.5),
            ];
            this.tpl = tpl;
            if (this._params.edgehtmlTiltPoint1 == undefined) {
                this._params.edgehtmlTiltPoint1 = 'sourceNode';
            }
            if (this._params.edgehtmlTiltPoint2 == undefined) {
                this._params.edgehtmlTiltPoint2 = 'targetNode';
            }
        }
        updateData(data) {
            while (this._node.firstChild) {
                this._node.removeChild(this._node.firstChild);
            }
            const children = new DOMParser().parseFromString(this.tpl(data), 'text/html').body.children;
            for (let i = 0; i < children.length; ++i) {
                const el = children[i];
                this._node.appendChild(el);
            }
        }
        getNode() {
            return this._node;
        }
        updatePosition(pos) {
            this._renderPosition(pos);
        }
        updateEdgePosition(pos, id) {
            this._renderEdgePosition(pos, id);
        }
        initStyles(cssClass) {
            const stl = this._node.style;
            stl.position = 'absolute';
            if (cssClass && cssClass.length) {
                this._node.classList.add(cssClass);
            }
        }
        _renderPosition(position) {
            const prev = this._position;
            const x = position.x + this._align[0] * position.w;
            const y = position.y + this._align[1] * position.h;
            if (!prev || prev[0] !== x || prev[1] !== y) {
                this._position = [x, y];
                const valRel = `translate(${this._align[2]}%,${this._align[3]}%) `;
                const valAbs = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) `;
                const val = valRel + valAbs;
                const stl = this._node.style;
                stl.webkitTransform = val;
                stl.msTransform = val;
                stl.transform = val;
            }
        }
        _renderEdgePosition(position, id) {
            const edge = this._cy.$('#' + id);
            const cp = edge.controlPoints();
            let p1;
            let p2;
            if (cp?.length &&
                this._params?.edgehtmlTiltPoint1 != undefined &&
                typeof this._params.edgehtmlTiltPoint1 == 'number') {
                try {
                    p1 = cp[this._params.edgehtmlTiltPoint1];
                }
                catch (error) {
                    console.error('edgehtmlTiltPoint1 is not a valid control point number');
                }
            }
            else if (this._params?.edgehtmlTiltPoint1 != undefined &&
                this._params.edgehtmlTiltPoint1 == 'targetNode') {
                p1 = edge.targetEndpoint();
            }
            else {
                p1 = edge.sourceEndpoint();
            }
            if (cp?.length &&
                this._params?.edgehtmlTiltPoint2 != undefined &&
                typeof this._params.edgehtmlTiltPoint2 == 'number') {
                try {
                    p2 = cp[this._params.edgehtmlTiltPoint2];
                }
                catch (error) {
                    console.error('edgehtmlTiltPoint2 is not a valid control point number');
                }
            }
            else if (this._params?.edgehtmlTiltPoint2 != undefined &&
                this._params.edgehtmlTiltPoint2 == 'sourceNode') {
                p2 = edge.sourceEndpoint();
            }
            else {
                p2 = edge.targetEndpoint();
            }
            var angleDeg = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
            if (angleDeg > 90) {
                angleDeg = -90 + (angleDeg - 90);
            }
            else if (angleDeg < -90) {
                angleDeg = 90 + (angleDeg + 90);
            }
            const prev = this._position;
            const x = position.x + this._align[0] * position.w;
            const y = position.y + this._align[1] * position.h;
            let display = 'none';
            if (!prev || prev[0] !== x || prev[1] !== y) {
                this._position = [x, y];
                if (x == 0 || y == 0) {
                    display = 'none';
                }
                else {
                    display = 'block';
                }
                const valRel = `translate(${this._align[2]}%,${this._align[3]}%) `;
                const valAbs = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) `;
                const val = valRel + valAbs + `rotate(${angleDeg}deg)`;
                const stl = this._node.style;
                stl.webkitTransform = val;
                stl.msTransform = val;
                stl.transform = val;
                stl.display = display;
            }
        }
    }
    class LabelContainer {
        constructor(node, _cy) {
            this._node = node;
            this._elements = {};
            this._cy = _cy;
        }
        addOrUpdateElem(id, param, payload = {}, _cy, type) {
            const cur = this._elements[id];
            if (cur) {
                this._param = param;
                cur.updateParams(param);
                cur.updateData(payload.data);
                if (type == 'node') {
                    cur.updatePosition(payload.position);
                }
                else {
                    cur.updateEdgePosition(payload.position, id);
                }
                const startEvent = new Event('start');
                document.dispatchEvent(startEvent);
            }
            else {
                const nodeElem = document.createElement('div');
                var observer = new MutationObserver(function (mutations) {
                    if (document.contains(nodeElem)) {
                        const cyNode = _cy.nodes(`#${nodeElem.children[0].id.split(':')[1]}`);
                        cyNode.data('htmlNode', nodeElem);
                        try {
                            cyNode.style({
                                width: nodeElem.offsetWidth / 0.6,
                                height: nodeElem.offsetHeight / 0.6,
                            });
                        }
                        catch (err) {
                            console.warn('cytoscape.js-html-node: unable to create html label', err);
                        }
                        observer.disconnect();
                    }
                });
                observer.observe(document, {
                    attributes: false,
                    childList: true,
                    characterData: false,
                    subtree: true,
                });
                this._node.appendChild(nodeElem);
                this._elements[id] = new LabelElement({
                    node: nodeElem,
                    data: payload.data,
                    position: payload.position,
                    _cy: _cy,
                }, param);
            }
        }
        removeElemById(id) {
            if (this._elements[id]) {
                this._node.removeChild(this._elements[id].getNode());
                delete this._elements[id];
            }
        }
        updateElemPosition(id, position) {
            const node = this._cy.$('#' + id);
            let isEdge = false;
            if (node.length) {
                isEdge = node.isEdge() ? true : false;
            }
            const ele = this._elements[id];
            if (ele && isEdge) {
                ele.updateEdgePosition(position, id);
            }
            else if (ele) {
                ele.updatePosition(position);
            }
        }
        updatePanZoom({ pan, zoom, }) {
            const val = `translate(${pan.x}px,${pan.y}px) scale(${zoom})`;
            const stl = this._node.style;
            const origin = 'top left';
            stl.webkitTransform = val;
            stl.msTransform = val;
            stl.transform = val;
            stl.webkitTransformOrigin = origin;
            stl.msTransformOrigin = origin;
            stl.transformOrigin = origin;
        }
    }
    function cyNodeHtmlLabel(_cy, params, options) {
        const _params = !params || typeof params !== 'object' ? [] : params;
        const _lc = createLabelContainer();
        _cy.one('render', (e) => {
            createNodesCyHandler(e);
            wrapCyHandler(e);
        });
        _cy.on('add', (e) => {
            addCyHandler(e, _cy);
        });
        _cy.on('layoutstop', layoutstopHandler);
        _cy.on('remove', removeCyHandler);
        _cy.on('data', (e) => updateDataOrStyleCyHandler(e, _cy));
        _cy.on('style', (e) => updateDataOrStyleCyHandler(e, _cy));
        _cy.on('pan zoom', wrapCyHandler);
        _cy.on('position bounds', moveCyHandler);
        return _cy;
        function createLabelContainer() {
            const _cyContainer = _cy.container();
            const _titlesContainer = document.createElement('div');
            const _cyCanvas = _cyContainer.querySelector('canvas');
            const cur = _cyContainer.querySelector("[class^='cy-node-html']");
            if (cur) {
                _cyCanvas.parentNode.removeChild(cur);
            }
            const stl = _titlesContainer.style;
            stl.position = 'absolute';
            stl['z-index'] = 9;
            stl.width = '500px';
            stl.margin = '0px';
            stl.padding = '0px';
            stl.border = '0px';
            stl.outline = '0px';
            stl.outline = '0px';
            if (options && options.enablePointerEvents !== true) {
                stl['pointer-events'] = 'none';
            }
            _cyCanvas.parentNode.appendChild(_titlesContainer);
            return new LabelContainer(_titlesContainer, _cy);
        }
        function createNodesCyHandler({ cy }) {
            _params.forEach((x) => {
                cy.elements(x.query).forEach((d) => {
                    if (d.isNode()) {
                        _lc.addOrUpdateElem(d.id(), x, {
                            position: getNodePosition(d),
                            data: d.data(),
                        }, cy, 'node');
                    }
                    else if (d.isEdge()) {
                        _lc.addOrUpdateElem(d.id(), x, {
                            position: getEdgePosition(d),
                            data: d.data(),
                        }, cy, 'edge');
                    }
                });
            });
        }
        function addCyHandler(ev, _cy) {
            const target = ev.target;
            const param = $$find(_params.slice().reverse(), (x) => target.is(x.query));
            if (param) {
                if (target.isNode()) {
                    _lc.addOrUpdateElem(target.id(), param, {
                        position: getNodePosition(target),
                        data: target.data(),
                    }, _cy, 'node');
                }
                else if (target.isEdge()) {
                    _lc.addOrUpdateElem(target.id(), param, {
                        position: getEdgePosition(target),
                        data: target.data(),
                    }, _cy, 'edge');
                }
            }
        }
        function layoutstopHandler({ cy }) {
            _params.forEach((x) => {
                cy.elements(x.query).forEach((d) => {
                    if (d.isNode()) {
                        _lc.updateElemPosition(d.id(), getNodePosition(d));
                    }
                    else if (d.isEdge()) {
                        _lc.updateElemPosition(d.id(), getEdgePosition(d));
                    }
                });
            });
        }
        function removeCyHandler(ev) {
            _lc.removeElemById(ev.target.id());
        }
        function moveCyHandler(ev) {
            _lc.updateElemPosition(ev.target.id(), getNodePosition(ev.target));
            const edgesConnected = _cy.$('#' + ev.target.id()).connectedEdges();
            if (edgesConnected.length > 0) {
                edgesConnected.forEach((e) => {
                    _lc.updateElemPosition(e.id(), getEdgePosition(e));
                });
            }
        }
        function updateDataOrStyleCyHandler(ev, _cy) {
            const target = ev.target;
            const param = $$find(_params.slice().reverse(), (x) => target.is(x.query));
            if (param && !target.removed()) {
                if (target.isNode()) {
                    _lc.addOrUpdateElem(target.id(), param, {
                        position: getNodePosition(target),
                        data: target.data(),
                    }, _cy, 'node');
                }
                else if (target.isEdge()) {
                    _lc.addOrUpdateElem(target.id(), param, {
                        position: getEdgePosition(target),
                        data: target.data(),
                    }, _cy, 'edge');
                }
            }
            else {
                _lc.removeElemById(target.id());
            }
        }
        function wrapCyHandler({ cy }) {
            _lc.updatePanZoom({
                pan: cy.pan(),
                zoom: cy.zoom(),
            });
        }
        function getNodePosition(node) {
            return {
                w: node.width(),
                h: node.height(),
                x: node.position('x'),
                y: node.position('y'),
            };
        }
        function getEdgePosition(edge) {
            let obj;
            if (params && params[0]?.edgehtmlLocation) {
                if (params[0]?.edgehtmlLocation == 'start') {
                    obj = {
                        w: edge.width(),
                        h: edge.height(),
                        x: edge.sourceEndpoint().x,
                        y: edge.sourceEndpoint().y,
                    };
                }
                else if (params[0]?.edgehtmlLocation == 'end') {
                    obj = {
                        w: edge.width(),
                        h: edge.height(),
                        x: edge.targetEndpoint().x,
                        y: edge.targetEndpoint().y,
                    };
                }
                else {
                    obj = {
                        w: edge.width(),
                        h: edge.height(),
                        x: edge.midpoint().x,
                        y: edge.midpoint().y,
                    };
                }
            }
            else {
                obj = {
                    w: edge.width(),
                    h: edge.height(),
                    x: edge.midpoint().x,
                    y: edge.midpoint().y,
                };
            }
            return obj;
        }
    }
    const register = function (cy) {
        if (!cy) {
            return;
        }
        cy('core', 'nodeHtmlLabel', function (optArr, options) {
            return cyNodeHtmlLabel(this, optArr, options);
        });
    };
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = function (cy) {
            register(cy);
        };
    }
    else {
        if (typeof define !== 'undefined' && define.amd) {
            define('cytoscape-nodeHtmlLabel', function () {
                return register;
            });
        }
    }
    if (typeof cytoscape !== 'undefined') {
        register(cytoscape);
    }
})();
//# sourceMappingURL=cytoscape-node-edge-html-label.js.map