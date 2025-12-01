export function updateNodePosition(node: any, nodeJson: any, isGeoActive: boolean): void {
  let posX = node.position().x;
  let posY = node.position().y;
  if (isGeoActive) {
    const origX = node.data('_origPosX');
    const origY = node.data('_origPosY');
    if (origX !== undefined && origY !== undefined) {
      posX = origX;
      posY = origY;
    }
  }
  nodeJson.position = { x: posX, y: posY };
}

export function handleGeoData(node: any, nodeJson: any, isGeoActive: boolean, layoutMgr?: any): void {
  const lat = node.data('lat');
  const lng = node.data('lng');
  if (lat !== undefined && lng !== undefined) {
    nodeJson.data = nodeJson.data || {};
    nodeJson.data.geoLayoutActive = !!isGeoActive;
    nodeJson.data.lat = lat.toString();
    nodeJson.data.lng = lng.toString();
    return;
  }
  if (isGeoActive && layoutMgr?.cytoscapeLeafletMap) {
    nodeJson.data = nodeJson.data || {};
    nodeJson.data.geoLayoutActive = true;
    const latlng = layoutMgr.cytoscapeLeafletMap.containerPointToLatLng({
      x: node.position().x,
      y: node.position().y
    });
    nodeJson.data.lat = latlng.lat.toString();
    nodeJson.data.lng = latlng.lng.toString();
  }
}
