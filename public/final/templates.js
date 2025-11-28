export const t = {
  design:(d)=>`<div class="grid">
    <span class="badge">Avg internal: ${d ? d.avgInternalTemp.toFixed(1) : '—'} °C</span>
    <span class="badge">Mean annual external: ${d ? d.avgExternalAnnualTemp.toFixed(1) : '—'} °C</span>
    <span class="badge">Design external: ${d ? d.designExternalTemp.toFixed(1) : '—'} °C</span>
    <span class="badge">HDD: ${d ? d.heatingDegreeDays : '—'}</span>
  </div>`,
  details:(x)=>`<div class="grid">
    <span class="badge">Fabric: ${x.fabricW_str}</span>
    <span class="badge">Ventilation: ${x.ventW_str}</span>
    <span class="badge">Heat‑up: ${x.heatUp_str}</span>
    <span class="badge">Gains: ${x.gains_str}</span>
    <span class="badge">Net Peak: ${x.netPeak_str}</span>
  </div>`,
  table:(head, rows)=>`<table><thead><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`
};
