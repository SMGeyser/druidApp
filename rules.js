export const ABILITIES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
export const SLOTS = [[],[2],[3],[4,2],[4,3],[4,3,2],[4,3,3],[4,3,3,1],[4,3,3,2],[4,3,3,3,1],[4,3,3,3,2],[4,3,3,3,2,1],[4,3,3,3,2,1],[4,3,3,3,2,1,1],[4,3,3,3,2,1,1],[4,3,3,3,2,1,1,1],[4,3,3,3,2,1,1,1],[4,3,3,3,2,1,1,1,1],[4,3,3,3,3,1,1,1,1],[4,3,3,3,3,2,1,1,1],[4,3,3,3,3,2,2,1,1]];
export const PREPARED = [0,4,5,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22];
export const mod = score => Math.floor((score - 10) / 2);
export const signed = n => n >= 0 ? `+${n}` : `${n}`;
export const crLabel = n => ({0.125:'⅛',0.25:'¼',0.5:'½'})[n] ?? String(n);
export function progression(level) {
  return { level, proficiency: 2 + Math.floor((level-1)/4), uses: level < 2 ? 0 : level >= 17 ? 4 : level >= 6 ? 3 : 2,
    known: level < 2 ? 0 : level >= 8 ? 8 : level >= 4 ? 6 : 4,
    maxCR: level < 2 ? 0 : level === 2 ? .25 : Math.floor(level/3),
    flight: level >= 8, tempHP: level < 2 ? 0 : level < 3 ? level : level*3, hours: level/2,
    slots: SLOTS[level], prepared: PREPARED[level], cantrips: level>=10?4:level>=4?3:2 };
}
export function eligibility(beast, level) {
  const p = progression(level);
  if (level < 2) return 'Unlocks at druid level 2';
  if (beast.name.startsWith('Swarm of')) return 'Swarms are not a single Beast form';
  if (beast.type.key !== 'beast') return 'Only Beast forms are eligible';
  if (beast.challenge_rating > 6) return 'Exceeds the Circle of the Moon limit (CR 6)';
  if (beast.challenge_rating > p.maxCR) return `Requires druid level ${Math.max(3, beast.challenge_rating*3)}`;
  if (beast.speed.fly && !p.flight) return 'Flight unlocks at druid level 8';
  return null;
}
export function effectiveAC(beast, character) {
  return character.level >= 3 ? Math.max(beast.armor_class,13+mod(character.abilities.wisdom)) : beast.armor_class;
}
export function effectiveAbilities(beast, character) {
  return Object.fromEntries(ABILITIES.map((a,i)=>[a, i<3 ? beast.ability_scores[a] : character.abilities[a]]));
}
export function takeDamage(character, amount) {
  const absorbed = Math.min(character.tempHP, amount);
  const hp = Math.max(0, character.hp - (amount-absorbed));
  return { ...character, tempHP: character.tempHP-absorbed, hp, ...(hp===0 ? {active:null,concentration:''} : {}) };
}
export function transform(character, beast) {
  if (eligibility(beast,character.level) || !character.known.includes(beast.key) || character.uses <= 0 || character.hp <= 0) return null;
  return {...character, uses: character.uses-1, active:beast.key, shiftedAt:Date.now(), tempHP: Math.max(character.tempHP,progression(character.level).tempHP)};
}
export function rest(character, type) {
  const p=progression(character.level);
  if (type==='short') return {...character,uses:Math.min(p.uses,character.uses+1)};
  return {...character,hp:character.maxHP,tempHP:0,uses:p.uses,slots:[...p.slots],active:null,concentration:'',resurgenceUsed:false,moonSteps:Math.max(1,mod(character.abilities.wisdom))};
}
export const CIRCLE_SPELLS = {'Starry Wisp':3,'Cure Wounds':3,'Moonbeam':3,'Conjure Animals':5,'Fount of Moonlight':7,'Mass Cure Wounds':9};
export const isCircleSpell = (spell,level) => level >= (CIRCLE_SPELLS[spell.name] ?? Infinity);
export function canCastInForm(spell,level) {
  return isCircleSpell(spell,level) || (level >= 18 && !spell.material_consumed && !spell.material_cost);
}
