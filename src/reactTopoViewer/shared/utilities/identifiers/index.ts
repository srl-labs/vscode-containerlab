/**
 * Identifier utilities barrel file
 */

// ID utilities
export {
  generateDummyId,
  generateAdapterNodeId,
  generateSpecialNodeId,
  generateRegularNodeId,
  getUniqueId,
} from "../idUtils";

// Link types and utilities
export {
  STR_HOST,
  STR_MGMT_NET,
  PREFIX_MACVLAN,
  PREFIX_VXLAN,
  PREFIX_VXLAN_STITCH,
  PREFIX_DUMMY,
  PREFIX_BRIDGE,
  PREFIX_OVS_BRIDGE,
  TYPE_DUMMY,
  SINGLE_ENDPOINT_TYPES,
  VX_TYPES,
  HOSTY_TYPES,
  isSpecialEndpointId,
  isSpecialNodeOrBridge,
  splitEndpointLike,
} from "../LinkTypes";
