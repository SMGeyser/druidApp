import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { progression, eligibility, effectiveAC, effectiveAbilities, takeDamage, transform, rest, canCastInForm } from '../rules.js';

const beasts=JSON.parse(readFileSync(new URL('../data/beasts.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
const beast=name=>beasts.find(b=>b.name===name);
const character=()=>({level:6,hp:45,maxHP:45,tempHP:0,uses:3,slots:[4,3,3],abilities:{strength:10,dexterity:14,constitution:14,intelligence:12,wisdom:18,charisma:8},known:[beast('Brown Bear').key],active:null,concentration:'Moonbeam',resurgenceUsed:true});

test('Moon progression activates at 3, with all CR and resource thresholds',()=>{
  assert.deepEqual([1,2,3,5,6,8,9,17,18,20].map(l=>progression(l).maxCR),[0,.25,1,1,2,2,3,5,6,6]);
  assert.deepEqual([1,2,6,17,20].map(l=>progression(l).uses),[0,2,3,4,4]);
  assert.deepEqual([1,2,4,8].map(l=>progression(l).known),[0,4,6,8]);
  assert.equal(progression(2).tempHP,2);assert.equal(progression(3).tempHP,9);assert.equal(progression(20).tempHP,60);
  assert.equal(progression(3).hours,1.5);
});
test('flight is gated at level 8 even for CR 0 beasts',()=>{
  assert.match(eligibility(beast('Eagle'),7),/Flight/);assert.equal(eligibility(beast('Eagle'),8),null);
});
test('swimming is available at level 2; high CR and swarms are rejected',()=>{
  assert.equal(eligibility(beast('Octopus'),2),null);
  assert.match(eligibility(beast('Brown Bear'),2),/level 3/);
  assert.match(eligibility(beast('Swarm of Rats'),6),/single Beast/);
  assert.match(eligibility(beast('Tyrannosaurus Rex'),20),/limit/);
});
test('Moon AC uses the higher value; normal druid keeps Beast AC',()=>{
  const c=character();assert.equal(effectiveAC(beast('Brown Bear'),c),17);
  assert.equal(effectiveAC({...beast('Brown Bear'),armor_class:20},c),20);
  assert.equal(effectiveAC(beast('Brown Bear'),{...c,level:2}),11);
});
test('physical scores change while mental scores are retained',()=>{
  const c=character(),b=beast('Brown Bear'),a=effectiveAbilities(b,c);
  assert.equal(a.strength,b.ability_scores.strength);assert.equal(a.wisdom,18);assert.equal(a.intelligence,12);
});
test('transformation consumes one use, retains HP and concentration, and grants nonstacking temp HP',()=>{
  const c=character(),next=transform(c,beast('Brown Bear'));
  assert.equal(next.uses,2);assert.equal(next.hp,45);assert.equal(next.tempHP,18);assert.equal(next.concentration,'Moonbeam');
  assert.equal(transform({...c,tempHP:25},beast('Brown Bear')).tempHP,25);
  assert.equal(c.uses,3);
});
test('transformation rejects unknown, locked, depleted, and zero-HP states',()=>{
  assert.equal(transform(character(),beast('Dire Wolf')),null);
  assert.equal(transform({...character(),uses:0},beast('Brown Bear')),null);
  assert.equal(transform({...character(),hp:0},beast('Brown Bear')),null);
  assert.equal(transform({...character(),level:2},beast('Brown Bear')),null);
});
test('damage exhausts temp HP first, then character HP; temp HP loss does not revert',()=>{
  const c={...character(),tempHP:18,active:beast('Brown Bear').key};
  const partial=takeDamage(c,10);assert.equal(partial.tempHP,8);assert.equal(partial.hp,45);
  const overflow=takeDamage(c,23);assert.equal(overflow.tempHP,0);assert.equal(overflow.hp,40);assert.equal(overflow.active,c.active);
  const down=takeDamage(c,100);assert.equal(down.hp,0);assert.equal(down.active,null);assert.equal(down.concentration,'');
});
test('short rest restores exactly one use and preserves other resources',()=>{
  const c={...character(),uses:0,hp:20,slots:[1,0,0]};const next=rest(c,'short');
  assert.equal(next.uses,1);assert.equal(next.hp,20);assert.deepEqual(next.slots,[1,0,0]);
  assert.equal(rest(character(),'short').uses,3);
});
test('long rest resets HP, spell slots and subclass resources',()=>{
  const c={...character(),hp:1,tempHP:18,uses:0,slots:[0,0,0],active:beast('Brown Bear').key};const next=rest(c,'long');
  assert.equal(next.hp,45);assert.equal(next.tempHP,0);assert.equal(next.uses,3);assert.deepEqual(next.slots,[4,3,3]);
  assert.equal(next.active,null);assert.equal(next.concentration,'');assert.equal(next.resurgenceUsed,false);assert.equal(next.moonSteps,4);
});
test('only unlocked circle spells can be cast in form until Beast Spells',()=>{
  assert.equal(canCastInForm({name:'Cure Wounds'},3),true);
  assert.equal(canCastInForm({name:'Conjure Animals'},3),false);
  assert.equal(canCastInForm({name:'Call Lightning'},17),false);
  assert.equal(canCastInForm({name:'Call Lightning'},18),true);
  assert.equal(canCastInForm({name:'Revivify',material_consumed:true},18),false);
  assert.equal(canCastInForm({name:'Greater Restoration',material_cost:'100'},18),false);
});
test('bundled form records are exclusively SRD 5.2 Beasts with complete core statistics',()=>{
  for(const b of beasts){assert.equal(b.document.key,'srd-2024');assert.equal(b.type.key,'beast');assert.ok(Number.isFinite(b.armor_class));assert.ok(b.actions);assert.ok(Number.isFinite(b.challenge_rating));}
  assert.ok(beasts.length>80);
});
