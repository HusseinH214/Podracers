// Every tunable number lives here. Units: metres, seconds, m/s.
// Values are starting points for the milestone 9 playtest.

export const SIM_HZ = 60;
export const DT = 1 / SIM_HZ;

export const RACE = {
  timeLimit: 90,
  targetCleanTime: 70, // track length = targetCleanTime * POD.cruiseSpeed
  countdown: 3,
  startObstaclesAt: 260, // clear run-up after the start grid
  finishClearZone: 120, // no obstacles right before the line
  obstacleSeed: 1977,
};

// After crossing the line, each pod coasts a short way then warps out, so the
// pack never reaches the end of the run-out and piles up there.
export const OUTRO = {
  warpDistance: 150, // metres past the finish line before a pod warps out
  warpAnim: 0.35, // seconds for the shrink-and-burst warp effect
};

export const POD = {
  cruiseSpeed: 60,
  accel: 16, // forward acceleration back up to top speed
  halfWidth: 1.2, // used for walls and gap checks
  halfLength: 1.6,
  hitboxShrink: 0.75, // collision box vs. visible model: near misses feel fair
  maxLateralSpeed: 22,
  lateralAccel: 70, // ease steering in...
  lateralDecel: 85, // ...and out
  maxTiltDeg: 30, // visual bank angle cap
  hoverHeight: 1.3,
};

export const WALL = {
  scrapeDecel: 22, // m/s^2 lost while grinding a wall (slow only, no stun)
  bounce: 0.25, // fraction of sideways speed bounced back off a wall
};

export const STUN = {
  speedFactor: 0.35, // speed multiplied by this on a terrain hit
  duration: 0.9, // no steering, no acceleration
  invulnerable: 1.4, // after the stun ends, terrain hits are ignored
};

// Player-only, single-use boost. One pickup sits in a tight gap in the second
// half of the course. Sized to win back roughly one rock crash (~90 m), see README.
export const BOOST = {
  pickupFrom: 0.5, // pickup placed between these fractions of the course...
  pickupTo: 0.75,
  minGap: 1.25, // ...in the narrowest optional gap between obstacles at least this wide
  // (pod-centre metres at full visual size; the real hitbox leaves ~1 m more)
  pickupRadius: 1.2, // sideways distance from the pickup centre that still collects it
  duration: 3, // seconds of boosted top speed
  speedMult: 1.35, // top speed multiplier while boosting
  kick: 1.1, // on use, speed jumps to at least this x top speed
  accel: 40, // forward acceleration while boosting (normal is POD.accel)
  // While boosting the pod is shielded from rocks: rows are only spaced to be
  // dodgeable at normal top speed, so boosting into one would be unfair.
};

export const CONTACT = {
  push: 9, // sideways speed given to each pod on contact
  speedFactor: 0.96, // both pods lose a little speed
  cooldown: 0.35, // per pair, so one bump isn't counted every frame
  stuns: false, // open question decided: pod-to-pod contact never stuns
  startGrace: 5, // seconds after GO where pods pass through each other (ends before the first rocks)
};

export const RUBBER_BAND = {
  deadZone: 35, // metres either side of the player with no effect
  range: 400, // full effect reached this far away
  maxSlow: 0.05, // bots far ahead lose up to 5% top speed
  maxBoost: 0.04, // bots far behind gain up to 4%
};

export const BOTS = [
  {
    name: 'VEX',
    personality: 'Racer',
    color: 0xe0503a,
    topSpeed: 1.03, // multiplier of POD.cruiseSpeed
    lookAhead: 42,
    mistakeRate: 0.16,
    gapMargin: 0.25, // how close to the rock edge it is willing to cut
    lateralSkill: 0.95,
  },
  {
    name: 'OLLA',
    personality: 'Steady',
    color: 0x48b4e0,
    topSpeed: 0.975,
    lookAhead: 95,
    mistakeRate: 0.04,
    gapMargin: 1.2,
    lateralSkill: 1.0,
  },
  {
    name: 'KRAGG',
    personality: 'Bully',
    color: 0x8fd14f,
    topSpeed: 0.985,
    lookAhead: 65,
    mistakeRate: 0.09,
    gapMargin: 0.7,
    lateralSkill: 1.0,
    bully: true,
  },
];

export const PLAYER_COLOR = 0xf2b33d;

// Bot name tags fade out as their pod nears the camera so they don't cover the
// view. Distances are camera-to-pod; the camera sits ~10 m behind the player.
export const NAME_TAG = {
  hideWithin: 16, // fully hidden this close (a bot alongside or just ahead of you)
  showBeyond: 26, // fully shown this far out
};

export const CAMERA = {
  behind: 9.5,
  height: 3.6,
  lookAhead: 16,
  baseFov: 68,
  speedFov: 14, // extra FOV at top speed
  boostFov: 10, // extra FOV while boosting
  portraitFovBoost: 18,
  shakeOnStun: 0.6,
};
