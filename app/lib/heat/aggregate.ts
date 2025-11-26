import { equivalentUWithoutGeometry } from '@/lib/heat/ground';

// Example adapters (you’ll already have your own loops):
function uForWallKnownU(w: any /* WallForm + area */) {
  const out = equivalentUWithoutGeometry({
    kind: 'wall',
    uKnown: w.uValue,
    area: w.area || 1, // placeholder until /room-elements wires area through
    includesGround: !!w.knownUGroundContact, // checkbox from the UI
  });
  return out.uEq;
}

function uForFloorKnownU(f: any /* FloorForm + area */) {
  const includes = f.construction === 'solid' ? !!f.groundContactAdjust : true;
  const out = equivalentUWithoutGeometry({
    kind: 'floor',
    uKnown: f.uValue,
    area: f.area || 1,
    includesGround: includes,
  });
  return out.uEq;
}
