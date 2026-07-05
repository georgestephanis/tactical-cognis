# TODO — Database Integrations & Feature Roadmap

This document outlines the assessment and plan for leveraging unused database tables to add high-value features to Tactical Cognis.

## 1. `allied_faction*` — Allies in ArmyBuilder
**Effort: Medium | Payoff: High**
* **Tables:** `allied_faction`, `allied_faction_datasheet`, `allied_faction_points_limit`, `allied_faction_keyword`, etc.
* **Objective:** Enable allied unit selections (e.g., Chaos Daemons/Knights in Chaos Space Marines; Imperial Knights or Agents of the Imperium in Space Marines).
* **Scope:**
  - Query `allied_faction_datasheet` to fetch eligible allied units.
  - Render an "Allies" category in the Army Builder catalog when applicable.
  - Implement point validations using `allied_faction_points_limit` (e.g., max 25% or 500pts).

## 2. Missions & Scoring Tracker (Gameplay Battle Mode)
**Effort: Large | Payoff: Very High**
* **Tables:** `primary_mission`, `secondary_mission`, `mission_preset`, `mission_layout`, `mission_twist`, `objective`, `force_disposition`
* **Objective:** Create a "Battle Mode" tab for live gameplay score tracking.
* **Scope:**
  - Build a tournament mission generator (combining Primary Mission, Deployment Map layout, and Twist).
  - Add secondary objective selection/drawing (Tactical vs. Fixed cards).
  - Build an interactive UI to track Victory Points (VPs) turn-by-turn during a match.

## 3. `faq` & `faq_config` — Errata and Rules Surfacing
**Effort: Small | Payoff: Medium**
* **Tables:** `faq`, `faq_config`
* **Objective:** Surface official Games Workshop rules clarifications, errata, and FAQs.
* **Scope:**
  - Query FAQs associated with active publications/datasheets.
  - Display FAQ entries as tooltips or notice panels in the **Unit Details** view or **Roster Validation** warnings.

## 4. `allegiance_ability*` — Sub-faction and Allegiance Choices
**Effort: Medium | Payoff: Medium**
* **Tables:** `allegiance_ability`, `allegiance_ability_group`, `faction_keyword_mandatory_allegiance_ability`
* **Objective:** Support sub-faction choices (like Space Marine Chapters or Chaos God marks) that restrict wargear or enhancements.
* **Scope:**
  - Add a sub-faction selector to the army settings.
  - Restrict enhancements or unit keywords based on chosen allegiance rules.

## 5. Detachment-Specific Roster Validation
**Effort: Medium | Payoff: Medium**
* **Tables:** `detachment_unique_keyword`, `detachment_excluded_datasheet`, `detachment_required_datasheet`
* **Objective:** Enhance roster validation by checking detachment-specific composition rules.
* **Scope:**
  - Flag composition warnings if detached-required units are missing or unique keyword restrictions are violated.

---

## Completed Database Integrations
* **`invulnerable_save`** ✅ Joined and rendered in UnitDetails.
* **`datasheet_damage`** ✅ Damaged-vehicle brackets parsed and rendered.
* **`loadout_choice*` & `wargear_limit*`** ✅ Custom wargear swaps and squad limits mapped and validated in the builder.
