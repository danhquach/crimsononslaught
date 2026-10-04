/**
 * Relic offers as they were drawn before Reroll, Skip and Ban reached them
 * (CO-239): one line per case and seed, `case:seed:offer;offer;offer|next
 * draw`, each card as `id@rank`. Captured from commit ef066df's own
 * `relicOffer.ts`; `relicOffer.test.ts` replays the same three draws per seed
 * and holds them to these lines, so a run that never uses Reroll, Skip or Ban
 * on a relic keeps its seed's relic offers and its RNG position.
 *
 * `fresh` is a new Fire build; `stacked` an Ice build with Hourglass at its
 * cap and one Bulwark.
 */
export const RELIC_OFFER_GOLDEN: readonly string[] = [
  'fresh:1:relic_bloodstone@1,relic_ancient_fury@1,relic_bulwark@1;charge_relic_ban@,charge_relic_rerolls@,relic_everfrost@1;relic_windstep@1,relic_wellspring@1,relic_hawk_eye@1|0.9948229456786066',
  'fresh:2:relic_wellspring@1,relic_everfrost@1,relic_hawk_eye@1;relic_bulwark@1,relic_sages_tome@1,relic_windstep@1;relic_bulwark@1,relic_hawk_eye@1,relic_lodestone@1|0.11403172370046377',
  'fresh:3:relic_wellspring@1,relic_ancient_fury@1,relic_executioner@1;relic_ancient_fury@1,relic_lodestone@1,relic_bulwark@1;relic_bulwark@1,relic_hourglass@1,relic_everfrost@1|0.5526072245556861',
  'fresh:4:relic_sages_tome@1,relic_everfrost@1,relic_tailwind@1;relic_hourglass@1,relic_everfrost@1,relic_windstep@1;relic_ancient_fury@1,charge_relic_ban@,relic_bloodstone@1|0.6908154499251395',
  'fresh:5:relic_bloodstone@1,relic_lodestone@1,relic_tailwind@1;relic_windstep@1,relic_hourglass@1,relic_bloodstone@1;relic_wellspring@1,relic_executioner@1,relic_sages_tome@1|0.22942897235043347',
  'fresh:6:relic_bulwark@1,relic_ancient_fury@1,relic_wellspring@1;relic_tailwind@1,relic_windstep@1,relic_ancient_fury@1;relic_ancient_fury@1,relic_sages_tome@1,charge_relic_ban@|0.21005285810679197',
  'fresh:7:relic_ancient_fury@1,relic_hourglass@1,charge_relic_ban@;relic_bloodstone@1,relic_bulwark@1,relic_hawk_eye@1;relic_executioner@1,relic_tailwind@1,relic_windstep@1|0.729822089895606',
  'fresh:8:relic_tailwind@1,relic_bloodstone@1,relic_hawk_eye@1;relic_bloodstone@1,relic_bulwark@1,relic_hawk_eye@1;relic_lodestone@1,relic_tailwind@1,relic_bulwark@1|0.06013806466944516',
  'fresh:9:relic_tailwind@1,relic_sages_tome@1,relic_hourglass@1;relic_lodestone@1,relic_bloodstone@1,relic_windstep@1;relic_everfrost@1,relic_sages_tome@1,relic_hourglass@1|0.6322905202396214',
  'fresh:10:relic_bulwark@1,relic_sages_tome@1,relic_bloodstone@1;relic_lodestone@1,relic_executioner@1,relic_hawk_eye@1;relic_tailwind@1,relic_ancient_fury@1,relic_hourglass@1|0.9967185999266803',
  'fresh:11:relic_bulwark@1,relic_windstep@1,relic_bloodstone@1;relic_windstep@1,relic_sages_tome@1,relic_executioner@1;relic_hourglass@1,relic_windstep@1,relic_bloodstone@1|0.45032489066943526',
  'fresh:12:relic_everfrost@1,relic_ancient_fury@1,relic_bloodstone@1;charge_relic_rerolls@,relic_hourglass@1,relic_ancient_fury@1;relic_bloodstone@1,relic_windstep@1,relic_executioner@1|0.7364690757822245',
  'stacked:1:relic_bloodstone@1,relic_ancient_fury@1,relic_windstep@1;charge_relic_ban@,charge_relic_rerolls@,relic_hawk_eye@1;relic_bloodstone@1,relic_wellspring@1,relic_executioner@1|0.9948229456786066',
  'stacked:2:relic_wellspring@1,relic_hawk_eye@1,relic_everfrost@1;relic_windstep@1,relic_sages_tome@1,relic_bloodstone@1;relic_bulwark@2,relic_hawk_eye@1,relic_lodestone@1|0.11403172370046377',
  'stacked:3:relic_wellspring@1,relic_ancient_fury@1,relic_bulwark@2;relic_ancient_fury@1,relic_lodestone@1,relic_bulwark@2;relic_bulwark@2,relic_tailwind@1,relic_hawk_eye@1|0.5526072245556861',
  'stacked:4:relic_sages_tome@1,relic_hawk_eye@1,relic_everfrost@1;relic_ancient_fury@1,relic_hawk_eye@1,relic_windstep@1;relic_ancient_fury@1,charge_relic_ban@,relic_bloodstone@1|0.6908154499251395',
  'stacked:5:relic_wellspring@1,relic_lodestone@1,relic_everfrost@1;relic_bloodstone@1,relic_ancient_fury@1,relic_windstep@1;relic_wellspring@1,relic_executioner@1,relic_sages_tome@1|0.22942897235043347',
  'stacked:6:relic_windstep@1,relic_ancient_fury@1,relic_wellspring@1;relic_everfrost@1,relic_windstep@1,relic_ancient_fury@1;relic_ancient_fury@1,relic_sages_tome@1,charge_relic_ban@|0.21005285810679197',
  'stacked:7:relic_ancient_fury@1,relic_tailwind@1,charge_relic_ban@;relic_wellspring@1,relic_bulwark@2,relic_hawk_eye@1;relic_bulwark@2,relic_everfrost@1,relic_bloodstone@1|0.729822089895606',
  'stacked:8:relic_tailwind@1,relic_bloodstone@1,relic_hawk_eye@1;relic_wellspring@1,relic_windstep@1,relic_executioner@1;relic_lodestone@1,relic_everfrost@1,relic_bulwark@2|0.06013806466944516',
  'stacked:9:relic_everfrost@1,relic_sages_tome@1,relic_tailwind@1;relic_lodestone@1,relic_bloodstone@1,relic_windstep@1;relic_hawk_eye@1,relic_sages_tome@1,relic_tailwind@1|0.6322905202396214',
  'stacked:10:relic_bulwark@2,relic_sages_tome@1,relic_bloodstone@1;relic_lodestone@1,relic_executioner@1,relic_bulwark@2;relic_everfrost@1,relic_ancient_fury@1,relic_tailwind@1|0.9967185999266803',
  'stacked:11:relic_windstep@1,relic_bulwark@2,relic_bloodstone@1;relic_windstep@1,relic_sages_tome@1,relic_bulwark@2;relic_ancient_fury@1,relic_windstep@1,relic_bloodstone@1|0.45032489066943526',
  'stacked:12:relic_hawk_eye@1,relic_ancient_fury@1,relic_bloodstone@1;charge_relic_rerolls@,relic_tailwind@1,relic_ancient_fury@1;relic_wellspring@1,relic_windstep@1,relic_bulwark@2|0.7364690757822245',
];
