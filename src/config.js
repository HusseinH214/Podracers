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

export const CONTACT = {
  push: 9, // sideways speed given to each pod on contact
  speedFactor: 0.96, // both pods lose a little speed
  cooldown: 0.35, // per pair, so one bump isn't counted every frame
  stuns: false, // open question decided: pod-to-pod contact never stuns
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

export const CAMERA = {
  behind: 9.5,
  height: 3.6,
  lookAhead: 16,
  baseFov: 68,
  speedFov: 14, // extra FOV at top speed
  portraitFovBoost: 18,
  shakeOnStun: 0.6,
};
