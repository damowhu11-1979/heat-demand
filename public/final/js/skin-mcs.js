// public/final/js/skin-mcs.js
function fmt(n, dp=0){ if(n==null||!isFinite(n)) return '–'; const f = Number(n).toFixed(dp); return (+f).toLocaleString(); }

function ready(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded',fn); }

ready(() => {
  // final.js should stash numbers in window.finalCalc; if not, we try to pick from DOM your script wrote.
  const FC = window.finalCalc || {};

  // KPIs
  const peakKw = FC.peak_kW ?? FC.peak_W/1000 ?? null;
  const wm2    = FC.w_per_m2 ?? null;
  const kwh    = FC.annual_kWh ?? null;
  const method = FC.method ?? 'MIS 3005-D / EN 12831-1:2017';

  // Meta date
  const d = new Date(); const stamp = d.toLocaleString();
  const meta = document.getElementById('metaDate'); if(meta) meta.textContent = stamp;

  const byId = id => document.getElementById(id);
  if(byId('kpiPeak')) byId('kpiPeak').textContent = fmt(peakKw,1);
  if(byId('kpiWm2'))  byId('kpiWm2').textContent  = fmt(wm2,1);
  if(byId('kpiKwh'))  byId('kpiKwh').textContent  = fmt(kwh,0);

  // Design Conditions
  if(byId('dcAvgInt'))    byId('dcAvgInt').textContent    = fmt(FC.design?.avgInternalTemp ?? FC.avgInternalC,1);
  if(byId('dcAvgExt'))    byId('dcAvgExt').textContent    = fmt(FC.design?.avgExternalAnnualTemp ?? FC.avgExtAnnualC,1);
  if(byId('dcDesignExt')) byId('dcDesignExt').textContent = fmt(FC.design?.designExternalTemp ?? FC.designExternalC,1);
  if(byId('dcHdd'))       byId('dcHdd').textContent       = fmt(FC.design?.heatingDegreeDays ?? FC.heatingDegreeDays,0);

  // Calculation details
  if(byId('cdFabric'))    byId('cdFabric').textContent    = fmt(FC.fabric_W ?? FC.qFabric_W,0);
  if(byId('cdVent'))      byId('cdVent').textContent      = fmt(FC.vent_W ?? FC.qVent_W,0);
  if(byId('cdHeatUp'))    byId('cdHeatUp').textContent    = fmt(FC.heatUp_W ?? FC.qHeatUp_W,0);
  if(byId('cdGains'))     byId('cdGains').textContent     = fmt(FC.gains_W ?? 0,0);
  if(byId('cdSpaceLoad')) byId('cdSpaceLoad').textContent = fmt(FC.peak_W ?? FC.spaceHeating_W ?? null,0);

  // Tables (if final.js doesn’t already fill them)
  if((FC.rooms || []).length && document.getElementById('perRoomBody')?.children.length===0){
    const tbody = document.getElementById('perRoomBody');
    FC.rooms.forEach(r=>{
      const tr=document.createElement('tr');
      const wm2r = r.peak_W && r.area_m2 ? r.peak_W/r.area_m2 : null;
      tr.innerHTML = `
        <td>${r.name||''}</td>
        <td class="num">${fmt(r.area_m2,1)}</td>
        <td class="num">${fmt(r.designTemp_C,1)}</td>
        <td class="num">${fmt(r.peak_W||r.qTotal_W,0)}</td>
        <td class="num">${fmt(wm2r,1)}</td>
        <td class="num">${fmt(r.annual_kWh,0)}</td>`;
      tbody.appendChild(tr);
    });
  }

  // Fabric breakdown (adjacent spaces)
  if((FC.fabricByAdj || []).length && document.getElementById('fabricBody')?.children.length===0){
    const tbody=document.getElementById('fabricBody');
    FC.fabricByAdj.forEach(row=>{
      const tr=document.createElement('tr');
      tr.innerHTML = `
        <td>${row.adjLabel||row.adj||''}</td>
        <td>${row.description||''}</td>
        <td class="num">${fmt(row.adjTemp_C,1)}</td>
        <td class="num">${fmt(row.w,0)}</td>
        <td class="num">${fmt(row.share_pct,0)}%</td>`;
      tbody.appendChild(tr);
    });
  }

  // Vent breakdown
  if((FC.ventByZone || []).length && document.getElementById('ventBody')?.children.length===0){
    const tbody=document.getElementById('ventBody');
    FC.ventByZone.forEach(z=>{
      const tr=document.createElement('tr');
      tr.innerHTML=`
        <td>${z.name||''}</td>
        <td class="num">${fmt(z.volume_m3,1)}</td>
        <td class="num">${fmt(z.extArea_m2,1)}</td>
        <td class="num">${fmt(z.permeability_m3_m2h,1)}</td>
        <td class="num">${fmt(z.w,0)}</td>
        <td class="num">${fmt(z.share_pct,0)}%</td>`;
      tbody.appendChild(tr);
    });
  }
});/* ---- Persistent brand logo (localStorage) ---- */
(function logoPersistence(){
  const KEY = 'mcs.brand.logoDataUrl';         // where we persist
  const img = document.getElementById('brandLogo');
  const file = document.getElementById('logoFile');
  const pick = document.getElementById('btnLogoPick');
  const reset = document.getElementById('btnLogoReset');

  // 1) Load persisted logo (if any)
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && /^data:image\//.test(saved)) img.src = saved;
  } catch {}

  // 2) Pick new logo
  pick?.addEventListener('click', () => file?.click());
  file?.addEventListener('change', () => {
    const f = file.files && file.files[0];
    if (!f) return;

    if (!/^image\/(png|jpeg|svg\+xml)$/.test(f.type)) {
      alert('Please choose a PNG, JPG, or SVG file.'); return;
    }
    // Size guard (adjust if you want larger)
    if (f.size > 512 * 1024) { // 512 KB
      alert('Logo is larger than 512 KB. Please use a smaller image.'); return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (!/^data:image\//.test(dataUrl)) { alert('Invalid image.'); return; }
      try { localStorage.setItem(KEY, dataUrl); } catch (e) {
        alert('Could not save logo (storage full or blocked). It will display this session only.');
      }
      img.src = dataUrl;
      // Clear the file input to allow re-uploading the same file if desired
      file.value = '';
    };
    reader.readAsDataURL(f);
  });

  // 3) Reset to default
  reset?.addEventListener('click', () => {
    try { localStorage.removeItem(KEY); } catch {}
    img.src = 'assets/logo.svg';
  });
})();

