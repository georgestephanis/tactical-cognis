// Mathhammer Calculation Engine for WH40k

export interface TargetProfile {
  name: string;
  t: number;      // Toughness
  sv: number;     // Save (e.g. 3 for 3+)
  inv: number | null; // Invulnerable Save (e.g. 4 for 4++, null if none)
  w: number;      // Wounds per model
  fnp: number | null; // Feel No Pain (e.g. 6 for 6+, null if none)
  keywords: string[];
  unitSize: number;

  // 11th Edition / Advanced Target Modifiers (Optional)
  cover?: boolean;
  invMelee?: number | null;
  invRanged?: number | null;
  apReduction?: number; // e.g. 1 for Armor of Contempt
  hitPenalty?: number;  // e.g. 1 for -1 to hit
  woundPenalty?: number; // e.g. 1 for -1 to wound
  noHitReRolls?: boolean;
  noWoundReRolls?: boolean;
  transhuman?: boolean; // unmodified wound roll of 1-3 always fails
  damageReduction?: number; // e.g. 1 for -1 damage, minimum 1
  halveDamage?: boolean; // halves damage, rounding up
  mwFnp?: number | null; // Feel No Pain against Mortal Wounds (e.g. 4 for 4+)
}

export interface MathhammerInput {
  attacks: string;      // number or dice formula (e.g. '5', 'D6', '2D6+3')
  bsWs: number;         // BS/WS target (e.g. 3 for 3+)
  strength: number;
  ap: number;           // AP (e.g. -1, -2 - entered as absolute number or negative)
  damage: string;       // number or dice formula (e.g. '2', 'D3', 'D6')
  
  // Special Weapon Rules
  torrent: boolean;
  twinLinked: boolean;
  lethalHits: boolean;
  sustainedHits: number; // 0 if none, or X for Sustained Hits X
  devastatingWounds: boolean;
  blast: boolean;
  
  // Custom modifiers
  hitReRoll: 'none' | 'ones' | 'all';
  woundReRoll: 'none' | 'ones' | 'all';
  plusToHit: number;     // e.g. +1
  plusToWound: number;   // e.g. +1
  antiKeyword: string;   // e.g. 'INFANTRY'
  antiValue: number;     // Y+ trigger (e.g. 4 for 4+, 0 if none)

  // 11th Edition / Advanced Attacker Settings (Optional)
  isMelee?: boolean;
  ignoresCover?: boolean;
  ignoresHitPenalties?: boolean;
  ignoresWoundPenalties?: boolean;
  critHitThreshold?: number; // defaults to 6
  critWoundThreshold?: number; // defaults to 6
  indirectFire?: boolean;
  snapShots?: boolean;
  melta?: number;        // e.g. 2 for Melta 2
  flatMortals?: number;  // flat mortals generated per attack
}

export interface MathhammerResult {
  expectedAttacks: number;
  expectedHits: number;
  expectedWounds: number;
  expectedUnsaved: number;
  rawDamage: number;
  effectiveDamage: number;
  casualties: number;
  lethalWounds: number; // auto-wounds that skipped wound roll
  devastatingWoundsCount: number; // wounds that bypassed saves
}

// Target Presets
export const TARGET_PRESETS: TargetProfile[] = [
  {
    name: 'GEQ (Light Infantry Equivalent)',
    t: 3,
    sv: 5,
    inv: null,
    w: 1,
    fnp: null,
    keywords: ['INFANTRY'],
    unitSize: 10
  },
  {
    name: 'MEQ (Medium Infantry Equivalent)',
    t: 4,
    sv: 3,
    inv: null,
    w: 2,
    fnp: null,
    keywords: ['INFANTRY'],
    unitSize: 5
  },
  {
    name: 'TEQ (Heavy Infantry Equivalent)',
    t: 5,
    sv: 2,
    inv: 4, // 4++ Invuln
    w: 3,
    fnp: null,
    keywords: ['INFANTRY'],
    unitSize: 5
  },
  {
    name: 'VEQ (Medium Vehicle Equivalent)',
    t: 10,
    sv: 3,
    inv: null,
    w: 12,
    fnp: null,
    keywords: ['VEHICLE'],
    unitSize: 1
  },
  {
    name: 'HEAVY (Heavy Vehicle / Monster)',
    t: 12,
    sv: 2,
    inv: null,
    w: 16,
    fnp: null,
    keywords: ['VEHICLE', 'MONSTER'],
    unitSize: 1
  }
];

// Helper to parse dice strings to average values
export function parseDiceAverage(expr: string): number {
  if (!expr) return 0;
  
  const clean = expr.toUpperCase().replace(/\s+/g, '');
  
  // Single number
  if (/^\d+$/.test(clean)) {
    return parseInt(clean, 10);
  }

  // Parse dice formula: e.g. D6, 2D6, D3, D6+2, 2D6+3
  const diceRegex = /^(\d*)D(\d+)([+-]\d+)?$/;
  const match = clean.match(diceRegex);
  
  if (match) {
    const numDice = match[1] ? parseInt(match[1], 10) : 1;
    const diceType = parseInt(match[2], 10);
    const modifier = match[3] ? parseInt(match[3], 10) : 0;
    
    // Average of a Dn die is (n + 1) / 2
    const diceAverage = (diceType + 1) / 2;
    return (numDice * diceAverage) + modifier;
  }
  
  // Try fallback parse float
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 1 : parsed;
}

export interface RollOutcome {
  value: number;
  probability: number;
}

// Generate the exact sum outcome distribution for dice expressions
export function getDiceDistribution(expr: string): RollOutcome[] {
  if (!expr) return [{ value: 0, probability: 1.0 }];
  
  const clean = expr.toUpperCase().replace(/\s+/g, '');
  
  // Single number
  if (/^\d+$/.test(clean)) {
    return [{ value: parseInt(clean, 10), probability: 1.0 }];
  }
  
  const diceRegex = /^(\d*)D(\d+)([+-]\d+)?$/;
  const match = clean.match(diceRegex);
  
  if (match) {
    const numDice = match[1] ? parseInt(match[1], 10) : 1;
    const diceType = parseInt(match[2], 10);
    const modifier = match[3] ? parseInt(match[3], 10) : 0;
    
    let distribution = new Map<number, number>();
    distribution.set(0, 1.0);
    
    for (let d = 0; d < numDice; d++) {
      const nextDist = new Map<number, number>();
      for (const [sum, prob] of distribution.entries()) {
        for (let roll = 1; roll <= diceType; roll++) {
          const newSum = sum + roll;
          const currentProb = nextDist.get(newSum) || 0;
          nextDist.set(newSum, currentProb + (prob / diceType));
        }
      }
      distribution = nextDist;
    }
    
    const outcomes: RollOutcome[] = [];
    for (const [sum, prob] of distribution.entries()) {
      outcomes.push({
        value: Math.max(0, sum + modifier),
        probability: prob
      });
    }
    return outcomes;
  }
  
  const parsed = parseFloat(clean);
  return [{ value: isNaN(parsed) ? 1 : parsed, probability: 1.0 }];
}

function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let res = 1;
  for (let i = 1; i <= k; i++) {
    res = res * (n - i + 1) / i;
  }
  return res;
}

function binomialProbability(n: number, k: number, p: number): number {
  return comb(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
}

// Expected capped damage for a single attack after FNP, capped at target wounds W
export function expectedFlatDamageAfterFnp(d: number, W: number, fnpFailChance: number): number {
  if (fnpFailChance >= 1.0) {
    return Math.min(d, W);
  }
  
  let expectedDamage = 0;
  for (let k = 0; k <= d; k++) {
    const prob = binomialProbability(d, k, fnpFailChance);
    const dmg = Math.min(k, W);
    expectedDamage += prob * dmg;
  }
  return expectedDamage;
}

// Expected damage of a damage expression under FNP, halving, damage reduction, and steady state caps
export function getExpectedDamageForExpression(
  damageExpr: string,
  targetWounds: number,
  fnpFailChance: number,
  halveDamage: boolean,
  damageReduction: number,
  meltaValue: number = 0
): number {
  const outcomes = getDiceDistribution(damageExpr);
  let totalExpectedDamage = 0;
  
  for (const outcome of outcomes) {
    let baseDmg = outcome.value + meltaValue;
    
    if (halveDamage) {
      baseDmg = Math.ceil(baseDmg / 2);
    }
    
    if (damageReduction > 0) {
      baseDmg = Math.max(1, baseDmg - damageReduction);
    }
    
    let expectedDmg: number;
    if (fnpFailChance >= 1.0) {
      // No FNP: cap by target model wounds, accounting for steady-state wastage over multiple attacks
      const bk = targetWounds / Math.ceil(targetWounds / baseDmg);
      expectedDmg = bk;
    } else {
      // With FNP: we replicate the reference spreadsheet's cap and heuristic logic
      const bk = targetWounds / Math.ceil(targetWounds / baseDmg);
      const bn = expectedFlatDamageAfterFnp(baseDmg, targetWounds, fnpFailChance);
      
      // bl is the probability of a one-shot kill
      let bl = 0;
      for (let k = targetWounds; k <= baseDmg; k++) {
        bl += binomialProbability(baseDmg, k, fnpFailChance);
      }
      bl = Math.min(1.0, bl);
      
      const bm = bl === 1.0 ? targetWounds : (bl < 0.1 ? targetWounds / 2 : bl * targetWounds + (1 - bl) * targetWounds / 2);
      
      const bo = Math.min(targetWounds, baseDmg * fnpFailChance);
      const c = Math.max(0, baseDmg * fnpFailChance - targetWounds);
      
      expectedDmg = Math.max(Math.min(bk, bn, bm), bo - c);
    }
    
    totalExpectedDamage += outcome.probability * expectedDmg;
  }
  
  return totalExpectedDamage;
}

export function calculateExpectedDamage(
  input: MathhammerInput,
  target: TargetProfile
): MathhammerResult {
  // --- Target Fallback Options ---
  const cover = target.cover || false;
  const invMelee = target.invMelee || null;
  const invRanged = target.invRanged || null;
  const apReduction = target.apReduction || 0;
  const hitPenalty = target.hitPenalty || 0;
  const woundPenalty = target.woundPenalty || 0;
  const noHitReRolls = target.noHitReRolls || false;
  const noWoundReRolls = target.noWoundReRolls || false;
  const transhuman = target.transhuman || false;
  const damageReduction = target.damageReduction || 0;
  const halveDamage = target.halveDamage || false;
  const mwFnp = target.mwFnp || null;
  const fnpVal = target.fnp || null;

  // --- Attacker Fallback Options ---
  const critHitThreshold = input.critHitThreshold || 6;
  const critWoundThreshold = input.critWoundThreshold || 6;
  const ignoresCover = input.ignoresCover || false;
  const ignoresHitPenalties = input.ignoresHitPenalties || false;
  const ignoresWoundPenalties = input.ignoresWoundPenalties || false;
  const isMelee = input.isMelee || false;
  const indirectFire = input.indirectFire || false;
  const snapShots = input.snapShots || false;
  const melta = input.melta || 0;
  const flatMortals = input.flatMortals || 0;

  // 1. Calculate Average Attacks
  let baseAttacks = parseDiceAverage(input.attacks);
  
  // Apply Blast: +1 attack per 5 models in the target unit
  if (input.blast && target.unitSize > 0) {
    baseAttacks += Math.floor(target.unitSize / 5);
  }

  // 2. Resolve Hits
  let expectedHits: number;
  let lethalWounds: number; // Hits that auto-wound due to Lethal Hits
  
  if (input.torrent) {
    // Torrent auto-hits
    expectedHits = baseAttacks;
    lethalWounds = 0;
  } else {
    // Normal hit roll
    let baseBs = input.bsWs;

    // Apply Cover BS Penalty (11th Edition rules: Cover worsens shooter's BS by 1)
    if (cover && !ignoresCover && !isMelee) {
      baseBs = baseBs + 1;
    }

    // Apply Hit Modifier and Capping
    const plusToHit = input.plusToHit || 0;
    const finalHitPenalty = ignoresHitPenalties ? 0 : hitPenalty;
    const totalHitMod = plusToHit - finalHitPenalty;
    const cappedHitMod = Math.max(-1, Math.min(1, totalHitMod));

    let finalHitTarget = baseBs - cappedHitMod;
    finalHitTarget = Math.max(2, Math.min(6, finalHitTarget));

    let hitChance = (7 - finalHitTarget) / 6;
    let critHitChance = (7 - critHitThreshold) / 6;
    critHitChance = Math.min(hitChance, critHitChance);

    // Apply Snap Shots / Indirect caps
    if (snapShots) {
      hitChance = 1 / 6;
      critHitChance = Math.min(1 / 6, critHitChance);
    } else if (indirectFire) {
      // Indirect Fire caps hit roll to maximum 4+ (3/6 chance)
      hitChance = Math.min(3 / 6, hitChance);
      critHitChance = Math.min(hitChance, critHitChance);
    }

    // Apply Re-rolls to hit
    if (!noHitReRolls) {
      if (input.hitReRoll === 'ones') {
        hitChance += (1 / 6) * hitChance;
        critHitChance += (1 / 6) * ((7 - critHitThreshold) / 6);
      } else if (input.hitReRoll === 'all') {
        hitChance += (1 - hitChance) * hitChance;
        critHitChance += (1 - hitChance) * ((7 - critHitThreshold) / 6);
      }
    }

    critHitChance = Math.min(hitChance, critHitChance);
    const normalHitChance = Math.max(0, hitChance - critHitChance);

    const normalHits = baseAttacks * normalHitChance;
    const critHits = baseAttacks * critHitChance;

    if (input.lethalHits) {
      lethalWounds = critHits;
      expectedHits = normalHits;
      if (input.sustainedHits > 0) {
        expectedHits += critHits * input.sustainedHits;
      }
    } else {
      lethalWounds = 0;
      expectedHits = normalHits + critHits;
      if (input.sustainedHits > 0) {
        expectedHits += critHits * input.sustainedHits;
      }
    }
  }

  // 3. Resolve Wounds
  // Determine base wound roll required
  let baseWoundReq: number;
  if (input.strength >= target.t * 2) {
    baseWoundReq = 2;
  } else if (input.strength > target.t) {
    baseWoundReq = 3;
  } else if (input.strength === target.t) {
    baseWoundReq = 4;
  } else if (input.strength <= target.t / 2) {
    baseWoundReq = 6;
  } else {
    baseWoundReq = 5;
  }

  // Apply modifiers (+1 / -1 to wound)
  const plusToWound = input.plusToWound || 0;
  const finalWoundPenalty = ignoresWoundPenalties ? 0 : woundPenalty;
  const totalWoundMod = plusToWound - finalWoundPenalty;
  const cappedWoundMod = Math.max(-1, Math.min(1, totalWoundMod));

  let modifiedWoundTarget = baseWoundReq - cappedWoundMod;
  if (transhuman) {
    modifiedWoundTarget = Math.max(4, modifiedWoundTarget); // 1-3 always fails
  }
  const finalWoundTarget = Math.max(2, Math.min(6, modifiedWoundTarget));

  // Determine critical wound threshold (Anti-X keyword checks)
  let antiThreshold = critWoundThreshold;
  if (input.antiValue > 0 && target.keywords.some(k => k.toUpperCase() === input.antiKeyword.toUpperCase())) {
    antiThreshold = input.antiValue;
  }

  let woundChance = (7 - finalWoundTarget) / 6;
  let critWoundChance = (7 - antiThreshold) / 6;
  critWoundChance = Math.min(woundChance, critWoundChance);

  // Apply Re-rolls to wound (Twin-linked is equivalent to 'all' failed rolls)
  const isTwinLinked = (input.twinLinked || input.woundReRoll === 'all') && !noWoundReRolls;
  const isReRollOnes = input.woundReRoll === 'ones' && !noWoundReRolls;

  if (isReRollOnes) {
    woundChance += (1 / 6) * woundChance;
    critWoundChance += (1 / 6) * ((7 - antiThreshold) / 6);
  } else if (isTwinLinked) {
    woundChance += (1 - woundChance) * woundChance;
    critWoundChance += (1 - woundChance) * ((7 - antiThreshold) / 6);
  }

  critWoundChance = Math.min(woundChance, critWoundChance);
  const normalWoundChance = Math.max(0, woundChance - critWoundChance);

  const normalWounds = expectedHits * normalWoundChance;
  const critWounds = expectedHits * critWoundChance;

  let devastatingWoundsCount: number;
  let savePool: number;

  if (input.devastatingWounds) {
    // Critical wounds bypass saves (11th Edition Devastating Wounds: no spillover, bypasses saves, MW FNP applies)
    devastatingWoundsCount = critWounds;
    savePool = normalWounds + lethalWounds;
  } else {
    devastatingWoundsCount = 0;
    savePool = normalWounds + critWounds + lethalWounds;
  }

  // 4. Saving Throws
  // Determine AP: treating AP as positive modifier to target's Save (AP reduction applies)
  const modifiedAp = Math.min(0, input.ap + apReduction);
  const saveTarget = target.sv - modifiedAp;
  
  const bestInvul = isMelee ? (invMelee || target.inv) : (invRanged || target.inv);
  const bestSave = bestInvul !== null ? Math.min(saveTarget, bestInvul) : saveTarget;

  // Save roll chance (1s always fail)
  const saveSuccessChance = bestSave > 6 ? 0 : Math.min(5 / 6, (7 - bestSave) / 6);
  const saveFailChance = 1 - saveSuccessChance;

  const failedSaves = savePool * saveFailChance;

  // 5. Feel No Pain (FNP)
  let fnpFailChance = 1.0;
  if (fnpVal !== null) {
    fnpFailChance = 1.0 - (7 - fnpVal) / 6;
  }

  let mwFnpFailChance = fnpFailChance;
  if (mwFnp !== null) {
    mwFnpFailChance = Math.min(fnpFailChance, 1.0 - (7 - mwFnp) / 6);
  }

  // 6. Damage Calculations using Capped Binomial Probability Distribution
  const regDamage = failedSaves * getExpectedDamageForExpression(input.damage, target.w, fnpFailChance, halveDamage, damageReduction, melta);
  const devDamage = devastatingWoundsCount * getExpectedDamageForExpression(input.damage, target.w, mwFnpFailChance, halveDamage, damageReduction, melta);
  const flatDmg = baseAttacks * flatMortals * mwFnpFailChance;

  // Calculate raw damage (ignoring model boundaries and caps)
  const rawDamageValue = parseDiceAverage(input.damage) + melta;
  const rawReg = failedSaves * rawDamageValue * fnpFailChance;
  const rawDev = devastatingWoundsCount * rawDamageValue * mwFnpFailChance;
  const rawDamage = rawReg + rawDev + flatDmg;

  return {
    expectedAttacks: baseAttacks,
    expectedHits: expectedHits + lethalWounds,
    expectedWounds: normalWounds + critWounds + devastatingWoundsCount,
    expectedUnsaved: failedSaves + devastatingWoundsCount,
    rawDamage,
    effectiveDamage: regDamage + devDamage + flatDmg,
    casualties: (regDamage + devDamage + flatDmg) / target.w,
    lethalWounds,
    devastatingWoundsCount
  };
}
