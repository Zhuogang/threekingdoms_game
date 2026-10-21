import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';

const source = `
import { createV03Game } from './src/v03/initial-state';
import { executeV03Command } from './src/v03/commands';
import { advanceV03 } from './src/v03/engine';
import { createJourney, advanceJourneyOneDay } from './src/v03/calendar';
import { ROUTE_BY_ID } from './src/v03/geography';
import { validateV03State } from './src/v03/platform/storage';

const output = {};
let j = createJourney({id:'audit-j',executionId:'audit-exec',ownerFactionId:'cao',route:ROUTE_BY_ID.get('changan--hanzhong'),sourceCityId:'hanzhong',destinationCityId:'changan',departureAbsoluteDay:0,manifest:{officerIds:[],troopCount:101,composition:{troopTypes:['infantry']},carriedFood:100,cargo:{}}});
for (let i=0;i<10;i++) j=advanceJourneyOneDay(j).journey;
output.fractionalRations={troops:101,days:10,expectedCharge:8,expectedRemainderMicro:80000,actualCharged:j.consumedFood,actualRemainderMicro:j.supplyRemainderMicro,reportedShortfall:j.accumulatedFoodShortfall};

const boundary=createV03Game('cao',481516); boundary.absoluteDay=29;
const ten=advanceV03(boundary,10);
output.monthPause={fromDay:29,requestedDays:10,expectedStopDay:30,actualStopDay:ten.state.absoluteDay,stoppedFor:ten.stoppedFor,monthEvents:ten.state.events.filter(e=>e.kind==='monthBoundary').map(e=>e.absoluteDay)};

function ack(s){s.events.forEach(e=>e.acknowledged=true);return s;}
function battleFixture(intent='conquer',militia=0){
 let s=createV03Game('cao',481516);
 if(militia){ const city=s.cities.find(c=>c.id==='xiapi'); city.factionId='liu'; city.garrisonTroops=1000+militia; const officer=s.officers.find(o=>o.id==='guanyu');officer.troopType='infantry';officer.troops=1000;officer.location={kind:'city',cityId:'xiapi'}; }
 let r=executeV03Command(s,{type:'issueCampaignDirective',sourceCityId:'puyang',targetCityId:'xiapi',intent,requestedTroops:700,requestedByDay:null});
 if(!r.ok)throw new Error(r.error);s=r.state;
 for(let i=0;i<120;i++){if(s.battles.some(b=>b.active&&b.attackerFactionId==='cao'))return s;s=advanceV03(ack(s),1).state;}
 throw new Error('No battle');
}
let raid=battleFixture('raid');let b=raid.battles.find(b=>b.active&&b.attackerFactionId==='cao');
let home=raid.cities.find(c=>c.id==='puyang'); const goldBefore=home.gold;
b.battleData.outcome={winner:'attacker',reason:'elimination'};
raid=advanceV03(ack(raid),1).state;b=raid.battles.find(x=>x.id===b.id);
let ret=raid.journeys.find(j=>j.kind==='return'&&j.ownerFactionId==='cao');
output.raidLoot={goldBefore,goldImmediatelyAfter:raid.cities.find(c=>c.id==='puyang').gold,lootGold:b.loot.gold,returnCargoGold:ret.manifest.cargo.gold,returnElapsedAtCreation:ret.elapsedDays,expectedElapsedAtCreation:0};

try {let mil=battleFixture('conquer',100);let mb=mil.battles.find(b=>b.active&&b.attackerFactionId==='cao');
output.militiaIds={unitIds:mb.battleData.units.map(u=>u.id),uniqueIds:new Set(mb.battleData.units.map(u=>u.id)).size,units:mb.battleData.units.length,saveValid:validateV03State(mil)};} catch(e) {output.militiaIds={infantryOfficerTroops:1000,additionalMilitia:100,error:e.message};}

let non=battleFixture();let nb=non.battles.find(b=>b.active);non.playerFactionId='sun';non.playerCapitalCityId=non.factions.find(f=>f.id==='sun').capitalCityId;non.factions.forEach(f=>f.isPlayer=f.id==='sun');nb.battleData.playerSide='defender';
const defender=nb.battleData.units.find(u=>u.side==='defender');
const unauthorized=executeV03Command(non,{type:'battleAction',battleId:nb.id,action:{type:'wait',unitId:defender.id}});
output.nonparticipantControl={player:non.playerFactionId,attacker:nb.attackerFactionId,defender:nb.defenderFactionId,commandAccepted:unauthorized.ok};

let full=createV03Game('cao',9);let target=full.cities.find(c=>c.id==='xuchang');target.gold=9999999;
let rq=executeV03Command(full,{type:'requestRequisition',sourceCityId:'chenliu',targetCityId:'xuchang',requested:{gold:200,food:0,troops:0},requestedByDay:null});
if(!rq.ok)throw new Error(rq.error);full=rq.state;
const shipment=full.journeys[0];for(let i=0;i<20;i++){if(full.journeys.find(j=>j.id===shipment.id).status==='delivered')break;full=advanceV03(ack(full),1).state;}
output.fullWarehouse={sentGold:200,targetGold:full.cities.find(c=>c.id==='xuchang').gold,journeyStatus:full.journeys.find(j=>j.id===shipment.id).status,orderStatus:full.requisitions[0].status,deliveredCargo:full.journeys.find(j=>j.id===shipment.id).deliveredCargo};

const corrupt=createV03Game('cao',9);corrupt.cities.find(c=>c.id!=='xuchang').pendingAppointment={governorId:'does-not-exist',effectiveDay:30};
output.pendingGovernorReference={unknownOfficer:'does-not-exist',acceptedByValidator:validateV03State(corrupt)};
export default output;
`;
const bundle = await build({
  stdin: { contents: source, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
});
const { default: results } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
).catch((e) => {
  console.error(e.message);
  process.exit(1);
});
const report = {
  date: '2026-10-21',
  scope: 'Read-only targeted diagnostics of the local v0.3 candidate; no production-source changes',
  results,
};
mkdirSync('.artifacts/v03-audit', { recursive: true });
writeFileSync('.artifacts/v03-audit/reproductions.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
