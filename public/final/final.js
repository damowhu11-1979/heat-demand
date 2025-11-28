import { fmtW, fmtKW, fmtWm2, fmtC, sum, readData } from './utils.js';
import { t } from './templates.js';

(function init(){
  const calc = readData();
  if(!calc){ document.getElementById('app').innerHTML = '<p class="warn">No data found. Please complete previous steps.</p>'; return; }

  // project/meta
  const ts = calc.project?.timestamp ? new Date(calc.project.timestamp).toLocaleDateString() : '';
  document.getElementById('projectMeta').textContent = [calc.project?.client, calc.project?.siteAddress, calc.project?.assessor, ts].filter(Boolean).join(' • ');
  document.getElementById('method').textContent = (calc.project && calc.project.methodVersion) || 'MIS3005‑D/EN12831‑1:2017';

  const fabricRows = [];
  const ventRows = [];
  const roomRows = [];
  let totalFabricW = 0, totalVentW = 0, totalGainsW = 0;

  for(const r of (calc.rooms||[])){
    const dT_ext = r.designTemp_C - calc.design.designExternalTemp;
    let roomFabricW = 0, roomVentW = 0, gains = Number(r.gains_W || 0);

    for(const e of (r.elements||[])){
      const dT = (e.adj === 'ground')
        ? (r.designTemp_C - calc.design.avgExternalAnnualTemp)
        : (e.adj === 'unheated')
          ? (r.designTemp_C - (e.unheatedTemp_C ?? calc.design.designExternalTemp))
          : dT_ext;
      const tb = (e.psi_WmK && e.length_m) ? e.psi_WmK * e.length_m * dT : 0;
      const u = Number(e.U_Wm2K || 0);
      const a = Number(e.area_m2 || 0);
      const w = (u * a * dT) + tb;
      roomFabricW += w;
      fabricRows.push(`<tr><td>${r.name}</td><td>${e.type}</td><td>${e.adj}</td><td>${a?a.toFixed(2):'—'}</td><td>${u?u.toFixed(3):'—'}</td><td>${tb?tb.toFixed(1):'—'}</td><td>${dT.toFixed(1)}</td><td>${w.toFixed(0)}</td></tr>`);
    }

    // ventilation per room
    const achBase = (r.infiltrationACH ?? calc.house?.infiltrationRateACH ?? 0);
    const vol = Number(r.volume_m3 || 0) || 1;
    const mvhr = calc.house?.mvhr;
    const supply_m3ph = (mvhr?.isPresent ? (mvhr.supply_m3ph || 0) : 0);
    const achSupply = supply_m3ph ? (supply_m3ph / vol) : 0; // m3/h divided by m3 = 1/h (ACH)
    const eta = mvhr?.efficiency ?? 0;
    const achEffective = achBase + (achSupply ? (achSupply * (1 - eta)) : 0);
    const roomVent = 0.33 * achEffective * vol * dT_ext;
    roomVentW = roomVent;

    ventRows.push(`<tr><td>${r.name}</td><td>${achBase ? 'Infiltration' : (mvhr?.isPresent?'MVHR':'Vent')}</td><td>${(achEffective).toFixed(2)}</td><td>${eta? (eta*100).toFixed(0)+'%':'—'}</td><td>${dT_ext.toFixed(1)}</td><td>${roomVent.toFixed(0)}</td></tr>`);

    const peak = roomFabricW + roomVentW - gains;
    roomRows.push(`<tr><td>${r.name}</td><td>${r.area_m2?.toFixed(1)??'—'}</td><td>${r.designTemp_C?.toFixed(1)??'—'}</td><td>${roomFabricW.toFixed(0)}</td><td>${roomVentW.toFixed(0)}</td><td>${gains.toFixed(0)}</td><td>${peak.toFixed(0)}</td><td data-room="${r.id}"></td></tr>`);

    totalFabricW += roomFabricW; totalVentW += roomVentW; totalGainsW += gains;
  }

  const heatUpPct = calc.heatUpAllowance_pct ?? 0;
  const totalPeakW = (totalFabricW + totalVentW - totalGainsW) * (1 + heatUpPct);
  const floorArea = Number(calc.house?.floorAreaTotal || 0) || 1;
  const wPerM2 = totalPeakW / floorArea;

  // Annual (display only, if upstream not present)
  const dT_design = (calc.design.avgInternalTemp - calc.design.designExternalTemp) || 1;
  const UA = totalFabricW / dT_design;
  const annualKWh = calc.annual_kWh ?? (calc.design.heatingDegreeDays ? (calc.design.heatingDegreeDays * 24 * UA / 1000) : null);

  // Summary
  document.getElementById('peakKW').textContent = fmtKW(totalPeakW);
  document.getElementById('wPerM2').textContent = fmtWm2(wPerM2);
  document.getElementById('annualKWh').textContent = annualKWh ? annualKWh.toFixed(0) + ' kWh' : '—';

  // Design & details
  document.getElementById('designConditions').innerHTML = t.design(calc.design);
  document.getElementById('calcDetails').innerHTML = t.details({
    fabricW_str: fmtW(totalFabricW),
    ventW_str: fmtW(totalVentW),
    heatUp_str: (heatUpPct*100).toFixed(0) + '%',
    gains_str: fmtW(totalGainsW),
    netPeak_str: fmtW(totalPeakW)
  });

  // Tables
  const headRoom = ['Room','Area m²','Design °C','Fabric W','Vent W','Gains W','Peak W','% of Total'];
  const headFabric = ['Room','Element','Adjacent','Area m²','U','Ψ×L','ΔT','W'];
  const headVent = ['Room','Type','ACH','Efficiency','ΔT','W'];
  document.getElementById('roomTable').innerHTML = t.table(headRoom, roomRows);
  document.getElementById('fabricTable').innerHTML = t.table(headFabric, fabricRows);
  document.getElementById('ventTable').innerHTML = t.table(headVent, ventRows);

  // compute % of total per room
  document.querySelectorAll('[data-room]').forEach(td =>{
    const w = Number(td.previousElementSibling.textContent); // peak W cell
    td.textContent = totalPeakW ? ((w/totalPeakW)*100).toFixed(1)+'%' : '—';
  });

  // print
  document.getElementById('btnPrint').addEventListener('click', ()=>window.print());
})();
