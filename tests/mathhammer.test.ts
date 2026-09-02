import { 
  calculateExpectedDamage, 
  getDiceDistribution, 
  expectedFlatDamageAfterFnp,
  getExpectedDamageForExpression,
  profileAppliesToTarget,
  selectProfilesForTarget
} from '../src/utils/mathhammer';
import type {
  MathhammerInput,
  TargetProfile 
} from '../src/utils/mathhammer';

// Simple lightweight assertion helper for zero-dependency test running
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertClose(actual: number, expected: number, tolerance = 1e-4, message = "") {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`Assertion failed: ${message || `Expected ${expected.toFixed(4)}, got ${actual.toFixed(4)}`}`);
  }
}

export function runMathhammerTests() {
  console.log("Starting Mathhammer Math Library Unit Tests...\n");

  // ==========================================
  // 1. Dice Distribution Parser
  // ==========================================
  console.log("Testing: Dice Distribution Parser");
  
  const distFlat = getDiceDistribution("3");
  assert(distFlat.length === 1, "Flat number should yield 1 outcome");
  assert(distFlat[0].value === 3, "Flat number value should be correct");
  assertClose(distFlat[0].probability, 1.0, 1e-6, "Flat number probability should be 1.0");

  const distD3 = getDiceDistribution("D3");
  assert(distD3.length === 3, "D3 should yield 3 outcomes");
  assertClose(distD3[0].probability, 1/3, 1e-6);
  assertClose(distD3[2].value, 3, 1e-6);

  const dist2D6 = getDiceDistribution("2D6");
  assert(dist2D6.length === 11, "2D6 should yield 11 outcomes (2 to 12)");
  assertClose(dist2D6[0].value, 2, 1e-6);
  assertClose(dist2D6[10].value, 12, 1e-6);
  // P(7 on 2D6) is 6/36 = 1/6
  const outcome7 = dist2D6.find(o => o.value === 7);
  assert(outcome7 !== undefined, "7 should be in 2D6 distribution");
  assertClose(outcome7!.probability, 6/36, 1e-6);

  console.log("  ✅ Dice Distribution Parser: PASS");

  // ==========================================
  // 2. Binomial Feel No Pain Math
  // ==========================================
  console.log("Testing: Binomial FNP Math");
  
  // Flat 2 damage vs 1W model, FNP 5+ (fail chance 4/6)
  // Outcomes: 0 fail (0 dmg, prob 1/9), 1 fail (1 dmg, prob 4/9), 2 fail (capped 1 dmg, prob 4/9)
  // Expected: 0*1/9 + 1*4/9 + 1*4/9 = 8/9 = 0.8889
  const fnpDmg = expectedFlatDamageAfterFnp(2, 1, 4/6);
  assertClose(fnpDmg, 8/9, 1e-4, "FNP 5+ flat 2 damage vs 1W model");

  console.log("  ✅ Binomial FNP Math: PASS");

  // ==========================================
  // 3. Modifier Capping & Transhuman
  // ==========================================
  console.log("Testing: Hit/Wound Modifiers & Transhuman");

  const defaultInput: MathhammerInput = {
    attacks: "10",
    bsWs: 3,
    strength: 4,
    ap: 0,
    damage: "1",
    torrent: false,
    twinLinked: false,
    lethalHits: false,
    sustainedHits: 0,
    devastatingWounds: false,
    blast: false,
    hitReRoll: 'none',
    woundReRoll: 'none',
    plusToHit: 0,
    plusToWound: 0,
    antiKeyword: '',
    antiValue: 0
  };

  const defaultTarget: TargetProfile = {
    name: 'Test Target',
    t: 4,
    sv: 4,
    inv: null,
    w: 1,
    fnp: null,
    keywords: [],
    unitSize: 1
  };

  // Test +2 to hit (should cap at +1, target BS 3+ becomes 2+)
  const inputHitMod = { ...defaultInput, plusToHit: 2 };
  const resHitMod = calculateExpectedDamage(inputHitMod, defaultTarget);
  // BS 3+ improved to 2+ is 5/6 hit chance. 10 attacks * 5/6 = 8.33 hits.
  assertClose(resHitMod.expectedHits, 8.3333, 1e-2, "Hit modifier capping at +1");

  // Test -2 to wound (should cap at -1, S4 vs T4 needs 4+, modified to 5+)
  const targetWoundMod = { ...defaultTarget, woundPenalty: 2 };
  const resWoundMod = calculateExpectedDamage(defaultInput, targetWoundMod);
  // 10 attacks * 4/6 hit (6.67 hits). 4+ wound becomes 5+ (2/6 chance). 6.67 * 2/6 = 2.22 wounds.
  assertClose(resWoundMod.expectedWounds, 2.2222, 1e-2, "Wound modifier capping at -1");

  // Test Transhuman (1-3 always fails, even if S8 vs T4 needing 2+ with +1 to wound)
  const inputTrans = { ...defaultInput, strength: 8, plusToWound: 1 };
  const targetTrans = { ...defaultTarget, transhuman: true };
  const resTrans = calculateExpectedDamage(inputTrans, targetTrans);
  // S8 vs T4 is 2+. +1 wound makes it 2+. Transhuman forces it to 4+ (3/6 chance).
  // 6.67 hits * 3/6 wound chance = 3.33 wounds.
  assertClose(resTrans.expectedWounds, 3.3333, 1e-2, "Transhuman overriding wound to 4+");

  console.log("  ✅ Hit/Wound Modifiers & Transhuman: PASS");

  // ==========================================
  // 4. 11th Edition Benefit of Cover
  // ==========================================
  console.log("Testing: 11th Edition Benefit of Cover");

  // Target in cover. Shoots at range. BS 3+ becomes 4+ (-1 BS characteristic).
  const targetCover = { ...defaultTarget, cover: true };
  const resCover = calculateExpectedDamage(defaultInput, targetCover);
  // BS 3+ worsened to 4+ (3/6 chance). 10 attacks * 3/6 = 5.0 hits.
  assertClose(resCover.expectedHits, 5.0000, 1e-2, "Benefit of Cover worsening BS by 1");

  // Ignores Cover weapon ability
  const inputIgCover = { ...defaultInput, ignoresCover: true };
  const resIgCover = calculateExpectedDamage(inputIgCover, targetCover);
  // Cover is ignored, hit chance is 4/6. 10 attacks * 4/6 = 6.67 hits.
  assertClose(resIgCover.expectedHits, 6.6667, 1e-2, "Ignores Cover bypassing cover penalty");

  console.log("  ✅ 11th Edition Benefit of Cover: PASS");

  // ==========================================
  // 5. AP & Saving Throw Logic
  // ==========================================
  console.log("Testing: AP & Saving Throw Logic");

  // Target Save 3+, AP -2. Save target becomes 5+.
  const inputAp = { ...defaultInput, ap: -2 };
  const targetSave3 = { ...defaultTarget, sv: 3 };
  const resSave = calculateExpectedDamage(inputAp, targetSave3);
  // 10 attacks * 4/6 hit (6.67 hits) * 3/6 wound (3.33 wounds).
  // Save 5+ (fail chance 4/6). 3.33 * 4/6 = 2.22 unsaved.
  assertClose(resSave.expectedUnsaved, 2.2222, 1e-2, "AP modifying save target");

  // Invulnerable Save: Save 3+, AP -4, Invul 4++. Target uses best save (4++).
  const inputAp4 = { ...defaultInput, ap: -4 };
  const targetInv = { ...defaultTarget, sv: 3, inv: 4 };
  const resInv = calculateExpectedDamage(inputAp4, targetInv);
  // Save 3+ with AP -4 becomes 7+ (un-saveable). Uses 4++ invul (fail chance 3/6).
  // 3.33 wounds * 3/6 save fail = 1.67 unsaved.
  assertClose(resInv.expectedUnsaved, 1.6667, 1e-2, "Invulnerable save taking precedence");

  // Armor of Contempt (AP reduction 1): Save 3+, AP -2, AoC. AP becomes -1. Save target 4+.
  const targetAoc = { ...defaultTarget, sv: 3, apReduction: 1 };
  const resAoc = calculateExpectedDamage(inputAp, targetAoc);
  // AP -2 reduced to AP -1. Save 4+ (fail chance 3/6).
  // 3.33 wounds * 3/6 save fail = 1.67 unsaved.
  assertClose(resAoc.expectedUnsaved, 1.6667, 1e-2, "Armor of Contempt reducing AP penalty");

  console.log("  ✅ AP & Saving Throw Logic: PASS");

  // ==========================================
  // 6. 11th Edition Devastating Wounds
  // ==========================================
  console.log("Testing: 11th Edition Devastating Wounds");

  // Weapon has Devastating Wounds, damage 3. Target is 2W model.
  // Critical wounds bypass saves but do NOT spill over (capped at 2W).
  const inputDev = { ...defaultInput, devastatingWounds: true, damage: "3" };
  const target2W = { ...defaultTarget, w: 2 };
  const resDev = calculateExpectedDamage(inputDev, target2W);
  // Normal hits: 5.56 hits. Crit hits: 1.11 hits (which auto-wound, bypassed saves, capped at 2W).
  assert(resDev.devastatingWoundsCount > 0, "Should generate devastating wounds");
  
  // Verify that devastating wounds damage is capped at W=2 wounds per model
  const devExpectedDmg = getExpectedDamageForExpression("3", 2, 1.0, false, 0);
  assertClose(devExpectedDmg, 2.0, 1e-4, "Devastating Wounds damage capped at model wounds");

  console.log("  ✅ 11th Edition Devastating Wounds: PASS");

  // ==========================================
  // 7. Conditional ("Hunter") weapon profiles
  // ==========================================
  console.log("Testing: Conditional Hunter Profiles");

  // Placeholder shapes only — no Games Workshop datasheet values in tests.
  const plainProfile = { name: "Alpha" };
  const gatedProfile = { name: "Gated", hunterKeywords: ["BIGTHING", "OTHERTHING"] };

  // An ordinary profile is always usable.
  assert(profileAppliesToTarget(plainProfile, []), "Unconditional profile applies to any target");
  assert(profileAppliesToTarget(plainProfile, ["SMALLTHING"]), "Unconditional profile ignores keywords");

  // A gated profile needs at least one matching keyword; matching is OR'd and
  // case-insensitive.
  assert(!profileAppliesToTarget(gatedProfile, ["SMALLTHING"]), "Gated profile rejects non-matching target");
  assert(profileAppliesToTarget(gatedProfile, ["BIGTHING"]), "Gated profile accepts first keyword");
  assert(profileAppliesToTarget(gatedProfile, ["OTHERTHING"]), "Gated profile accepts second keyword (OR)");
  assert(profileAppliesToTarget(gatedProfile, ["bigthing"]), "Gated profile matches case-insensitively");

  // Selection must never return both statlines of a conditional weapon, which
  // would double-count its output.
  const conditionalWeapon = [gatedProfile, plainProfile];

  const vsMatching = selectProfilesForTarget(conditionalWeapon, ["BIGTHING"]);
  assert(vsMatching.length === 1, "Matching target selects exactly one profile");
  assert(vsMatching[0].name === "Gated", "Matching target selects the gated profile");

  const vsOther = selectProfilesForTarget(conditionalWeapon, ["SMALLTHING"]);
  assert(vsOther.length === 1, "Non-matching target selects exactly one profile");
  assert(vsOther[0].name === "Alpha", "Non-matching target falls back to the unconditional profile");

  // A genuine multi-profile weapon (no gating) keeps every profile, since those
  // really are simultaneously available.
  const multiProfileWeapon = [{ name: "Alpha" }, { name: "Beta" }];
  const bothKept = selectProfilesForTarget(multiProfileWeapon, ["SMALLTHING"]);
  assert(bothKept.length === 2, "Unconditional multi-profile weapon keeps all profiles");

  // A weapon whose only profile is gated yields nothing against a bad target,
  // rather than silently falling back to an illegal statline.
  const gatedOnly = selectProfilesForTarget([gatedProfile], ["SMALLTHING"]);
  assert(gatedOnly.length === 0, "Gated-only weapon yields no profile against a non-matching target");

  console.log("  ✅ Conditional Hunter Profiles: PASS");

  console.log("\nAll Mathhammer Unit Tests Completed Successfully! 🎉");
}

// Run tests automatically if this file is run directly via node/tsx
runMathhammerTests();
