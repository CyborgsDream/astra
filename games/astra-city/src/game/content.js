/** Authored gameplay content for ASTRA CITY. Every target is a district contract ID. */
export const FACTIONS = [
  {
    id: 'commons', name: 'Switchback Commons', color: '#edbe79',
    description: 'Residents and maintenance workers pooling what the district can spare. They want reliable homes, safe shifts, and a public say in the grid.',
  },
  {
    id: 'directorate', name: 'Civic Grid Directorate', color: '#80c9e3',
    description: 'The authority that keeps the city connected. Its engineers value coordinated infrastructure; its managers fear a failure they cannot control.',
  },
  {
    id: 'cooperative', name: 'Open Loop Cooperative', color: '#a8d8a2',
    description: 'Salvagers and repair crews giving discarded machines another life. They want open service manuals and room for local solutions.',
  },
];

const parcel = (id, name, description) => ({ id, name, description, price: 0, kind: 'quest', purchasable: false });

export const ITEMS = {
  scanner: {
    id: 'scanner', name: 'Ward scanner', description: 'An old survey handset. Highlights nearby routes, machines, and points of interest.',
    price: 0, kind: 'tool', slot: 'scanner', purchasable: false, effect: { scanRadius: 28 },
  },
  hack_tool: {
    id: 'hack_tool', name: 'Signal bridge', description: 'A pocket service interface for routing live terminal circuits.',
    price: 0, kind: 'tool', slot: 'hack', purchasable: false, effect: { hackAssist: 0 },
  },
  field_scanner: {
    id: 'field_scanner', name: 'Survey scanner', description: 'A stronger receiver reveals useful signals across a wider area.',
    price: 85, kind: 'upgrade', slot: 'scanner', soldAt: ['ivo', 'workshop'], effect: { scanRadius: 52 },
  },
  signal_decoder: {
    id: 'signal_decoder', name: 'Phase decoder', description: 'Stabilizes terminal signals and simplifies complex archive circuit layouts.',
    price: 125, kind: 'upgrade', slot: 'hack', soldAt: ['ivo', 'workshop'], effect: { hackAssist: 1 },
  },
  repair_rig: {
    id: 'repair_rig', name: 'Induction repair rig', description: 'A portable diagnostic clamp that makes damaged circuits easier to repair.',
    price: 110, kind: 'upgrade', slot: 'repair', soldAt: ['ivo', 'workshop'], effect: { repairAssist: 1 },
  },
  runner_soles: {
    id: 'runner_soles', name: 'Courier soles', description: 'Light, sprung soles increase travel speed and energy recovery.',
    price: 95, kind: 'upgrade', slot: 'boots', soldAt: ['ivo', 'workshop'], effect: { moveSpeed: 1.12, energyRegen: 1.25 },
  },
  grid_coat: {
    id: 'grid_coat', name: 'Insulated work coat', description: 'A reinforced maintenance coat reduces damage from hard landings and live equipment.',
    price: 105, kind: 'upgrade', slot: 'coat', soldAt: ['ivo', 'workshop'], effect: { damageReduction: 0.25 },
  },
  medkit: {
    id: 'medkit', name: 'Field medkit', description: 'Clean dressings and a clinic patch. Restores 45 health.',
    price: 28, kind: 'consumable', health: 45, soldAt: ['sana', 'ivo', 'workshop'],
  },
  battery: {
    id: 'battery', name: 'Charge cell', description: 'A fresh, reusable casing with a full charge. Restores 45 energy.',
    price: 18, kind: 'consumable', energy: 45, soldAt: ['ivo', 'workshop', 'sana'],
  },
  snack: {
    id: 'snack', name: 'Sesame rice wrap', description: 'Still warm from the market kitchen. Restores 12 health and 18 energy.',
    price: 10, kind: 'consumable', health: 12, energy: 18, soldAt: ['kiosk', 'sana'],
  },
  clinic_supplies: parcel('clinic_supplies', 'Cold-chain medicine', 'Sana needs these temperature-sensitive clinic supplies before the next brownout.'),
  clinic_receipt: parcel('clinic_receipt', 'Clinic receipt', 'Sana’s signed delivery chit, folded around a thank-you note.'),
  crew_roster: parcel('crew_roster', 'Missing-shift roster', 'A maintenance roster with six names and an unauthorized tunnel assignment.'),
  audit_record: parcel('audit_record', 'Suppressed grid audit', 'The original load test, a crew warning, and the order that kept them underground.'),
  bridge_capacitor: parcel('bridge_capacitor', 'Bridge capacitor', 'Ivo’s rebuilt component can stabilize the district switching station.'),
  pantry_crate: parcel('pantry_crate', 'Community pantry crate', 'Dried beans, lamp cells, and handwritten portions for the market kitchen.'),
  pantry_receipt: parcel('pantry_receipt', 'Pantry delivery chit', 'A receipt stamped with a little bowl of soup.'),
  seed_case: parcel('seed_case', 'Rooftop seed case', 'Drought-tolerant greens and a working drip valve for the high garden.'),
  copper_coil: parcel('copper_coil', 'Recovered copper coil', 'Tagged salvage from a decommissioned feeder, still perfectly serviceable.'),
  water_sampler: parcel('water_sampler', 'Sterile sample bottle', 'A sealed sampling bottle supplied by the clinic.'),
  water_sample: parcel('water_sample', 'Lower-works water sample', 'A carefully sealed sample from the underground pump.'),
  calibration_note: parcel('calibration_note', 'Relay calibration strip', 'The relay’s corrected signal pattern, ready for the rooftop receiver.'),
  recovery_meals: parcel('recovery_meals', 'Recovery meal pack', 'Soft food, clean water, and a change of clothes for the recovered crew.'),
  public_record: parcel('public_record', 'Public audit copy', 'A plain-language copy of the load test and the missing crew’s warnings.'),
  courier_parcel: parcel('courier_parcel', 'Sealed market parcel', 'A modest everyday delivery. The ward keeps moving one parcel at a time.'),
  courier_receipt: parcel('courier_receipt', 'Market delivery receipt', 'Proof of this particular courier run. Mara pays once when it is returned.'),
};

export const ENDINGS = {
  commons: {
    id: 'commons', label: 'Give the ward a public control key', title: 'A Key for Every Shift',
    description: 'Place the switching station under a resident and worker council.',
    text: 'The Commons posts a public shift board beneath the switch. Residents choose their maintenance crews, and every outage report stays visible. The rescued workers return on their own terms. Across Switchback, apartment lights hold steady.',
    reputation: { commons: 18, directorate: -4, cooperative: 6 }, items: { grid_coat: 1 },
    world: { policy: 'commons', power: true },
  },
  directorate: {
    id: 'directorate', label: 'Restore city control and publish the audit', title: 'The Record Stays Open',
    description: 'Keep the ward on the city network with a public audit and protected crews.',
    text: 'The Directorate reconnects the ward to its reserve feeders. The original audit is public, the crew orders are withdrawn, and an independent shift observer takes a seat at dispatch. Switchback gains steady power—and a record that cannot quietly disappear.',
    reputation: { commons: 5, directorate: 18, cooperative: -4 }, items: { signal_decoder: 1 },
    world: { policy: 'directorate', power: true },
  },
  cooperative: {
    id: 'cooperative', label: 'Open the grid to cooperative crews', title: 'An Open Circuit',
    description: 'Let local repair teams maintain an open, shared district network.',
    text: 'Open Loop publishes the service plans and connects small neighborhood reserves to the repaired feeder. Formerly stranded crews train new hands beside Ivo’s bench. Switchback’s power becomes a shared craft, with spare parts and knowledge moving through every block.',
    reputation: { commons: 8, directorate: -6, cooperative: 18 }, items: { repair_rig: 1 },
    world: { policy: 'cooperative', power: true },
  },
};

export const QUESTS = {
  intro: {
    id: 'intro', title: 'Medicine Before Midnight', giver: 'mara', category: 'story',
    description: 'Switchback’s lights are failing again. Mara has one urgent clinic delivery and a question about the maintenance crews who never came home.',
    prerequisites: [], onAcceptItems: { clinic_supplies: 1 },
    stages: [
      { text: 'Deliver Mara’s medicine to the clinic.', target: 'clinic_drop', type: 'deliver', requiredItem: 'clinic_supplies', consumeItem: true, rewardItem: 'clinic_receipt', dialogue: 'Sana: You made it. The cold cabinet only has another hour. Tell Mara we still have six empty chairs from the night shift.' },
      { text: 'Return the signed receipt to Mara.', target: 'mara', type: 'interact', requiredItem: 'clinic_receipt', consumeItem: true, dialogue: 'Mara: Six workers missing, and dispatch calls it a scheduling error. There is still a voice on the roof relay. We should listen.' },
    ],
    reward: { credits: 55, reputation: { commons: 3 } },
    completionText: 'The clinic has its medicine. Mara trusts you with a more difficult route.',
  },
  static_below: {
    id: 'static_below', title: 'A Voice in the Static', giver: 'mara', category: 'story',
    description: 'A broken maintenance transmission is looping above the ward. Trace it, then give whoever sent it a way to breathe.',
    prerequisites: ['intro'],
    stages: [
      { text: 'Route the rooftop relay’s service circuit.', target: 'relay', type: 'hack', retroactive: true, dialogue: 'Recorded voice: Night crew to dispatch. Pump intake blocked. The service gate has locked behind us. We have people down here.' },
      { text: 'Repair the pump in the lower works.', target: 'pump', type: 'repair', retroactive: true, dialogue: 'The pump catches. Stale air pulls through the duct, and a faint voice answers from beyond the service passage.' },
      { text: 'Ask Ivo what trapped the maintenance shift.', target: 'ivo', type: 'interact', dialogue: 'Ivo: That gate closes on a remote order, not a fault. Orin keeps the union roster. Start with the names.' },
    ],
    reward: { credits: 90, reputation: { commons: 3, directorate: 2 }, world: { opened: ['service_door'] } },
    completionText: 'The lower works have ventilation again. The service passage is open.',
  },
  missing_shift: {
    id: 'missing_shift', title: 'The Names on the Roster', giver: 'orin', category: 'story',
    description: 'Orin refuses to let a missing shift become a line in an incident report. Recover the roster and find the crew’s last station.',
    prerequisites: ['static_below'],
    stages: [
      { text: 'Recover the crew roster from the service cache.', target: 'cache', type: 'interact', rewardItem: 'crew_roster', dialogue: 'Six names, one tunnel assignment, and an unsigned instruction: hold position until the load test ends.' },
      { text: 'Reach the stranded maintenance worker.', target: 'rescue', type: 'rescue', dialogue: 'Tavi: We moved the others to the dry stair. I stayed with the radio. Dispatch told us the grid was safe. Please tell Orin we did not walk off the job.' },
      { text: 'Arrange care for the crew with Sana.', target: 'sana', type: 'interact', dialogue: 'Sana: I have their names now. We will get every one of them home. Bring that roster into the daylight.' },
      { text: 'Bring the recovered roster to Orin.', target: 'orin', type: 'interact', requiredItem: 'crew_roster', consumeItem: true, dialogue: 'Orin: They warned dispatch before the test. The archive keeps every warning—even the ones management removes from the public log.' },
    ],
    reward: { credits: 115, reputation: { commons: 8, cooperative: 2 }, items: { medkit: 1 } },
    completionText: 'The missing shift is accounted for. The crew’s warning is still somewhere in the archive.',
  },
  sealed_orders: {
    id: 'sealed_orders', title: 'What the Archive Kept', giver: 'ivo', category: 'story',
    description: 'The grid failed a safety test before the crew disappeared. Ivo can rebuild the failing bridge, but the ward needs the unedited record.',
    prerequisites: ['missing_shift'],
    stages: [
      { text: 'Open the restricted audit circuit in the archive.', target: 'archive', type: 'hack', retroactive: true, rewardItem: 'audit_record', dialogue: 'Audit recovered: the bridge capacitor was already failing. Dispatch sealed the service gate to keep the test on schedule after the crew requested evacuation.' },
      { text: 'Read the earlier shift names at the memorial.', target: 'memorial', type: 'discover', dialogue: 'The memorial lists other maintenance crews lost to “unforeseen failures.” Someone has left a fresh work glove beneath the oldest names.' },
      { text: 'Bring the complete audit to Mara.', target: 'mara', type: 'interact', requiredItem: 'audit_record', consumeItem: true, dialogue: 'Mara: We can fix the bridge. We can also decide who gets its key. Ivo sent the rebuilt capacitor; Orin wants everyone to hear the choices.' },
    ],
    reward: { credits: 130, reputation: { commons: 5, cooperative: 4 }, items: { bridge_capacitor: 1 } },
    completionText: 'The ward has the truth and a replacement capacitor. The switching station is ready for a new agreement.',
  },
  district_choice: {
    id: 'district_choice', title: 'Who Keeps the Lights', giver: 'mara', category: 'story',
    description: 'Stabilize the district bridge, hear the ward’s terms, and choose who will maintain Switchback’s power. Every proposal protects the recovered crew and publishes the audit.',
    prerequisites: ['sealed_orders'],
    stages: [
      { text: 'Fit the rebuilt capacitor at the grid switch.', target: 'grid_switch', type: 'repair', requiredItem: 'bridge_capacitor', consumeItem: true, dialogue: 'The bridge holds under load. Three control paths illuminate on the switch.' },
      { text: 'Hear Orin’s terms for the next shift.', target: 'orin', type: 'interact', dialogue: 'Orin: A resident council gives us a direct say. City control brings reserve capacity. Open Loop can teach the whole ward to repair it. Whatever you choose, no more locked gates and no hidden reports.' },
      { text: 'Choose the ward’s power agreement at the grid switch.', target: 'grid_switch', type: 'interact', choices: Object.values(ENDINGS).map(({ id, label, description }) => ({ id, label, description })) },
    ],
    reward: { credits: 180 },
    completionText: 'Switchback’s lights are steady. Your routes, neighbors, and unfinished jobs are still here.',
  },
  pantry_line: {
    id: 'pantry_line', title: 'Enough for the Table', giver: 'mara', category: 'delivery',
    description: 'The market kitchen feeds households whose stoves go dark. Mara has a crate to keep the evening service running.',
    prerequisites: ['intro'], onAcceptItems: { pantry_crate: 1 },
    stages: [
      { text: 'Take the pantry crate to the market kitchen.', target: 'market_drop', type: 'deliver', requiredItem: 'pantry_crate', consumeItem: true, rewardItem: 'pantry_receipt', dialogue: 'The cook takes the crate and adds another pot to the stove. Your receipt smells faintly of toasted cumin.' },
      { text: 'Return the kitchen’s receipt to Mara.', target: 'mara', type: 'interact', requiredItem: 'pantry_receipt', consumeItem: true },
    ], reward: { credits: 65, reputation: { commons: 4 } },
    completionText: 'The kitchen can keep its shutters open through the evening.',
  },
  roof_garden: {
    id: 'roof_garden', title: 'Something That Will Grow', giver: 'mara', category: 'delivery',
    description: 'A rooftop grower traded spare parts for seeds and a drip valve. Carry the case up and see what the ward makes above the noise.',
    prerequisites: ['intro'], onAcceptItems: { seed_case: 1 },
    stages: [
      { text: 'Deliver the seed case to the rooftop drop.', target: 'rooftop_drop', type: 'deliver', requiredItem: 'seed_case', consumeItem: true },
      { text: 'Visit the rooftop garden.', target: 'garden', type: 'discover', dialogue: 'Between the antenna masts, warm planters hold tomatoes, herbs, and a handwritten invitation: take what you need; water what you can.' },
      { text: 'Tell Mara the garden is still growing.', target: 'mara', type: 'interact' },
    ], reward: { credits: 70, reputation: { commons: 4, cooperative: 2 }, items: { snack: 1 } },
    completionText: 'Fresh leaves will reach the market long after tonight’s delivery.',
  },
  salvage_claim: {
    id: 'salvage_claim', title: 'Too Good to Throw Away', giver: 'ivo', category: 'recovery',
    description: 'A sound copper coil was left in the lower-works salvage cache. Ivo would rather rebuild it than order something the ward cannot afford.',
    prerequisites: [],
    stages: [
      { text: 'Recover the tagged coil from the service cache.', target: 'cache', type: 'interact', rewardItem: 'copper_coil', dialogue: 'The coil is dusty, tagged for disposal, and almost new. A cooperative stamp marks it for recovery.' },
      { text: 'Bring the copper coil to Ivo’s workshop.', target: 'workshop', type: 'deliver', requiredItem: 'copper_coil', consumeItem: true, dialogue: 'Ivo: Nothing wrong with this a patient pair of hands cannot fix. Take a charge cell for the trip.' },
    ], reward: { credits: 75, reputation: { cooperative: 5 }, items: { battery: 1 } },
    completionText: 'One discarded part is back in service, and the workshop has a little more breathing room.',
  },
  water_watch: {
    id: 'water_watch', title: 'A Clear Sample', giver: 'sana', category: 'recovery',
    description: 'Pressure drops have stirred sediment in the lower pipes. Sana needs a fresh water sample before reopening the clinic taps.',
    prerequisites: ['intro'], onAcceptItems: { water_sampler: 1 },
    stages: [
      { text: 'Collect a water sample at the underground pump.', target: 'pump', type: 'interact', requiredItem: 'water_sampler', consumeItem: true, rewardItem: 'water_sample', dialogue: 'You flush the sampling tap and seal the bottle. The water runs clear, but Sana will make the final call.' },
      { text: 'Return the sealed sample to Sana.', target: 'sana', type: 'deliver', requiredItem: 'water_sample', consumeItem: true },
    ], reward: { credits: 55, reputation: { commons: 3, directorate: 2 }, items: { medkit: 1 } },
    completionText: 'Sana’s test clears the clinic taps. One less uncertainty for the next shift.',
  },
  relay_tuning: {
    id: 'relay_tuning', title: 'The Long Way Home', giver: 'ivo', category: 'repair',
    description: 'The rooftop relay is losing ordinary messages between emergency calls. Repair its timing circuit and calibrate the roof receiver.',
    prerequisites: ['intro'],
    stages: [
      { text: 'Repair the rooftop relay’s timing circuit.', target: 'relay', type: 'repair', retroactive: true, rewardItem: 'calibration_note', dialogue: 'The relay’s uneven pulse settles into a clean rhythm. A calibration strip prints beneath the service panel.' },
      { text: 'Calibrate the receiver at the rooftop drop.', target: 'rooftop_drop', type: 'deliver', requiredItem: 'calibration_note', consumeItem: true },
      { text: 'Report the clear signal to Ivo.', target: 'ivo', type: 'interact' },
    ], reward: { credits: 85, reputation: { cooperative: 4, directorate: 3 } },
    completionText: 'Calls and ordinary messages are reaching their destinations again.',
  },
  ward_walk: {
    id: 'ward_walk', title: 'The Ward Remembers', giver: 'orin', category: 'exploration',
    description: 'Orin asks new neighbors to visit two places that never appear on the official transit map: the shift memorial and the high garden.',
    prerequisites: [],
    stages: [
      { text: 'Read the names at the shift memorial.', target: 'memorial', type: 'discover', dialogue: 'Each name has a trade beside it. Electrician. Pump fitter. Line walker. Small lamps keep every line legible.' },
      { text: 'Find the garden above the ward.', target: 'garden', type: 'discover', dialogue: 'Someone has built a quiet, useful place out of space the city forgot to count.' },
      { text: 'Share what you found with Orin.', target: 'orin', type: 'interact', dialogue: 'Orin: The ward is the things we choose to look after. Now you know two of them.' },
    ], reward: { credits: 45, reputation: { commons: 4 } },
    completionText: 'You know a little more of the place behind the street signs.',
  },
  night_shift: {
    id: 'night_shift', title: 'A Chair at the Table', giver: 'sana', category: 'delivery',
    description: 'The rescued workers need more than an incident number. Bring the clinic its recovery meals and check on Tavi at the old radio post.',
    prerequisites: ['missing_shift'], onAcceptItems: { recovery_meals: 1 },
    stages: [
      { text: 'Deliver the recovery meals to the clinic.', target: 'clinic_drop', type: 'deliver', requiredItem: 'recovery_meals', consumeItem: true },
      { text: 'Check on Tavi by the maintenance radio.', target: 'rescue', type: 'interact', dialogue: 'Tavi: I came back for our tools. Next shift, the gate stays open. Tell Sana I will be there before the soup gets cold.' },
      { text: 'Let Sana know Tavi is on the way.', target: 'sana', type: 'interact' },
    ], reward: { credits: 60, reputation: { commons: 5 }, items: { snack: 2 } },
    completionText: 'Six chairs at the clinic table are no longer empty.',
  },
  signal_map: {
    id: 'signal_map', title: 'A Route for Every Call', giver: 'orin', category: 'exploration',
    description: 'Orin wants an emergency route that residents can actually find. Check the garden sightline and retrieve the relay’s working channel map.',
    prerequisites: ['intro'],
    stages: [
      { text: 'Check the district sightline from the garden.', target: 'garden', type: 'discover' },
      { text: 'Read the rooftop relay’s service channel map.', target: 'relay', type: 'hack', retroactive: true, dialogue: 'Three clear service channels cross the ward. None are listed on the Directorate’s public help board.' },
      { text: 'Bring the channel map to Orin.', target: 'orin', type: 'interact' },
    ], reward: { credits: 80, reputation: { commons: 4, cooperative: 2 } },
    completionText: 'The union help board now includes three working emergency channels.',
  },
  open_report: {
    id: 'open_report', title: 'Put It Where People Look', giver: 'orin', category: 'delivery',
    description: 'An audit only protects people if they can read it. Orin has prepared a plain-language copy for the public archive and the market board.',
    prerequisites: ['sealed_orders'], onAcceptItems: { public_record: 1 },
    stages: [
      { text: 'Publish the public copy at the archive.', target: 'archive', type: 'deliver', requiredItem: 'public_record', dialogue: 'The public index accepts the report. The crew’s warnings now appear beside the official incident summary.' },
      { text: 'Post the printed report at the market drop.', target: 'market_drop', type: 'deliver', requiredItem: 'public_record', consumeItem: true },
      { text: 'Tell Orin both copies are public.', target: 'orin', type: 'interact' },
    ], reward: { credits: 60, reputation: { commons: 6, directorate: 2 } },
    completionText: 'The report is on the record and on the street.',
  },
  courier_loop: {
    id: 'courier_loop', title: 'The Market Run', giver: 'mara', category: 'delivery', repeatable: true,
    description: 'Everyday parcels keep Switchback connected. Take a sealed package to the market, then return its receipt for a reliable fee. Repeat whenever you need credits.',
    prerequisites: ['intro'], onAcceptItems: { courier_parcel: 1 },
    stages: [
      { text: 'Deliver this run’s parcel to the market.', target: 'market_drop', type: 'deliver', requiredItem: 'courier_parcel', consumeItem: true, rewardItem: 'courier_receipt' },
      { text: 'Return this run’s receipt to Mara for payment.', target: 'mara', type: 'interact', requiredItem: 'courier_receipt', consumeItem: true },
    ], reward: { credits: 28, reputation: { commons: 1 } },
    completionText: 'Parcel delivered, receipt returned, fee paid. Mara has another run whenever you want it.',
  },
};

export const DIALOGUE = {
  mara: 'Mara: The ward has more stairs than spare hands. If you have a little time, I have a route for you.',
  ivo: 'Ivo: Good tools earn their shelf space. Have a look at the bench, or help me put something back in service.',
  workshop: 'Ivo’s bench carries service tools, charge cells, and practical upgrades.',
  sana: 'Sana: Sit if you need a minute. Supplies are here, and there is always work that helps someone get home.',
  orin: 'Orin: Ask who keeps a place running, then make sure they get home at the end of the shift.',
  relay: 'The rooftop relay carries maintenance traffic across Switchback.',
  pump: 'Pressure gauges tremble beside the lower-works pump.',
  cache: 'Salvage tags and maintenance records fill the service cache.',
  archive: 'The district archive keeps a record of every maintenance order.',
  rescue: 'Tavi keeps one hand on the maintenance radio, listening for the rest of the shift.',
  clinic_drop: 'A clean counter waits for clinic deliveries.',
  market_drop: 'The market’s delivery board is crowded with handwritten names.',
  rooftop_drop: 'A weatherproof receiver box serves the homes above the street.',
  garden: 'The garden is quiet enough to hear the leaves move.',
  memorial: 'Small lamps illuminate the names of workers who kept the ward running.',
  grid_switch: 'The district bridge connects every feeder in Switchback Ward.',
};
