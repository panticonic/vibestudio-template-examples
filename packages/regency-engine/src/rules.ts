/**
 * The rules of Regency as the agents read them. Lives with the engine so the
 * text and the code it describes change in the same place.
 */
import { TREATY_GUIDE } from "./report.js";

export const RULES_SUMMARY = `# How Regency is played

Seasons are turns. During a season every court issues orders; the Regent closes the season; once every sovereign has ended its turn the world resolves in one deterministic pass: laws and treaties, then spending, then war declarations, then marches and battles, then sieges, then harvest, taxes and unrest.

## Orders (submit_order)
- build {province, building}: farm (food), market (gold, needs dev ≥ 2), fort (walls), road, mine (iron/gold/salt), granary, shrine (calm), barracks (regulars).
- muster {province, unit, companies}: levy (cheap), regular (barracks or capital), cavalry (needs horses), siege (needs timber and iron).
- move {army, to}: one adjacent province per season. You may only enter your own, neutral, enemy (at war) or allied provinces.
- merge {army, into}, disband {army}.
- set_tax {taxRate 0.1–0.6}, set_conscription {level 0–1}, set_granary_reserve {share 0–1}.
- enact_edict {edict}: a law as data — conditions over provinces (unrest, population, food_ratio, development, garrison, fort, granary, is_border, coastal, terrain, resource, famine_streak) and actions (tax_relief, grain_dole, garrison_levy, public_works, curfew). repeal_edict {edictId}.
- declare_war {target}; propose {proposal: {to, kind, terms, message}}; respond {proposalId, accept, message}; withdraw {proposalId}; cede_province {province, to}; colonize {province, from} (a neutral neighbour, for gold).

## Treaties
${TREATY_GUIDE}

## Money and bread
Taxes scale with population, development and the tax rate; high taxes raise unrest. Food is pooled across the realm; shortfalls draw on granaries, then the grain dole (if an edict allows), then people starve. Unrest above 80 becomes a revolt.

## Winning and losing (the Regency only)
Win: reach the heir's majority with legitimacy ≥ 40; or hold 55% of all provinces; or ally with every surviving realm. Lose: the capital falls, legitimacy reaches 0, or three seasons of deep debt.

## The court
Ministers hold portfolios: chancellor (laws, taxes), treasurer (building, colonies), marshal (armies, war), envoy (treaties). Sensitive acts (war, laws, alliances, taxes, ceding land) await the Regent's seal unless the minister holds a plenary mandate. The Herald interprets the Regent's words and carries them to the right minister.`;
