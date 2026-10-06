// Pexels CDN helper — every photo is licensed under the Pexels License
// (free for commercial use, no attribution required). IDs map to pexels.com/photo/<id>.
export const px = (id, w = 1600, h) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=${w}${h ? `&h=${h}` : ''}`;

export const pxSet = (id, ratio) =>
  [640, 960, 1280, 1920, 2560].map((w) => `${px(id, w, ratio ? Math.round(w * ratio) : undefined)} ${w}w`).join(', ');

export const IMG = {
  hero: 34911458, // Urban construction site at dusk with crane — single dominant silhouette, open sky for headline
  craneStockholm: 26728561, // Giraffe crane in Stockholm
  towerCrane: 2323080, // Tower crane on building under construction
  earthworks: 1188532, // Aerial — heavy equipment
  scaffold: 2209529, // Men on scaffolding, facade renovation
  engineerTablet: 8961008, // Engineer with tablet on site
  bridgeCrew: 8961159, // People on concrete structure near bridge
  blueprintTeam: 29299826, // Architects reviewing blueprints outdoors
  blueprint: 3862135, // Engineers looking at blueprint
  nordhavn: 31122123, // Modern architecture, Nordhavn Copenhagen
  bjorvika: 20202778, // Modern buildings, Bjørvika Oslo
  oresund: 16576872, // Öresund bridge
  warehouse: 12069485, // Forklift outside a warehouse
  greenResidential: 17644158, // Green residential buildings, Jönköping
  malmo: 34010690, // Modern Scandinavian architectural detail, Malmö
  porsgrunn: 37344876, // Modern architectural corner, Porsgrunn
  concreteFacade: 7143883, // Facade of a concrete building
  square: 20105456, // People walking on square
  skylineDusk: 19660456, // Cranes in city skyline at dusk
  workersSunset: 13319079, // Silhouette of construction workers at sunset
  excavator: 13098128, // Excavator at construction site
  aerialLake: 29547677, // Aerial view of calm lake and lush forest at sunrise
  timberCourtyard: 29024993, // Modern urban courtyard with trees and ivy

  // Team portraits
  pVd: 32012999, // Professional headshot, confident businessman
  pProjektchef: 30767565, // Professional black & white portrait headshot
  pEkonomichef: 34381970, // Professional portrait of smiling businesswoman
  pPlatschef: 8961155, // Man in hard hat smiling, site context
  pHr: 30004322, // Professional headshot of smiling woman
  pAckvisition: 29852895, // Professional corporate headshot of smiling woman

  // Section hero banners
  processHero: 3862135, // Engineers looking at blueprint
  omOssHero: 2323080, // Tower crane on building under construction
  kontaktHero: 8961008, // Engineer with tablet on site
  projektHero: 1188532, // Aerial — heavy equipment
};
