// Pexels CDN helper — every photo is licensed under the Pexels License
// (free for commercial use, no attribution required). IDs map to pexels.com/photo/<id>.
export const px = (id, w = 1600, h) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=${w}${h ? `&h=${h}` : ''}`;

export const pxSet = (id, ratio) =>
  [640, 960, 1280, 1920, 2560].map((w) => `${px(id, w, ratio ? Math.round(w * ratio) : undefined)} ${w}w`).join(', ');

export const IMG = {
  hero: 17842832, // Electrician by an outdoor fuse box, safety gear, dramatic light
  fuseboxWork: 17924298, // Electrician working on a fusebox
  panelInspect: 7359568, // Electrician inspecting a fuse box
  multimeterPanel: 34054464, // Electrician diagnosing an electrical panel with a multimeter
  fixingBox: 14319099, // Man fixing an electric box
  evCharging: 9800009, // Electric car charging outdoors
  evChargingModern: 35736786, // Modern electric car charging at an outdoor station
  serverRack: 1054397, // Ethernet cables plugged into a server rack
  dataCenter: 5480781, // Server racks / network cabinet
  structuredCabling: 4508748, // Structured cabling system, many network cables
  smartHomeWall: 17536106, // Wall-mounted smart home control button

  // Generic Nordic architecture — reused for bostäder / företag / fastigheter imagery
  nordhavn: 31122123, // Modern architecture, Nordhavn Copenhagen
  bjorvika: 20202778, // Modern buildings, Bjørvika Oslo
  malmo: 34010690, // Modern Scandinavian architectural detail, Malmö
  concreteFacade: 7143883, // Facade of a concrete building
  greenResidential: 17644158, // Green residential buildings, Jönköping
  timberCourtyard: 29024993, // Modern urban courtyard with trees and ivy

  // Section hero banners
  tjansterHero: 17924298, // Electrician with fusebox
  omOssHero: 34054464, // Electrician diagnosing panel with multimeter
  kontaktHero: 7359568, // Electrician inspecting a fuse box
  omdomenHero: 14319099, // Man fixing an electric box
  processHero: 9800009, // Electric car charging outdoors
};
